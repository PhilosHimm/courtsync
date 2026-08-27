/**
 * End-to-end flows through the scheduling engine.
 *
 * Every function has its own suite, but those all call one function in
 * isolation with hand-built input. These run a whole competition the way the
 * app will have to: the output of one step is the input to the next. That is
 * where interface seams show up — a shape that looks right in a unit test and
 * does not actually fit the next function along.
 */

import type { Match, Participant, Session, Standing } from '@courtsync/core';
import { describe, expect, it } from 'vitest';
import { generateDropInRotation } from '../src/dropin-rotation';
import { generateLeagueFixtures } from '../src/league-fixtures';
import { generatePoolPlay } from '../src/pool-play';
import { assignReferees } from '../src/referees';
import { advanceBracket, type SeededMatch, seedBrackets } from '../src/seeding';
import { computeStandings } from '../src/standings';

const SLUG = 'spring-open';
const SESSION = 'sess-1';

const participant = (id: string): Participant => ({
  id,
  competitionId: 'comp-1',
  kind: 'team',
  name: id.toUpperCase(),
  registeredAt: '2026-01-01T00:00:00Z',
});

/**
 * Deterministic results so the flow is reproducible: the participant whose id
 * sorts first wins in straight sets. No clock, no randomness.
 */
function playMatch(match: Match): Match {
  const home = match.homeParticipantId;
  const away = match.awayParticipantId;
  if (!home || !away) return match;
  const homeWins = home < away;
  return {
    ...match,
    status: 'final',
    sets: [1, 2].map((setNumber) => ({
      id: `${match.id}-s${setNumber}`,
      matchId: match.id,
      setNumber,
      homePoints: homeWins ? 21 : 15,
      awayPoints: homeWins ? 15 : 21,
    })),
  };
}

function toBracketMatch(seeded: SeededMatch): Match {
  return {
    id: seeded.matchId,
    competitionId: 'comp-1',
    sessionId: SESSION,
    poolId: null,
    courtId: null,
    timeslotId: null,
    homeParticipantId: seeded.homeParticipantId,
    awayParticipantId: seeded.awayParticipantId,
    refParticipantId: null,
    bracket: seeded.tier,
    roundLabel: seeded.slot,
    status: 'scheduled',
    sets: [],
  };
}

describe('a full tournament, start to champion', () => {
  const poolA = ['a1', 'a2', 'a3', 'a4'];
  const poolB = ['b1', 'b2', 'b3', 'b4'];
  const participants = [...poolA, ...poolB].map(participant);

  const scheduled = generatePoolPlay({
    competitionSlug: SLUG,
    sessionId: SESSION,
    pools: [
      { id: 'pool-a', name: 'A', participantIds: poolA },
      { id: 'pool-b', name: 'B', participantIds: poolB },
    ],
    courtIds: ['court-1', 'court-2'],
    timeslotIds: Array.from({ length: 12 }, (_, i) => `ts-${i + 1}`),
    minRestSlots: 1,
  });

  const refereed = assignReferees({
    matches: scheduled.matches,
    pools: [
      { id: 'pool-a', name: 'A', participantIds: poolA },
      { id: 'pool-b', name: 'B', participantIds: poolB },
    ],
    allParticipantIds: [...poolA, ...poolB],
  });

  const played = refereed.matches.map(playMatch);

  const standingsFor = (poolId: string, ids: string[]): Standing[] =>
    computeStandings({
      participants: participants.filter((p) => ids.includes(p.id)),
      matches: played.filter((m) => m.poolId === poolId),
    });

  const standingsByPool = {
    'pool-a': standingsFor('pool-a', poolA),
    'pool-b': standingsFor('pool-b', poolB),
  };

  it('schedules and referees every pool match', () => {
    expect(scheduled.matches).toHaveLength(12);
    expect(scheduled.unassigned).toEqual([]);
    expect(refereed.unassigned).toEqual([]);
    for (const m of refereed.matches) {
      expect(m.refParticipantId).toBeTruthy();
      expect(m.refParticipantId).not.toBe(m.homeParticipantId);
      expect(m.refParticipantId).not.toBe(m.awayParticipantId);
    }
  });

  it('produces a complete standings table per pool', () => {
    for (const standings of Object.values(standingsByPool)) {
      expect(standings).toHaveLength(4);
      // Every team plays the other three.
      for (const row of standings) expect(row.wins + row.losses).toBe(3);
      expect(standings.map((s) => s.rank)).toEqual([1, 2, 3, 4]);
    }
  });

  it('seeds a bracket whose quarterfinals never repeat a pool matchup', () => {
    const seeded = seedBrackets({
      competitionSlug: SLUG,
      sessionId: SESSION,
      standingsByPool,
      tiers: ['gold'],
    });

    const quarters = seeded.filter((s) => s.slot.startsWith('q'));
    expect(quarters).toHaveLength(4);

    for (const q of quarters) {
      const home = q.homeParticipantId;
      const away = q.awayParticipantId;
      expect(home).toBeTruthy();
      expect(away).toBeTruthy();
      const samePool =
        (poolA.includes(home ?? '') && poolA.includes(away ?? '')) ||
        (poolB.includes(home ?? '') && poolB.includes(away ?? ''));
      expect(samePool, `${home} v ${away} is a pool rematch`).toBe(false);
    }

    // Everyone who qualified appears exactly once in the first round.
    const drawn = quarters.flatMap((q) => [q.homeParticipantId, q.awayParticipantId]);
    expect(new Set(drawn).size).toBe(8);
  });

  it('advances through the bracket to a single champion', () => {
    const seeded = seedBrackets({
      competitionSlug: SLUG,
      sessionId: SESSION,
      standingsByPool,
      tiers: ['gold'],
    });

    let bracket = seeded.map(toBracketMatch);

    // Play each round, advancing after every one, exactly as the app would.
    for (const round of [
      ['q1', 'q2', 'q3', 'q4'],
      ['s1', 's2'],
      ['final', 'consolation'],
    ]) {
      bracket = bracket.map((m) => (round.includes(m.roundLabel ?? '') ? playMatch(m) : m));
      bracket = advanceBracket({ competitionSlug: SLUG, tier: 'gold', matches: bracket });
    }

    const final = bracket.find((m) => m.roundLabel === 'final');
    expect(final?.status).toBe('final');
    expect(final?.homeParticipantId).toBeTruthy();
    expect(final?.awayParticipantId).toBeTruthy();

    // The two finalists came from opposite halves, so they never met earlier.
    const semiWinners = ['s1', 's2'].map((slot) => {
      const semi = bracket.find((m) => m.roundLabel === slot);
      const home = semi?.homeParticipantId;
      const away = semi?.awayParticipantId;
      return home && away ? (home < away ? home : away) : null;
    });
    expect([final?.homeParticipantId, final?.awayParticipantId].sort()).toEqual(
      [...semiWinners].sort(),
    );

    // The third-place match is contested by the two beaten semi-finalists.
    const consolation = bracket.find((m) => m.roundLabel === 'consolation');
    expect(consolation?.homeParticipantId).toBeTruthy();
    expect(consolation?.awayParticipantId).toBeTruthy();
    expect(semiWinners).not.toContain(consolation?.homeParticipantId);
    expect(semiWinners).not.toContain(consolation?.awayParticipantId);
  });

  it('re-advancing a corrected quarterfinal reaches a different final', () => {
    const seeded = seedBrackets({
      competitionSlug: SLUG,
      sessionId: SESSION,
      standingsByPool,
      tiers: ['gold'],
    });

    const asPlayed = advanceBracket({
      competitionSlug: SLUG,
      tier: 'gold',
      matches: seeded
        .map(toBracketMatch)
        .map((m) => (m.roundLabel?.startsWith('q') ? playMatch(m) : m)),
    });
    const firstSemi = asPlayed.find((m) => m.roundLabel === 's1');

    // Reverse q1: the loser actually won. This is the everyday case of a
    // score being entered wrong and corrected ten minutes later.
    const corrected = advanceBracket({
      competitionSlug: SLUG,
      tier: 'gold',
      matches: asPlayed.map((m) =>
        m.roundLabel === 'q1'
          ? {
              ...m,
              sets: m.sets.map((s) => ({
                ...s,
                homePoints: s.awayPoints,
                awayPoints: s.homePoints,
              })),
            }
          : m,
      ),
    });
    const correctedSemi = corrected.find((m) => m.roundLabel === 's1');

    expect(correctedSemi?.homeParticipantId).not.toBe(firstSemi?.homeParticipantId);
  });
});

describe('a full league season', () => {
  const teams = ['t1', 't2', 't3', 't4', 't5', 't6'];
  const participants = teams.map(participant);
  const sessions: Session[] = Array.from({ length: 5 }, (_, i) => ({
    id: `wk-${i + 1}`,
    competitionId: 'comp-1',
    name: `Week ${i + 1}`,
    playDate: `2026-01-${String(6 + i * 7).padStart(2, '0')}`,
    startTime: '19:00',
    endTime: '22:00',
    sequence: i + 1,
  }));

  const fixtures = generateLeagueFixtures({
    competitionSlug: 'tuesday-night',
    sessions,
    participantIds: teams,
    courtIds: ['court-1', 'court-2'],
    timeslotsBySession: Object.fromEntries(sessions.map((s) => [s.id, [`${s.id}-a`, `${s.id}-b`]])),
  });

  it('fills a season where every team plays every other once', () => {
    expect(fixtures).toHaveLength(15); // 6*5/2
    const pairs = new Set(
      fixtures.map((m) => [m.homeParticipantId, m.awayParticipantId].sort().join('|')),
    );
    expect(pairs.size).toBe(15);
    expect(fixtures.every((m) => m.timeslotId !== null)).toBe(true);
  });

  it('produces a season table once results are in', () => {
    const played = fixtures.map(playMatch);
    const standings = computeStandings({ participants, matches: played });

    expect(standings).toHaveLength(6);
    for (const row of standings) expect(row.wins + row.losses).toBe(5);
    // Ranks are contiguous and the table is ordered by them.
    expect(standings.map((s) => s.rank)).toEqual([1, 2, 3, 4, 5, 6]);
    // Results are seeded so the lowest id always wins: t1 top, t6 bottom.
    expect(standings[0]?.participantId).toBe('t1');
    expect(standings[5]?.participantId).toBe('t6');
  });
});

describe('a drop-in night', () => {
  it('rotates twenty players through two courts fairly', () => {
    const attendance = Array.from({ length: 20 }, (_, i) => ({
      id: `att-${i + 1}`,
      sessionId: SESSION,
      participantId: `p${String(i + 1).padStart(2, '0')}`,
      status: 'checked_in' as const,
      recordedAt: '2026-02-05T18:00:00Z',
    }));

    const out = generateDropInRotation({
      competitionSlug: 'thursday-dropin',
      sessionId: SESSION,
      sessionSequence: 1,
      attendance,
      courtIds: ['court-1', 'court-2'],
      timeslotIds: ['ts-1', 'ts-2', 'ts-3', 'ts-4', 'ts-5'],
      playersPerSide: 4,
    });

    // 16 of 20 play each round, so four sit out; over five rounds that is
    // 20 sit-outs across 20 players — everybody sits exactly once.
    const sitOuts = new Map<string, number>();
    for (const ids of Object.values(out.sittingOut)) {
      for (const id of ids) sitOuts.set(id, (sitOuts.get(id) ?? 0) + 1);
    }
    expect(sitOuts.size).toBe(20);
    expect([...sitOuts.values()].every((n) => n === 1)).toBe(true);

    expect(out.matches).toHaveLength(10); // 2 courts x 5 rounds

    // Nobody is ever on two courts at once.
    for (const timeslotId of ['ts-1', 'ts-2', 'ts-3', 'ts-4', 'ts-5']) {
      const onCourt = out.matches
        .filter((m) => m.timeslotId === timeslotId)
        .flatMap((m) => {
          const side = out.sides.find((s) => s.matchId === m.id);
          return [...(side?.home.participantIds ?? []), ...(side?.away.participantIds ?? [])];
        });
      expect(new Set(onCourt).size).toBe(onCourt.length);
      expect(onCourt).toHaveLength(16);
    }
  });
});
