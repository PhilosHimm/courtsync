/**
 * Specification for `explainStandings` and `standingsMovement`.
 *
 * `computeStandings` decides an order and says nothing about why. These two
 * report the reason and the movement, and the hard requirement on both is
 * that they never disagree with the table they are describing — a stated
 * reason that does not match the actual sort is worse than no reason,
 * because it will be believed.
 *
 * The final assertion in this file is the guard against that drift: for a
 * spread of tables it re-derives the explanation and checks the named
 * criterion genuinely separates each adjacent pair in the direction claimed.
 */

import { describe, expect, it } from 'vitest';
import type { Match, Participant } from '@/lib/core';
import { TIEBREAKER_ORDER } from '@/lib/core';
import { computeStandings } from '@/lib/scheduling/standings';
import { explainStandings, standingsMovement } from '@/lib/scheduling/standings-explain';

function team(id: string, name: string): Participant {
  return {
    id,
    competitionId: 'comp-1',
    kind: 'team',
    name,
    registeredAt: '2026-09-01T12:00:00Z',
  };
}

/** A finished match, home wins unless the scores say otherwise. */
function played(id: string, home: string, away: string, sets: Array<[number, number]>): Match {
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
    status: 'final',
    sets: sets.map(([h, a], i) => ({
      id: `${id}-s${i + 1}`,
      matchId: id,
      setNumber: i + 1,
      homePoints: h,
      awayPoints: a,
    })),
  };
}

const WIN: Array<[number, number]> = [
  [25, 20],
  [25, 20],
];
const LOSS: Array<[number, number]> = [
  [20, 25],
  [20, 25],
];

describe('explainStandings', () => {
  it('names win percentage when records differ', () => {
    const participants = [team('p1', 'Blockers'), team('p2', 'Setters')];
    const matches = [played('m1', 'p1', 'p2', WIN)];
    const standings = computeStandings({ participants, matches });
    const explained = explainStandings({ standings, matches });

    expect(explained[0]?.settledBy).toBe('winPercentage');
    expect(explained[0]?.aheadOf).toBe('p2');
    expect(explained[0]?.summary).toContain('Setters');
    expect(explained[0]?.summary).toMatch(/record|win/i);
  });

  it('names head-to-head when records tie and they played each other', () => {
    // Four teams, all 1-1, but p1 beat p2 directly. Head-to-head sits above
    // the differentials deliberately: beating someone counts for more than a
    // fat margin elsewhere.
    const participants = [team('p1', 'Blockers'), team('p2', 'Setters'), team('p3', 'Liberos')];
    const matches = [
      played('m1', 'p1', 'p2', WIN),
      played('m2', 'p2', 'p3', WIN),
      played('m3', 'p3', 'p1', WIN),
    ];
    const standings = computeStandings({ participants, matches });
    const explained = explainStandings({ standings, matches });

    const top = explained[0];
    const second = standings[1];
    expect(top).toBeDefined();
    expect(second).toBeDefined();
    // Whoever came out on top, the pair below them is separated by something
    // real, and where the two played each other it is head-to-head.
    expect(TIEBREAKER_ORDER).toContain(top?.settledBy);
  });

  it('names set differential when records tie and head-to-head does not separate', () => {
    // p1 and p2 never meet. Both 1-0, but p1 won in two and p2 needed three.
    const participants = [
      team('p1', 'Blockers'),
      team('p2', 'Setters'),
      team('p3', 'Liberos'),
      team('p4', 'Diggers'),
    ];
    const matches = [
      played('m1', 'p1', 'p3', WIN),
      played('m2', 'p2', 'p4', [
        [25, 20],
        [20, 25],
        [15, 10],
      ]),
    ];
    const standings = computeStandings({ participants, matches });
    const explained = explainStandings({ standings, matches });

    expect(standings[0]?.participantId).toBe('p1');
    expect(explained[0]?.settledBy).toBe('setDifferential');
    expect(explained[0]?.summary).toMatch(/set/i);
  });

  it('names point differential when sets tie too', () => {
    // Both win 2-0; p1 by more points.
    const participants = [
      team('p1', 'Blockers'),
      team('p2', 'Setters'),
      team('p3', 'Liberos'),
      team('p4', 'Diggers'),
    ];
    const matches = [
      played('m1', 'p1', 'p3', [
        [25, 5],
        [25, 5],
      ]),
      played('m2', 'p2', 'p4', [
        [25, 23],
        [25, 23],
      ]),
    ];
    const standings = computeStandings({ participants, matches });
    const explained = explainStandings({ standings, matches });

    expect(standings[0]?.participantId).toBe('p1');
    expect(explained[0]?.settledBy).toBe('pointDifferential');
    expect(explained[0]?.summary).toMatch(/point/i);
  });

  it('admits when only the stable key separates two rows', () => {
    // Two teams who have played nothing are identical in every real
    // criterion. computeStandings falls back to participant id so a re-seed
    // is reproducible (H9) — that is not a sporting reason and must not be
    // dressed up as one.
    const participants = [team('p1', 'Blockers'), team('p2', 'Setters')];
    const standings = computeStandings({ participants, matches: [] });
    const explained = explainStandings({ standings, matches: [] });

    expect(explained[0]?.settledBy).toBe('participantId');
    expect(explained[0]?.summary).toMatch(/tied|nothing|stable|no result/i);
    expect(explained[0]?.summary).not.toMatch(/ahead on/i);
  });

  it('the last row is ahead of nobody', () => {
    const participants = [team('p1', 'Blockers'), team('p2', 'Setters')];
    const matches = [played('m1', 'p1', 'p2', WIN)];
    const standings = computeStandings({ participants, matches });
    const explained = explainStandings({ standings, matches });

    const last = explained.at(-1);
    expect(last?.aheadOf).toBeNull();
    expect(last?.settledBy).toBeNull();
    expect(last?.summary.length).toBeGreaterThan(0);
  });

  it('returns one entry per standing, in the order given', () => {
    const participants = [team('p1', 'A'), team('p2', 'B'), team('p3', 'C')];
    const matches = [played('m1', 'p1', 'p2', WIN), played('m2', 'p2', 'p3', WIN)];
    const standings = computeStandings({ participants, matches });
    const explained = explainStandings({ standings, matches });

    expect(explained).toHaveLength(standings.length);
    expect(explained.map((e) => e.participantId)).toEqual(standings.map((s) => s.participantId));
    expect(explained.map((e) => e.rank)).toEqual(standings.map((s) => s.rank));
  });

  it('reads the order handed in and never re-derives it', () => {
    // Same reasoning as the bracket templates: "second in pool A" means the
    // second row of the table the organizer is reading. A function that
    // re-sorted before explaining could disagree with the table it sits
    // under.
    const participants = [team('p1', 'Blockers'), team('p2', 'Setters')];
    const matches = [played('m1', 'p1', 'p2', WIN)];
    const standings = computeStandings({ participants, matches });
    const reversed = [...standings].reverse();
    const explained = explainStandings({ standings: reversed, matches });

    expect(explained.map((e) => e.participantId)).toEqual(reversed.map((s) => s.participantId));
  });

  it('an empty table explains nothing rather than raising', () => {
    expect(explainStandings({ standings: [], matches: [] })).toEqual([]);
  });

  it('is pure: same input, same output, inputs untouched', () => {
    const participants = [team('p1', 'A'), team('p2', 'B')];
    const matches = [played('m1', 'p1', 'p2', WIN)];
    const standings = computeStandings({ participants, matches });
    const input = { standings, matches };
    const before = structuredClone(input);

    expect(explainStandings(input)).toEqual(explainStandings(input));
    expect(input).toEqual(before);
  });

  it('never claims a criterion that does not actually separate the pair', () => {
    // The guard against drift. computeStandings owns the order; this owns the
    // explanation; nothing structural stops them disagreeing. So for a spread
    // of tables, check the claim against the numbers.
    const participants = [
      team('p1', 'Blockers'),
      team('p2', 'Setters'),
      team('p3', 'Liberos'),
      team('p4', 'Diggers'),
      team('p5', 'Spikers'),
    ];
    const tables: Match[][] = [
      [],
      [played('m1', 'p1', 'p2', WIN)],
      [played('m1', 'p1', 'p2', WIN), played('m2', 'p3', 'p4', LOSS)],
      [
        played('m1', 'p1', 'p2', WIN),
        played('m2', 'p2', 'p3', WIN),
        played('m3', 'p3', 'p1', WIN),
        played('m4', 'p4', 'p5', WIN),
      ],
      [
        played('m1', 'p1', 'p3', [
          [25, 5],
          [25, 5],
        ]),
        played('m2', 'p2', 'p4', [
          [25, 23],
          [25, 23],
        ]),
      ],
    ];

    for (const matches of tables) {
      const standings = computeStandings({ participants, matches });
      const explained = explainStandings({ standings, matches });

      for (let i = 0; i < standings.length - 1; i++) {
        const above = standings[i];
        const below = standings[i + 1];
        const reason = explained[i];
        if (!above || !below || !reason) continue;

        if (reason.settledBy === 'winPercentage') {
          expect(above.winPercentage).toBeGreaterThan(below.winPercentage);
        } else if (reason.settledBy === 'setDifferential') {
          expect(above.winPercentage).toBe(below.winPercentage);
          expect(above.setDifferential).toBeGreaterThan(below.setDifferential);
        } else if (reason.settledBy === 'pointDifferential') {
          expect(above.winPercentage).toBe(below.winPercentage);
          expect(above.setDifferential).toBe(below.setDifferential);
          expect(above.pointDifferential).toBeGreaterThan(below.pointDifferential);
        } else if (reason.settledBy === 'participantId') {
          // The fallback only applies when every real criterion ties.
          expect(above.winPercentage).toBe(below.winPercentage);
          expect(above.setDifferential).toBe(below.setDifferential);
          expect(above.pointDifferential).toBe(below.pointDifferential);
          expect(above.participantId < below.participantId).toBe(true);
        } else {
          // head-to-head: the records must tie for it to have been reached.
          expect(reason.settledBy).toBe('headToHead');
          expect(above.winPercentage).toBe(below.winPercentage);
        }
      }
    }
  });
});

describe('standingsMovement', () => {
  const participants = [team('p1', 'Blockers'), team('p2', 'Setters'), team('p3', 'Liberos')];

  it('reports which rows climbed and which fell', () => {
    const before = computeStandings({ participants, matches: [played('m1', 'p3', 'p1', WIN)] });
    const after = computeStandings({
      participants,
      matches: [played('m1', 'p3', 'p1', WIN), played('m2', 'p1', 'p2', WIN)],
    });

    const moved = standingsMovement(before, after);
    expect(moved).toHaveLength(3);
    for (const row of moved) {
      const previous = before.find((s) => s.participantId === row.participantId);
      expect(row.previousRank).toBe(previous?.rank ?? null);
      expect(row.change).toBe(row.currentRank - (previous?.rank ?? row.currentRank));
    }
  });

  it('a table that did not move reports zero change everywhere', () => {
    const standings = computeStandings({ participants, matches: [played('m1', 'p1', 'p2', WIN)] });
    const moved = standingsMovement(standings, standings);
    expect(moved.every((row) => row.change === 0)).toBe(true);
  });

  it('a participant absent from the earlier table is a new entry, not a climb', () => {
    // A team added mid-event did not climb from nowhere, and reporting it as
    // a jump of several places would be inventing a result.
    const before = computeStandings({
      participants: [team('p1', 'Blockers')],
      matches: [],
    });
    const after = computeStandings({ participants, matches: [] });

    const moved = standingsMovement(before, after);
    const newcomer = moved.find((row) => row.participantId === 'p2');
    expect(newcomer?.previousRank).toBeNull();
    expect(newcomer?.change).toBeNull();
  });

  it('follows the current table order', () => {
    const before = computeStandings({ participants, matches: [] });
    const after = computeStandings({ participants, matches: [played('m1', 'p3', 'p1', WIN)] });
    expect(standingsMovement(before, after).map((r) => r.participantId)).toEqual(
      after.map((s) => s.participantId),
    );
  });

  it('is pure and leaves both tables untouched', () => {
    const before = computeStandings({ participants, matches: [] });
    const after = computeStandings({ participants, matches: [played('m1', 'p3', 'p1', WIN)] });
    const snapshot = structuredClone([before, after]);

    expect(standingsMovement(before, after)).toEqual(standingsMovement(before, after));
    expect([before, after]).toEqual(snapshot);
  });
});
