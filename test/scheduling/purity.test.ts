/**
 * Specification for architectural rule 9 (scheduling functions are pure and
 * deterministic) and rule 10 (never mutate function inputs), applied to every
 * exported scheduling function rather than to the five that happened to have
 * their own assertion.
 *
 * Rule 10 was a convention that review had to hold. A caller that hands the
 * same participant list to `generatePoolPlay` and then to
 * `generateLeagueFixtures` has no way to know which of them reordered it, and
 * finding out means reading both. This suite makes the rule enforceable
 * instead: every function is called with a deep-frozen-equivalent snapshot
 * taken beforehand, and the input has to come back identical.
 */

import { describe, expect, it } from 'vitest';
import type { Attendance, Match, Participant, Standing } from '@/lib/core';
import { generateDropInRotation, promoteFromWaitlist } from '@/lib/scheduling/dropin-rotation';
import { generateLeagueFixtures } from '@/lib/scheduling/league-fixtures';
import { drawPools } from '@/lib/scheduling/pool-draw';
import { generatePoolPlay } from '@/lib/scheduling/pool-play';
import { assignReferees } from '@/lib/scheduling/referees';
import { roundRobinRounds } from '@/lib/scheduling/round-robin';
import { advanceBracket, seedBrackets } from '@/lib/scheduling/seeding';
import { computeStandings } from '@/lib/scheduling/standings';

/** Call `run` and fail if it changed anything reachable from its argument. */
function leavesInputAlone<T>(build: () => T, run: (input: T) => unknown): void {
  const input = build();
  const before = structuredClone(input);
  run(input);
  expect(input).toEqual(before);
}

const participantIds = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'];

const participants: Participant[] = participantIds.map((id) => ({
  id,
  competitionId: 'comp-1',
  kind: 'team',
  name: id.toUpperCase(),
  registeredAt: '2026-01-01T00:00:00Z',
}));

function match(id: string, home: string, away: string, sets: Array<[number, number]>): Match {
  return {
    id,
    competitionId: 'comp-1',
    sessionId: 'sess-1',
    poolId: 'pool-a',
    courtId: 'court-1',
    timeslotId: 'ts-1',
    homeParticipantId: home,
    awayParticipantId: away,
    refParticipantId: null,
    bracket: null,
    roundLabel: 'Pool Play',
    status: sets.length ? 'final' : 'scheduled',
    sets: sets.map(([h, a], i) => ({
      id: `${id}-s${i + 1}`,
      matchId: id,
      setNumber: i + 1,
      homePoints: h,
      awayPoints: a,
    })),
  };
}

function standing(id: string, wins: number, losses: number): Standing {
  const played = wins + losses;
  return {
    participantId: id,
    participantName: id.toUpperCase(),
    wins,
    losses,
    winPercentage: played === 0 ? 0 : wins / played,
    setsWon: wins * 2,
    setsLost: losses * 2,
    setDifferential: wins * 2 - losses * 2,
    pointsFor: 100 + wins * 10,
    pointsAgainst: 100,
    pointDifferential: wins * 10,
    pointAdjustment: 0,
    rank: 0,
  };
}

const attendance: Attendance[] = participantIds.map((id, i) => ({
  id: `att-${i + 1}`,
  sessionId: 'sess-1',
  participantId: id,
  status: i < 4 ? ('checked_in' as const) : ('waitlist' as const),
  ...(i < 4 ? {} : { waitlistPos: i - 3 }),
  recordedAt: '2026-02-05T18:00:00Z',
}));

describe('scheduling functions do not mutate their inputs', () => {
  it('generatePoolPlay', () => {
    leavesInputAlone(
      () => ({
        competitionSlug: 'spring-open',
        sessionId: 'sess-1',
        pools: [
          { id: 'pool-a', name: 'A', participantIds: participantIds.slice(0, 3) },
          { id: 'pool-b', name: 'B', participantIds: participantIds.slice(3) },
        ],
        courtIds: ['court-1', 'court-2'],
        timeslotIds: ['ts-1', 'ts-2', 'ts-3', 'ts-4'],
        minRestSlots: 1,
      }),
      generatePoolPlay,
    );
  });

  it('drawPools', () => {
    leavesInputAlone(
      () => ({
        participants: structuredClone(participants).map((p, i) => ({ ...p, seed: i + 1 })),
        pools: [
          { id: 'pool-a', name: 'A' },
          { id: 'pool-b', name: 'B' },
        ],
      }),
      drawPools,
    );
  });

  it('generateLeagueFixtures', () => {
    leavesInputAlone(
      () => ({
        competitionSlug: 'tuesday-night',
        sessions: [1, 2, 3].map((i) => ({
          id: `sess-wk-${i}`,
          competitionId: 'comp-league',
          name: `Week ${i}`,
          playDate: `2026-01-0${5 + i}`,
          startTime: '19:00',
          endTime: '22:00',
          sequence: i,
        })),
        participantIds: [...participantIds],
        courtIds: ['court-1'],
        timeslotsBySession: {
          'sess-wk-1': ['ts-1a', 'ts-1b'],
          'sess-wk-2': ['ts-2a', 'ts-2b'],
          'sess-wk-3': ['ts-3a', 'ts-3b'],
        },
        rounds: 2,
      }),
      generateLeagueFixtures,
    );
  });

  it('generateDropInRotation', () => {
    leavesInputAlone(
      () => ({
        competitionSlug: 'thursday-dropin',
        sessionId: 'sess-1',
        sessionSequence: 1,
        attendance: structuredClone(attendance),
        courtIds: ['court-1'],
        timeslotIds: ['ts-1', 'ts-2'],
        playersPerSide: 2,
      }),
      generateDropInRotation,
    );
  });

  it('promoteFromWaitlist', () => {
    const input = structuredClone(attendance);
    const before = structuredClone(input);
    promoteFromWaitlist(input, 6);
    expect(input).toEqual(before);
  });

  it('assignReferees', () => {
    leavesInputAlone(
      () => ({
        matches: [match('m1', 'p1', 'p2', []), match('m2', 'p3', 'p4', [])],
        pools: [{ id: 'pool-a', name: 'A', participantIds: [...participantIds] }],
        allParticipantIds: [...participantIds],
      }),
      assignReferees,
    );
  });

  it('computeStandings', () => {
    leavesInputAlone(
      () => ({
        participants: structuredClone(participants),
        matches: [
          match('m1', 'p1', 'p2', [
            [25, 20],
            [25, 18],
          ]),
          match('m2', 'p3', 'p4', [
            [21, 25],
            [19, 25],
          ]),
        ],
      }),
      computeStandings,
    );
  });

  it('seedBrackets', () => {
    leavesInputAlone(
      () => ({
        competitionSlug: 'spring-open',
        sessionId: 'sess-1',
        standingsByPool: {
          'pool-a': [standing('p1', 3, 0), standing('p2', 2, 1), standing('p3', 1, 2)],
          'pool-b': [standing('p4', 3, 0), standing('p5', 2, 1), standing('p6', 1, 2)],
        },
        tiers: ['gold'],
      }),
      seedBrackets,
    );
  });

  it('advanceBracket', () => {
    leavesInputAlone(
      () => ({
        competitionSlug: 'spring-open',
        tier: 'gold',
        matches: [
          {
            ...match('spring-open-gold-q1', 'p1', 'p2', [
              [25, 20],
              [25, 18],
            ]),
            poolId: null,
            bracket: 'gold',
          },
          { ...match('spring-open-gold-s1', 'p1', 'p2', []), poolId: null, bracket: 'gold' },
        ],
      }),
      advanceBracket,
    );
  });

  it('roundRobinRounds', () => {
    leavesInputAlone(
      () => [...participantIds],
      (ids) => roundRobinRounds(ids),
    );
  });
});

describe('scheduling functions are deterministic', () => {
  it('roundRobinRounds returns the same pairings every call', () => {
    expect(roundRobinRounds(participantIds)).toEqual(roundRobinRounds(participantIds));
  });

  it('an odd field still returns the same pairings every call', () => {
    const odd = participantIds.slice(0, 5);
    expect(roundRobinRounds(odd)).toEqual(roundRobinRounds(odd));
  });
});
