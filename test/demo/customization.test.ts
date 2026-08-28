/**
 * What an organizer can change from the screen, and what the engine does with
 * it.
 *
 * These exist because an audit of demo mode found the engine to be more
 * capable than the UI admitted. `seedBrackets` takes a list of tiers and has a
 * whole suite behind it (`test/scheduling/bracket-shapes.test.ts`) covering
 * silver and bronze draws — and the demo hard-coded `['gold']`, so a
 * capability that was built and tested was invisible to anybody looking at the
 * app. `computeStandings` takes `splitSetsDecidedByTotalPoints` and the demo
 * never varied it.
 *
 * The rule these assertions encode: an engine option that exists and is tested
 * should be reachable from the UI, and reachable *correctly* — a control that
 * silently does nothing is worse than no control.
 */

import { describe, expect, it } from 'vitest';
import { PLAYOFF_SETS, POOL_PLAY_SETS, setsWon } from '@/lib/core';
import {
  buildLeagueDemo,
  buildTournamentDemo,
  parseLeagueConfig,
  parseTournamentConfig,
  poolSetsFor,
  winnerSide,
} from '@/lib/demo';

const tournament = (over: Record<string, string> = {}) =>
  parseTournamentConfig({ teams: '12', pools: '3', courts: '3', slots: '10', ...over });

describe('bracket tiers', () => {
  it('runs a single gold bracket by default', () => {
    const demo = buildTournamentDemo(tournament());
    expect(demo.brackets.map((b) => b.tier)).toEqual(['gold']);
    expect(demo.brackets[0]?.matches).toHaveLength(8);
  });

  it('gives the teams who missed gold a silver bracket of their own', () => {
    // Twelve teams: eight qualify for gold, and the other four would otherwise
    // go home after pool play. A silver draw is the whole reason tiers exist.
    const demo = buildTournamentDemo(tournament({ tiers: '2' }));
    expect(demo.brackets.map((b) => b.tier)).toEqual(['gold', 'silver']);

    const idsIn = (tier: string) =>
      new Set(
        (demo.brackets.find((b) => b.tier === tier)?.matches ?? [])
          .flatMap((m) => [m.homeParticipantId, m.awayParticipantId])
          .filter((id): id is string => Boolean(id)),
      );

    const gold = idsIn('gold');
    const silver = idsIn('silver');
    expect(gold.size).toBe(8);
    expect(silver.size).toBe(4);
    // Nobody plays in two brackets at once.
    for (const id of silver) expect(gold.has(id), `${id} is in both tiers`).toBe(false);
  });

  it('fills three brackets when the field is big enough', () => {
    const demo = buildTournamentDemo(tournament({ teams: '24', pools: '4', tiers: '3' }));
    expect(demo.brackets.map((b) => b.tier)).toEqual(['gold', 'silver', 'bronze']);
    for (const bracket of demo.brackets) expect(bracket.matches).toHaveLength(8);
  });

  it('drops a tier the field cannot fill rather than showing an empty draw', () => {
    // Twelve teams fill gold and silver and leave nothing for bronze. An empty
    // bracket on screen reads as a bug, or worse, as a draw nobody was told
    // about.
    const demo = buildTournamentDemo(tournament({ teams: '12', tiers: '3' }));
    expect(demo.brackets.map((b) => b.tier)).toEqual(['gold', 'silver']);
  });

  it('plays every tier through to its own champion', () => {
    const demo = buildTournamentDemo(tournament({ tiers: '2', stage: 'final' }));
    expect(demo.brackets).toHaveLength(2);
    for (const bracket of demo.brackets) {
      expect(bracket.champion, `${bracket.tier} has no champion`).not.toBeNull();
      const final = bracket.matches.find((m) => m.roundLabel === 'final');
      expect(final?.status).toBe('final');
    }
    // The two tiers are won by different teams, because no team is in both.
    const [gold, silver] = demo.brackets;
    expect(gold?.champion?.id).not.toBe(silver?.champion?.id);
  });

  it('keeps every tier reproducible from the same config', () => {
    const once = buildTournamentDemo(tournament({ tiers: '3', teams: '24', stage: 'final' }));
    const twice = buildTournamentDemo(tournament({ tiers: '3', teams: '24', stage: 'final' }));
    expect(JSON.stringify(twice.brackets)).toEqual(JSON.stringify(once.brackets));
  });
});

describe('the split-set rule', () => {
  /** Pool matches that ended 1-1 on sets. */
  const splitCount = (matches: { status: string; sets: unknown[] }[]) =>
    matches.filter((m) => {
      const sets = setsWon(m as never);
      return m.status === 'final' && sets.home === sets.away;
    }).length;

  it('decides a 1-1 pool match on total points by default', () => {
    const demo = buildTournamentDemo(tournament());
    expect(splitCount(demo.poolMatches)).toBeGreaterThan(0);
    // Every team's record accounts for all three of its pool matches.
    for (const standings of Object.values(demo.standingsByPool)) {
      for (const row of standings) expect(row.wins + row.losses).toBe(3);
    }
  });

  it('leaves a 1-1 pool match undecided when the rule is turned off', () => {
    const demo = buildTournamentDemo(tournament({ split: '0' }));
    const splits = splitCount(demo.poolMatches);
    expect(splits).toBeGreaterThan(0);

    // Turning the rule off cannot change which matches were played, only how
    // they are counted.
    const played = demo.poolMatches.filter((m) => m.status === 'final').length;
    expect(played).toBe(18);

    const decided = Object.values(demo.standingsByPool)
      .flat()
      .reduce((sum, row) => sum + row.wins + row.losses, 0);
    // Each decided match contributes one win and one loss; the splits contribute
    // nothing at all.
    expect(decided).toBe((played - splits) * 2);
  });

  it('applies to a league table too', () => {
    const on = buildLeagueDemo(parseLeagueConfig({ teams: '8', weeks: '7', played: '7' }));
    const off = buildLeagueDemo(
      parseLeagueConfig({ teams: '8', weeks: '7', played: '7', split: '0' }),
    );
    const games = (demo: typeof on) =>
      demo.standings.reduce((sum, row) => sum + row.wins + row.losses, 0);
    expect(games(off)).toBeLessThan(games(on));
  });
});

describe('scoring presets', () => {
  /**
   * `POOL_PLAY_SETS` and `PLAYOFF_SETS` were declared in core and read by
   * nothing — a scoring format that looked configurable and was not. The demo
   * now generates its scorelines from them, so editing those constants is a
   * real customization rather than a comment.
   */
  it('scores pool play to the pool preset, within its cap', () => {
    const demo = buildTournamentDemo(tournament());
    const played = demo.poolMatches.filter((m) => m.status === 'final');
    expect(played.length).toBeGreaterThan(0);

    for (const match of played) {
      expect(match.sets).toHaveLength(POOL_PLAY_SETS.length);
      for (const [i, set] of match.sets.entries()) {
        const rule = POOL_PLAY_SETS[i];
        if (!rule) throw new Error('missing rule');
        const high = Math.max(set.homePoints, set.awayPoints);
        const low = Math.min(set.homePoints, set.awayPoints);
        expect(high, `${match.id} set ${set.setNumber}`).toBe(rule.target);
        expect(high - low).toBeGreaterThanOrEqual(rule.winBy);
        if (rule.cap !== null) expect(high).toBeLessThanOrEqual(rule.cap);
      }
    }
  });

  it('scores the bracket to the playoff preset', () => {
    const demo = buildTournamentDemo(tournament({ stage: 'final' }));
    const played = (demo.brackets[0]?.matches ?? []).filter((m) => m.status === 'final');
    expect(played.length).toBeGreaterThan(0);

    for (const match of played) {
      for (const [i, set] of match.sets.entries()) {
        const rule = PLAYOFF_SETS[i];
        if (!rule) throw new Error('missing rule');
        const high = Math.max(set.homePoints, set.awayPoints);
        const low = Math.min(set.homePoints, set.awayPoints);
        expect(high, `${match.id} set ${set.setNumber}`).toBe(rule.target);
        expect(high - low).toBeGreaterThanOrEqual(rule.winBy);
      }
    }
  });

  it('never lets a bracket match end level on sets', () => {
    // advanceBracket throws on a tied elimination match, correctly — there is
    // no such thing. The scoring generator must never hand it one.
    const demo = buildTournamentDemo(tournament({ stage: 'final', tiers: '3', teams: '24' }));
    for (const bracket of demo.brackets) {
      for (const match of bracket.matches) {
        if (match.status !== 'final') continue;
        const sets = setsWon(match);
        expect(sets.home, `${match.id} ended level`).not.toBe(sets.away);
      }
    }
  });
});

describe('a set split, on set rules that are not identical', () => {
  /**
   * The split branch has to keep the designated winner ahead on total points,
   * because that is the only thing deciding the match. When the two sets are
   * played to the same target that is easy. When they are not — which is the
   * whole point of the rules being editable — a naive margin hands the match
   * to the wrong side, and a visitor flipping a result would get the opposite
   * of what they asked for.
   */
  const rules = (a: number, b: number) => [
    { target: a, winBy: 2, cap: null },
    { target: b, winBy: 2, cap: null },
  ];

  const totals = (sets: ReturnType<typeof poolSetsFor>) =>
    sets.reduce((acc, s) => ({ home: acc.home + s.homePoints, away: acc.away + s.awayPoints }), {
      home: 0,
      away: 0,
    });

  for (const [a, b] of [
    [21, 21],
    [21, 25],
    [25, 15],
    [15, 25],
  ] as const) {
    it(`keeps the winner ahead with sets to ${a} and ${b}`, () => {
      for (const id of ['m-1', 'm-2', 'm-3', 'm-4', 'm-5', 'm-6', 'm-7', 'm-8', 'm-9', 'm-10']) {
        for (const winner of ['home', 'away'] as const) {
          const sets = poolSetsFor(id, winner, rules(a, b));
          const shown = winnerSide({
            id,
            competitionId: 'c',
            sessionId: 's',
            status: 'final',
            sets,
          });
          expect(shown, `${id} to ${winner} on ${a}/${b}`).toBe(winner);

          const t = totals(sets);
          if (
            setsWon({ id, competitionId: 'c', sessionId: 's', status: 'final', sets }).home === 1
          ) {
            // A genuine 1-1 split: total points must break it the right way.
            expect(winner === 'home' ? t.home > t.away : t.away > t.home).toBe(true);
          }
        }
      }
    });
  }
});

describe('the new knobs survive the URL', () => {
  it('clamps the tier count to the brackets that exist', () => {
    expect(parseTournamentConfig({ tiers: '99' }).tiers).toBe(3);
    expect(parseTournamentConfig({ tiers: '0' }).tiers).toBe(1);
    expect(parseTournamentConfig({ tiers: 'gold' }).tiers).toBe(1);
  });

  it('defaults the split rule on, matching the engine default', () => {
    expect(parseTournamentConfig({}).splitByPoints).toBe(true);
    expect(parseLeagueConfig({}).splitByPoints).toBe(true);
    expect(parseTournamentConfig({ split: '0' }).splitByPoints).toBe(false);
  });
});
