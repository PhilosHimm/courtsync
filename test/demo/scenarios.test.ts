/**
 * Demo mode runs the real engine on invented data. These assertions hold it
 * to both halves of that sentence.
 *
 * The *real engine* half: the demo must not quietly reimplement scheduling.
 * Every claim below is checked against engine behaviour the suites in
 * `test/scheduling` already pin — a referee never playing in the match they
 * officiate, standings computed rather than kept, a corrected result
 * reshaping everything downstream of it.
 *
 * The *invented data* half: PRODUCT.md forbids presenting invented data as
 * real. Nothing here is dressed up as a record of something that happened,
 * and the ids carry a `demo-` prefix so a scenario copied out as JSON says
 * what it is wherever it ends up.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { setsWon } from '@/lib/core';
import {
  buildDropInDemo,
  buildLeagueDemo,
  buildTournamentDemo,
  DEMO_NOTICE,
  parseDropInConfig,
  parseLeagueConfig,
  parseTournamentConfig,
  winnerSide,
} from '@/lib/demo';

const tournamentConfig = (over: Record<string, string> = {}) =>
  parseTournamentConfig({ teams: '12', pools: '3', courts: '3', slots: '10', ...over });
const leagueConfig = (over: Record<string, string> = {}) =>
  parseLeagueConfig({ teams: '8', weeks: '7', courts: '2', slots: '2', played: '4', ...over });
const dropInConfig = (over: Record<string, string> = {}) =>
  parseDropInConfig({ registered: '22', capacity: '18', noshows: '2', rounds: '4', ...over });

describe('the demo layer', () => {
  it('says on every page that none of this is real', () => {
    expect(DEMO_NOTICE).toMatch(/invented/i);
    expect(DEMO_NOTICE).toMatch(/saved/i);
  });

  it('imports only the engine beneath it', () => {
    // src/lib never imports app code (CLAUDE.md, Architecture). The demo layer
    // sits between the two and is the easiest place to break that, because it
    // exists to be rendered.
    const dir = fileURLToPath(new URL('../../src/lib/demo/', import.meta.url));
    for (const file of readdirSync(dir)) {
      const source = readFileSync(`${dir}${file}`, 'utf8');
      const imports = [...source.matchAll(/from '([^']+)'/g)].map((m) => m[1] ?? '');
      for (const specifier of imports) {
        expect(specifier, `${file} imports ${specifier}`).not.toMatch(/@\/(app|components)/);
        // core/testing/fixtures says on its first line that application code
        // must never import it; its shapes are pinned by a model regression
        // suite and are not the demo's to bend.
        expect(specifier, `${file} imports ${specifier}`).not.toMatch(/testing\/fixtures/);
      }
    }
  });

  it('marks every invented entity as invented', () => {
    const demo = buildTournamentDemo(tournamentConfig());
    for (const participant of demo.participants) expect(participant.id).toMatch(/^demo-/);
    for (const court of demo.courts) expect(court.id).toMatch(/^demo-/);
    for (const slot of demo.timeslots) expect(slot.id).toMatch(/^demo-/);
    expect(demo.competition.id).toMatch(/^demo-/);
  });
});

describe('the tournament demo', () => {
  it('is reproducible, so a copied link shows what the sender saw', () => {
    const once = buildTournamentDemo(tournamentConfig({ stage: 'final' }));
    const twice = buildTournamentDemo(tournamentConfig({ stage: 'final' }));
    expect(JSON.stringify(twice)).toEqual(JSON.stringify(once));
  });

  it('schedules every pool match and gives each one a referee who is not playing', () => {
    const demo = buildTournamentDemo(tournamentConfig());
    // Three pools of four: three rounds of two matches each.
    expect(demo.poolMatches).toHaveLength(18);
    expect(demo.unassignedMatchIds).toEqual([]);
    expect(demo.unrefereedMatchIds).toEqual([]);
    for (const match of demo.poolMatches) {
      expect(match.refParticipantId).toBeTruthy();
      expect(match.refParticipantId).not.toBe(match.homeParticipantId);
      expect(match.refParticipantId).not.toBe(match.awayParticipantId);
    }
  });

  it('reports the matches a short day cannot hold rather than dropping them', () => {
    const demo = buildTournamentDemo(tournamentConfig({ slots: '2' }));
    expect(demo.unassignedMatchIds.length).toBeGreaterThan(0);
    // Still generated, just unplaced. An organizer needs to see what did not fit.
    expect(demo.poolMatches).toHaveLength(18);
  });

  it('has no standings and no bracket before anything is played', () => {
    const demo = buildTournamentDemo(tournamentConfig({ stage: 'draw' }));
    expect(demo.standingsByPool).toEqual({});
    expect(demo.brackets).toEqual([]);
    expect(demo.poolMatches.every((m) => m.status === 'scheduled')).toBe(true);
  });

  it('ranks each pool contiguously once results are in', () => {
    const demo = buildTournamentDemo(tournamentConfig());
    for (const [poolId, standings] of Object.entries(demo.standingsByPool)) {
      expect(
        standings.map((s) => s.rank),
        poolId,
      ).toEqual([1, 2, 3, 4]);
      for (const row of standings) expect(row.wins + row.losses).toBe(3);
    }
  });

  it('plays through to a single champion', () => {
    const demo = buildTournamentDemo(tournamentConfig({ stage: 'final' }));
    expect(demo.brackets[0]?.champion).not.toBeNull();
    const final = demo.brackets[0]?.matches.find((m) => m.roundLabel === 'final');
    expect(final?.status).toBe('final');
    expect(final).toBeDefined();
    const sets = setsWon(final!);
    expect(sets.home).not.toBe(sets.away);
  });

  it('reshapes the bracket when a quarterfinal result is corrected', () => {
    const config = tournamentConfig({ stage: 'final' });
    const asPlayed = buildTournamentDemo(config);
    const q1 = asPlayed.brackets[0]?.matches.find((m) => m.roundLabel === 'q1');
    expect(q1).toBeDefined();
    const q1Sets = setsWon(q1!);
    const flipped = q1Sets.home > q1Sets.away ? 'away' : 'home';

    // The everyday case: a score goes in wrong and is fixed ten minutes later.
    // Audit finding H14 was a bracket that kept the first answer anyway.
    const corrected = buildTournamentDemo(config, { [q1?.id ?? '']: flipped });
    const semiBefore = asPlayed.brackets[0]?.matches.find((m) => m.roundLabel === 's1');
    const semiAfter = corrected.brackets[0]?.matches.find((m) => m.roundLabel === 's1');
    expect(semiAfter?.homeParticipantId).not.toBe(semiBefore?.homeParticipantId);
  });

  it('never mutates the overrides it is handed', () => {
    const outcomes = { 'demo-open-gold-q1': 'home' as const };
    const frozen = JSON.stringify(outcomes);
    buildTournamentDemo(tournamentConfig({ stage: 'final' }), outcomes);
    expect(JSON.stringify(outcomes)).toBe(frozen);
  });
});

describe('the league demo', () => {
  it('is reproducible', () => {
    const once = buildLeagueDemo(leagueConfig());
    const twice = buildLeagueDemo(leagueConfig());
    expect(JSON.stringify(twice)).toEqual(JSON.stringify(once));
  });

  it('plays every team against every other exactly once', () => {
    const demo = buildLeagueDemo(leagueConfig());
    expect(demo.fixtures).toHaveLength((8 * 7) / 2);
    const pairs = new Set(
      demo.fixtures.map((m) => [m.homeParticipantId, m.awayParticipantId].sort().join('|')),
    );
    expect(pairs.size).toBe(28);
  });

  it('doubles the season when home and away is on', () => {
    const demo = buildLeagueDemo(leagueConfig({ legs: '2', weeks: '14' }));
    expect(demo.fixtures).toHaveLength(8 * 7);
  });

  it('counts only the weeks that have been played', () => {
    const demo = buildLeagueDemo(leagueConfig({ played: '3' }));
    const played = demo.fixtures.filter((m) => m.status === 'final');
    const games = demo.standings.reduce((sum, row) => sum + row.wins + row.losses, 0);
    // Every finished match contributes one win and one loss.
    expect(games).toBe(played.length * 2);
  });

  it('has a table of every team from week zero, all of them on nothing', () => {
    // A convener looks at the table before a ball is served. It should be the
    // whole league at 0-0, not an empty list.
    const demo = buildLeagueDemo(leagueConfig({ played: '0' }));
    expect(demo.standings).toHaveLength(8);
    for (const row of demo.standings) expect(row.wins + row.losses).toBe(0);
  });

  it('shows which fixtures the weekly grid could not hold', () => {
    // Four fixtures a week need four slots; one court and one slot holds one.
    const demo = buildLeagueDemo(leagueConfig({ courts: '1', slots: '1' }));
    expect(demo.unscheduled.length).toBeGreaterThan(0);
  });
});

describe('the drop-in demo', () => {
  it('is reproducible', () => {
    const once = buildDropInDemo(dropInConfig());
    const twice = buildDropInDemo(dropInConfig());
    expect(JSON.stringify(twice)).toEqual(JSON.stringify(once));
  });

  it('waitlists everyone past the cap, in sign-up order', () => {
    const demo = buildDropInDemo(dropInConfig({ noshows: '0' }));
    const waitlisted = demo.attendance.filter((a) => a.status === 'waitlist');
    expect(waitlisted).toHaveLength(22 - 18);
    expect(waitlisted.map((a) => a.waitlistPos)).toEqual([1, 2, 3, 4]);
  });

  it('promotes exactly as many as the no-shows freed, and renumbers the rest', () => {
    const demo = buildDropInDemo(dropInConfig({ noshows: '2' }));
    expect(demo.promoted).toHaveLength(2);
    expect(demo.promoted.map((p) => p.fromPosition)).toEqual([1, 2]);
    const stillWaiting = demo.attendance.filter((a) => a.status === 'waitlist');
    expect(stillWaiting.map((a) => a.waitlistPos)).toEqual([1, 2]);
  });

  it('does not put a promoted player on court until they have checked in', () => {
    const config = dropInConfig({ noshows: '4' });
    const waiting = buildDropInDemo(config);
    const promotedId = waiting.promoted[0]?.participantId ?? '';
    const onCourt = (demo: typeof waiting) =>
      demo.rotation.sides.some(
        (side) =>
          side.home.participantIds.includes(promotedId) ||
          side.away.participantIds.includes(promotedId),
      );

    expect(onCourt(waiting)).toBe(false);
    expect(onCourt(buildDropInDemo({ ...config, checkInPromoted: true }))).toBe(true);
  });

  it('never puts the same player on two courts in one round', () => {
    const demo = buildDropInDemo(dropInConfig({ rounds: '5', courts: '2', side: '4' }));
    for (const timeslot of demo.timeslots) {
      const onCourt = demo.rotation.matches
        .filter((m) => m.timeslotId === timeslot.id)
        .flatMap((m) => {
          const side = demo.rotation.sides.find((s) => s.matchId === m.id);
          return [...(side?.home.participantIds ?? []), ...(side?.away.participantIds ?? [])];
        });
      expect(new Set(onCourt).size).toBe(onCourt.length);
    }
  });

  it('shares the sit-outs out rather than benching the same people all night', () => {
    const demo = buildDropInDemo(
      dropInConfig({ registered: '20', capacity: '20', noshows: '0', rounds: '5' }),
    );
    const counts = Object.values(demo.sitOutCounts);
    expect(counts).toHaveLength(20);
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
  });
});

describe('the winner a demo board shows', () => {
  /**
   * `computeStandings` awards a 1-1 pool match on total points and the board
   * has to agree with it. A screen that leaves the match looking undecided
   * while the table above it has already given somebody the win is the same
   * class of problem as a stored standings row: two places telling a reader
   * different things about one result.
   */
  it('follows the table on a set split decided by total points', () => {
    const demo = buildTournamentDemo(tournamentConfig());
    const splits = demo.poolMatches.filter((match) => {
      const sets = setsWon(match);
      return match.status === 'final' && sets.home === sets.away;
    });

    // The generator produces these on purpose; if it stops, this assertion is
    // no longer testing anything.
    expect(splits.length).toBeGreaterThan(0);

    for (const match of splits) {
      const shown = winnerSide(match);
      expect(shown, `${match.id} is shown as undecided`).not.toBeNull();

      const pool = demo.pools.find((p) => p.id === match.poolId);
      const standings = demo.standingsByPool[pool?.id ?? ''] ?? [];
      const winnerId = shown === 'home' ? match.homeParticipantId : match.awayParticipantId;
      const loserId = shown === 'home' ? match.awayParticipantId : match.homeParticipantId;
      const winnerRow = standings.find((row) => row.participantId === winnerId);
      const loserRow = standings.find((row) => row.participantId === loserId);

      // The board's winner is the one the table counted a win for.
      expect(winnerRow?.wins ?? 0).toBeGreaterThan(0);
      expect(loserRow?.losses ?? 0).toBeGreaterThan(0);
    }
  });

  it('does not award a bracket match on total points', () => {
    // Playoffs have a decider, so a set split is not a result there. Passing
    // false says which competition's rules the screen is showing rather than
    // relying on playoffSets happening to be decisive.
    const tied = {
      id: 'x',
      competitionId: 'c',
      sessionId: 's',
      status: 'final' as const,
      sets: [
        { id: 'a', matchId: 'x', setNumber: 1, homePoints: 25, awayPoints: 20 },
        { id: 'b', matchId: 'x', setNumber: 2, homePoints: 18, awayPoints: 25 },
      ],
    };
    expect(winnerSide(tied, false)).toBeNull();
    expect(winnerSide(tied, true)).toBe('away');
  });
});
