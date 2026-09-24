/**
 * Specification: automatic seeding reads each pool in the order its table
 * shows, and ranks across pools by the organizer's tiebreaker order.
 *
 * Discovered while making the tiebreaker order configurable (#16).
 * `resolveTemplateRef` already read "second in pool A" as the table's second
 * row, and said why: a second ordering would quietly disagree with the table
 * the organizer is reading (H8). The automatic path did not. It re-sorted
 * each pool by the cross-pool comparator, which has no head-to-head term — so
 * a team the table placed first on head-to-head could be seeded as the
 * pool's runner-up, and cross-seeded against the wrong opponent.
 */

import { describe, expect, it } from 'vitest';
import type { Match, MatchSet, Participant, Standing, Tiebreaker } from '@/lib/core';
import { seedBrackets } from '@/lib/scheduling/seeding';
import { computeStandings } from '@/lib/scheduling/standings';

const participant = (id: string): Participant => ({
  id,
  competitionId: 'comp',
  kind: 'team',
  name: id,
  registeredAt: '2026-01-01T00:00:00Z',
});

function match(
  id: string,
  poolId: string,
  home: string,
  away: string,
  scores: Array<[number, number]>,
): Match {
  const sets: MatchSet[] = scores.map(([h, a], i) => ({
    id: `${id}-s${i + 1}`,
    matchId: id,
    setNumber: i + 1,
    homePoints: h,
    awayPoints: a,
  }));
  return {
    id,
    competitionId: 'comp',
    sessionId: 'sess',
    poolId,
    courtId: 'c',
    timeslotId: 't',
    homeParticipantId: home,
    awayParticipantId: away,
    status: 'final',
    sets,
  };
}

const win: Array<[number, number]> = [
  [21, 10],
  [21, 10],
];
const narrow: Array<[number, number]> = [
  [21, 19],
  [21, 19],
];

/**
 * Pool A: a1 and a2 both finish 2-1. a1 beat a2 in three sets; a2 won its
 * other two in straight sets. So a1 holds the head-to-head and a2 the better
 * set differential (+3 to +1).
 */
const poolA = {
  participants: ['a1', 'a2', 'a3', 'a4'].map((id) => participant(id)),
  matches: [
    match('A1', 'A', 'a1', 'a2', [
      [21, 19],
      [19, 21],
      [15, 13],
    ]),
    match('A2', 'A', 'a1', 'a3', narrow),
    match('A3', 'A', 'a4', 'a1', narrow),
    match('A4', 'A', 'a2', 'a3', win),
    match('A5', 'A', 'a2', 'a4', win),
    match('A6', 'A', 'a3', 'a4', win),
  ],
};

/** Pool B: a plain ladder, b1 > b2 > b3 > b4. */
const poolB = {
  participants: ['b1', 'b2', 'b3', 'b4'].map((id) => participant(id)),
  matches: [
    match('B1', 'B', 'b1', 'b2', win),
    match('B2', 'B', 'b1', 'b3', win),
    match('B3', 'B', 'b1', 'b4', win),
    match('B4', 'B', 'b2', 'b3', win),
    match('B5', 'B', 'b2', 'b4', win),
    match('B6', 'B', 'b3', 'b4', win),
  ],
};

const quarterfinals = (
  standingsByPool: Record<string, Standing[]>,
  tiebreakerOrder?: readonly Tiebreaker[],
) =>
  seedBrackets({
    competitionSlug: 'open',
    sessionId: 'sess',
    standingsByPool,
    tiers: ['gold'],
    ...(tiebreakerOrder ? { tiebreakerOrder } : {}),
  })
    .filter((m) => m.slot.startsWith('q'))
    .map((m) => [m.homeParticipantId, m.awayParticipantId].sort().join(' v '))
    .sort();

describe('automatic seeding and the pool tables', () => {
  const tableA = computeStandings(poolA);
  const tableB = computeStandings(poolB);

  it('has a pool where head-to-head and the differentials disagree', () => {
    // Guard: without this the test below proves nothing.
    const a1 = tableA.find((r) => r.participantId === 'a1')!;
    const a2 = tableA.find((r) => r.participantId === 'a2')!;
    expect(a1.winPercentage).toBe(a2.winPercentage);
    expect(a2.setDifferential).toBeGreaterThan(a1.setDifferential);
    expect(tableA.map((r) => r.participantId).slice(0, 2)).toEqual(['a1', 'a2']);
  });

  it('cross-seeds the team the table shows first as the pool winner', () => {
    // Pool winner meets the other pool's fourth. The table says a1 won pool A.
    const pairs = quarterfinals({ A: tableA, B: tableB });
    expect(pairs).toContain('a1 v b4');
    expect(pairs).toContain('a2 v b3');
  });

  it('seeds the same bracket whatever order the table rows arrive in, given their ranks', () => {
    // The table is the authority, and its order is its rank. A caller that
    // shuffled the rows must not get a different bracket.
    const shuffled = [...tableA].reverse();
    expect(quarterfinals({ A: shuffled, B: tableB })).toEqual(
      quarterfinals({ A: tableA, B: tableB }),
    );
  });
});

describe('ranking across pools follows the organizer’s order', () => {
  /**
   * Two pool winners, both 3-0: x1 has the better set differential, y1 the
   * better point differential. Who is the overall top seed decides who gets
   * the easier half of the draw.
   */
  const standing = (
    id: string,
    rank: number,
    setDifferential: number,
    pointDifferential: number,
  ): Standing => ({
    participantId: id,
    participantName: id,
    wins: 3 - (rank - 1),
    losses: rank - 1,
    winPercentage: (3 - (rank - 1)) / 3,
    setsWon: 0,
    setsLost: 0,
    setDifferential,
    pointsFor: 0,
    pointsAgainst: 0,
    pointDifferential,
    pointAdjustment: 0,
    rank,
  });
  const table = (prefix: string, top: [number, number]) => [
    standing(`${prefix}1`, 1, top[0], top[1]),
    standing(`${prefix}2`, 2, 0, 0),
    standing(`${prefix}3`, 3, -2, -20),
    standing(`${prefix}4`, 4, -4, -40),
  ];
  const standingsByPool = { X: table('x', [6, 30]), Y: table('y', [4, 60]) };

  const q1Home = (tiebreakerOrder?: readonly Tiebreaker[]) =>
    seedBrackets({
      competitionSlug: 'open',
      sessionId: 'sess',
      standingsByPool,
      tiers: ['gold'],
      ...(tiebreakerOrder ? { tiebreakerOrder } : {}),
    }).find((m) => m.slot === 'q1')?.homeParticipantId;

  it('puts the better set differential first under the default order', () => {
    expect(q1Home()).toBe('x1');
  });

  it('puts the better point differential first when points come before sets', () => {
    expect(q1Home(['winPercentage', 'pointDifferential', 'setDifferential'])).toBe('y1');
  });

  it('ignores head-to-head across pools, where nobody played each other', () => {
    expect(q1Home(['headToHead', 'winPercentage', 'setDifferential', 'pointDifferential'])).toBe(
      'x1',
    );
  });
});
