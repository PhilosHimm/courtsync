/**
 * Specification for the organizer's tiebreaker order (#16).
 *
 * `computeStandings` used to hard-code win percentage, head-to-head, set
 * differential, point differential. Rules sheets genuinely differ, so the
 * order is now an input. This is the riskiest change in the engine:
 * `seedBrackets`, the bracket templates and `bracketDrift` all read the
 * table's order, and a subtle change to it silently reseeds a bracket.
 *
 * Three things this suite holds, each tied to what already broke once:
 *
 * - Under the default order nothing moves. The 30-odd assertions in
 *   standings.test.ts are untouched and still pass; this suite adds a sweep
 *   proving "passed explicitly" and "left out" are the same table.
 * - The final tiebreak stays deterministic whatever the organizer configures.
 *   H9 was a comparison that resolved a full tie differently on every run.
 * - Head-to-head can be skipped, because some formats deliberately omit it.
 */

import { describe, expect, it } from 'vitest';
import type { Match, MatchSet, Participant, Tiebreaker } from '@/lib/core';
import { TIEBREAKER_ORDER } from '@/lib/core';
import { computeStandings } from '@/lib/scheduling/standings';
import { explainStandings } from '@/lib/scheduling/standings-explain';

const participant = (id: string): Participant => ({
  id,
  competitionId: 'comp-1',
  kind: 'team',
  name: `Team ${id}`,
  registeredAt: '2026-01-01T00:00:00Z',
});

function match(id: string, home: string, away: string, scores: Array<[number, number]>): Match {
  const sets: MatchSet[] = scores.map(([h, a], i) => ({
    id: `${id}-s${i + 1}`,
    matchId: id,
    setNumber: i + 1,
    homePoints: h,
    awayPoints: a,
  }));
  return {
    id,
    competitionId: 'comp-1',
    sessionId: 'sess-1',
    poolId: 'pool-a',
    courtId: 'court-1',
    timeslotId: 'ts-1',
    homeParticipantId: home,
    awayParticipantId: away,
    status: 'final',
    sets,
  };
}

const order = (rows: Array<{ participantId: string }>) => rows.map((r) => r.participantId);

/**
 * a beat b directly, but b has the better set differential. Every team is
 * 2-1, so win percentage cannot separate a from b and head-to-head decides
 * under the default order.
 *
 *   a beat b 2-1, a lost to c 0-2, a beat d 2-1   → sets 4-4, 2-1
 *   b beat c 2-0, b beat d 2-0, b lost to a 1-2   → sets 5-2, 2-1
 */
const headToHeadVsSets = {
  participants: ['a', 'b', 'c', 'd'].map(participant),
  matches: [
    match('m1', 'a', 'b', [
      [25, 20],
      [20, 25],
      [15, 10],
    ]),
    match('m2', 'a', 'c', [
      [10, 25],
      [10, 25],
    ]),
    match('m3', 'a', 'd', [
      [25, 23],
      [23, 25],
      [15, 13],
    ]),
    match('m4', 'b', 'c', [
      [25, 23],
      [25, 23],
    ]),
    match('m5', 'b', 'd', [
      [25, 23],
      [25, 23],
    ]),
    match('m6', 'c', 'd', [
      [23, 25],
      [23, 25],
    ]),
  ],
};

/**
 * p and q are both 1-1 and never meet, so win percentage and head-to-head
 * both tie. The two differentials then disagree:
 *
 *   p beat r 2-1 by a distance, lost to s 0-2 narrowly  → sets -1, points +21
 *   q beat s 2-0 narrowly, lost to r 1-2 narrowly      → sets +1, points +2
 *
 * so q leads on sets and p leads on points.
 */
const setsVsPoints = {
  participants: ['p', 'q', 'r', 's'].map(participant),
  matches: [
    match('n1', 'p', 'r', [
      [25, 5],
      [20, 25],
      [15, 5],
    ]),
    match('n2', 'p', 's', [
      [24, 26],
      [24, 26],
    ]),
    match('n3', 'q', 's', [
      [26, 24],
      [26, 24],
    ]),
    match('n4', 'q', 'r', [
      [24, 26],
      [26, 24],
      [14, 16],
    ]),
    match('n5', 'r', 's', [
      [25, 20],
      [25, 20],
    ]),
  ],
};

describe('the default order', () => {
  it('is exactly what computeStandings applied before it was configurable', () => {
    // The constant is the stored default and the documentation of it. If it
    // changes, every bracket seeded from the default changes with it.
    expect([...TIEBREAKER_ORDER]).toEqual([
      'winPercentage',
      'headToHead',
      'setDifferential',
      'pointDifferential',
    ]);
  });

  it('gives the same table whether it is passed explicitly or left out', () => {
    for (const fixture of [headToHeadVsSets, setsVsPoints]) {
      expect(computeStandings({ ...fixture, tiebreakerOrder: TIEBREAKER_ORDER })).toEqual(
        computeStandings(fixture),
      );
    }
  });

  it('ranks by head-to-head ahead of the set differential', () => {
    const table = computeStandings(headToHeadVsSets);
    const a = table.findIndex((r) => r.participantId === 'a');
    const b = table.findIndex((r) => r.participantId === 'b');
    expect(table[a]?.winPercentage).toBe(table[b]?.winPercentage);
    expect(table[b]!.setDifferential).toBeGreaterThan(table[a]!.setDifferential);
    // a beat b, and under the default that outranks b's better sets.
    expect(a).toBeLessThan(b);
  });
});

describe('skipping head-to-head', () => {
  const withoutHeadToHead: readonly Tiebreaker[] = [
    'winPercentage',
    'setDifferential',
    'pointDifferential',
  ];

  it('lets the better set differential win when head-to-head is not in the order', () => {
    const table = computeStandings({ ...headToHeadVsSets, tiebreakerOrder: withoutHeadToHead });
    const a = table.findIndex((r) => r.participantId === 'a');
    const b = table.findIndex((r) => r.participantId === 'b');
    expect(b).toBeLessThan(a);
  });

  it('is never cited by the explanation when it was not applied', () => {
    const standings = computeStandings({
      ...headToHeadVsSets,
      tiebreakerOrder: withoutHeadToHead,
    });
    const explained = explainStandings({
      standings,
      matches: headToHeadVsSets.matches,
      tiebreakerOrder: withoutHeadToHead,
    });
    for (const row of explained) expect(row.settledBy).not.toBe('headToHead');
  });
});

describe('reordering the differentials', () => {
  it('puts the better point differential first when points come before sets', () => {
    const setsFirst = computeStandings(setsVsPoints);
    const pointsFirst = computeStandings({
      ...setsVsPoints,
      tiebreakerOrder: ['winPercentage', 'pointDifferential', 'setDifferential'],
    });

    const rowOf = (table: typeof setsFirst, id: string) =>
      table.find((r) => r.participantId === id)!;
    const p = rowOf(setsFirst, 'p');
    const q = rowOf(setsFirst, 'q');
    // The fixture has to actually disagree, or this test proves nothing.
    expect(p.winPercentage).toBe(q.winPercentage);
    expect(Math.sign(p.setDifferential - q.setDifferential)).toBe(
      -Math.sign(p.pointDifferential - q.pointDifferential),
    );

    const idx = (table: typeof setsFirst, id: string) => order(table).indexOf(id);
    const pAheadOnSets = p.setDifferential > q.setDifferential;
    expect(idx(setsFirst, 'p') < idx(setsFirst, 'q')).toBe(pAheadOnSets);
    expect(idx(pointsFirst, 'p') < idx(pointsFirst, 'q')).toBe(!pAheadOnSets);
  });

  it('explains the pair with the criterion that was actually applied first', () => {
    const tiebreakerOrder: readonly Tiebreaker[] = [
      'winPercentage',
      'pointDifferential',
      'setDifferential',
    ];
    const standings = computeStandings({ ...setsVsPoints, tiebreakerOrder });
    const explained = explainStandings({
      standings,
      matches: setsVsPoints.matches,
      tiebreakerOrder,
    });
    // r is 2-1 and s is 1-2, so p and q are the adjacent middle pair.
    expect(order(standings)).toEqual(['r', 'p', 'q', 's']);
    const upper = explained.find((row) => row.participantId === 'p');
    expect(upper?.aheadOf).toBe('q');
    expect(upper?.settledBy).toBe('pointDifferential');
    // Wherever p and q sit, no pair is ever explained by a criterion the
    // order does not contain.
    for (const row of explained) {
      if (row.settledBy === null || row.settledBy === 'participantId') continue;
      expect(tiebreakerOrder).toContain(row.settledBy);
    }
  });
});

describe('the final tiebreak', () => {
  // Four teams that never played: every criterion ties for every order.
  const untouched = { participants: ['d', 'b', 'c', 'a'].map(participant), matches: [] };

  const orders: ReadonlyArray<readonly Tiebreaker[]> = [
    TIEBREAKER_ORDER,
    ['winPercentage'],
    ['pointDifferential', 'setDifferential'],
    ['headToHead', 'winPercentage'],
  ];

  it('falls back to participant id under every configured order', () => {
    for (const tiebreakerOrder of orders) {
      expect(order(computeStandings({ ...untouched, tiebreakerOrder }))).toEqual([
        'a',
        'b',
        'c',
        'd',
      ]);
    }
  });

  it('does not depend on the order participants were passed in', () => {
    for (const tiebreakerOrder of orders) {
      const forwards = computeStandings({ ...headToHeadVsSets, tiebreakerOrder });
      const backwards = computeStandings({
        ...headToHeadVsSets,
        participants: [...headToHeadVsSets.participants].reverse(),
        tiebreakerOrder,
      });
      expect(order(backwards)).toEqual(order(forwards));
    }
  });
});

describe('a head-to-head cycle under the default order', () => {
  // x beat y, y beat z, z beat x, every set 25-20: identical records,
  // identical differentials, and head-to-head that cannot order the three.
  const cycle = {
    participants: ['x', 'y', 'z'].map(participant),
    matches: [
      match('c1', 'x', 'y', [
        [25, 20],
        [25, 20],
      ]),
      match('c2', 'y', 'z', [
        [25, 20],
        [25, 20],
      ]),
      match('c3', 'z', 'x', [
        [25, 20],
        [25, 20],
      ]),
    ],
  };
  const permutations = [
    ['x', 'y', 'z'],
    ['x', 'z', 'y'],
    ['y', 'x', 'z'],
    ['y', 'z', 'x'],
    ['z', 'x', 'y'],
    ['z', 'y', 'x'],
  ];

  it('produces one table whatever order the participants arrive in', () => {
    // Discovered writing this suite: the insertion sort started from input
    // order, so a cycle came out differently depending on how the caller
    // listed the teams. A database returns rows in whatever order it likes
    // unless told otherwise, so that was the same results seeding two
    // different brackets — H9.
    const tables = permutations.map((ids) =>
      order(computeStandings({ ...cycle, participants: ids.map(participant) })),
    );
    for (const table of tables) expect(table).toEqual(tables[0]);
  });
});

describe('validation', () => {
  it('rejects an order naming a tiebreaker the engine does not have', () => {
    expect(() =>
      computeStandings({
        ...headToHeadVsSets,
        tiebreakerOrder: ['winPercentage', 'coinToss' as Tiebreaker],
      }),
    ).toThrow(/coinToss/);
  });

  it('rejects an order naming the same tiebreaker twice', () => {
    // A duplicate is always a data-entry slip, and silently de-duplicating
    // it would hide which order the organizer actually meant.
    expect(() =>
      computeStandings({
        ...headToHeadVsSets,
        tiebreakerOrder: ['winPercentage', 'setDifferential', 'setDifferential'],
      }),
    ).toThrow(/setDifferential/);
  });

  it('rejects an empty order rather than ranking by participant id alone', () => {
    // An empty list would rank a winless team above an unbeaten one on an
    // arbitrary key. That is never a rules sheet anyone wrote.
    expect(() => computeStandings({ ...headToHeadVsSets, tiebreakerOrder: [] })).toThrow();
  });

  it('never mutates the order it was given', () => {
    const tiebreakerOrder: Tiebreaker[] = ['pointDifferential', 'winPercentage'];
    const before = [...tiebreakerOrder];
    computeStandings({ ...headToHeadVsSets, tiebreakerOrder });
    expect(tiebreakerOrder).toEqual(before);
  });
});
