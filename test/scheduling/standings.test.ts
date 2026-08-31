/**
 * SKIPPED — specification for `computeStandings`.
 *
 * Encodes audit finding H9 (nondeterministic tiebreaks, records ignored)
 * and the tiebreaker order from the Tournament Scheduler MVP spec.
 */

import { describe, expect, it } from 'vitest';
import type { Match, MatchSet, Participant } from '@/lib/core';
import { computeStandings, FORFEIT_POLICIES } from '@/lib/scheduling/standings';

const participant = (id: string, name: string): Participant => ({
  id,
  competitionId: 'comp-1',
  kind: 'team',
  name,
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

describe('computeStandings', () => {
  const participants = [
    participant('t1', 'Team 1'),
    participant('t2', 'Team 2'),
    participant('t3', 'Team 3'),
  ];

  it('counts wins, losses and win percentage from finalized matches', () => {
    const standings = computeStandings({
      participants,
      matches: [
        match('m1', 't1', 't2', [
          [21, 18],
          [21, 15],
        ]),
        match('m2', 't1', 't3', [
          [21, 19],
          [21, 17],
        ]),
        match('m3', 't2', 't3', [
          [21, 12],
          [21, 14],
        ]),
      ],
    });

    const t1 = standings.find((s) => s.participantId === 't1');
    expect(t1?.wins).toBe(2);
    expect(t1?.losses).toBe(0);
    expect(t1?.winPercentage).toBeCloseTo(1);
  });

  it('ignores matches that are not final', () => {
    const scheduled = { ...match('m1', 't1', 't2', [[21, 18]]), status: 'scheduled' as const };
    const standings = computeStandings({ participants, matches: [scheduled] });
    expect(standings.every((s) => s.wins === 0 && s.losses === 0)).toBe(true);
  });

  it('accumulates set and point differentials', () => {
    const standings = computeStandings({
      participants,
      matches: [
        match('m1', 't1', 't2', [
          [21, 18],
          [19, 21],
          [15, 10],
        ]),
      ],
    });
    const t1 = standings.find((s) => s.participantId === 't1');
    expect(t1?.setsWon).toBe(2);
    expect(t1?.setsLost).toBe(1);
    expect(t1?.setDifferential).toBe(1);
    expect(t1?.pointsFor).toBe(55);
    expect(t1?.pointsAgainst).toBe(49);
    expect(t1?.pointDifferential).toBe(6);
  });

  it('ranks by win percentage first', () => {
    const standings = computeStandings({
      participants,
      matches: [
        match('m1', 't1', 't2', [
          [21, 10],
          [21, 10],
        ]),
        match('m2', 't1', 't3', [
          [21, 10],
          [21, 10],
        ]),
        match('m3', 't2', 't3', [
          [21, 10],
          [21, 10],
        ]),
      ],
    });
    expect(standings.map((s) => s.participantId)).toEqual(['t1', 't2', 't3']);
    expect(standings.map((s) => s.rank)).toEqual([1, 2, 3]);
  });

  it('breaks a win-percentage tie on head-to-head before differentials', () => {
    // t1 and t2 both 1-1. t2 beat t1, so t2 ranks higher despite a worse
    // point differential overall.
    const standings = computeStandings({
      participants,
      matches: [
        match('m1', 't2', 't1', [
          [21, 19],
          [21, 19],
        ]),
        match('m2', 't1', 't3', [
          [21, 2],
          [21, 2],
        ]),
        match('m3', 't3', 't2', [
          [21, 19],
          [21, 19],
        ]),
      ],
    });
    const order = standings.map((s) => s.participantId);
    expect(order.indexOf('t2')).toBeLessThan(order.indexOf('t1'));
  });

  /**
   * AUDIT FINDING H9 — the important one.
   * A total tie must resolve identically on every run.
   */
  it('H9: is deterministic when every tiebreaker ties', () => {
    const mirrored = [
      match('m1', 't1', 't2', [
        [21, 19],
        [19, 21],
      ]),
      match('m2', 't2', 't3', [
        [21, 19],
        [19, 21],
      ]),
      match('m3', 't3', 't1', [
        [21, 19],
        [19, 21],
      ]),
    ];
    const runs = Array.from({ length: 10 }, () =>
      computeStandings({ participants, matches: mirrored }).map((s) => s.participantId),
    );
    for (const r of runs) {
      expect(r).toEqual(runs[0]);
    }
  });

  it('H9: does not mutate its input', () => {
    const matches = [
      match('m1', 't1', 't2', [
        [21, 18],
        [21, 15],
      ]),
    ];
    const snapshot = JSON.stringify(matches);
    computeStandings({ participants, matches });
    expect(JSON.stringify(matches)).toBe(snapshot);
  });

  it('includes participants who have played no matches', () => {
    const standings = computeStandings({ participants, matches: [] });
    expect(standings).toHaveLength(3);
    expect(standings.every((s) => s.wins === 0 && s.losses === 0)).toBe(true);
  });

  it('assigns a match win on total points when pool sets split 1-1', () => {
    const standings = computeStandings({
      participants,
      matches: [
        match('m1', 't1', 't2', [
          [21, 15],
          [18, 21],
        ]),
      ],
      splitSetsDecidedByTotalPoints: true,
    });
    // t1: 39 points, t2: 36 -> t1 takes the match
    const t1 = standings.find((s) => s.participantId === 't1');
    expect(t1?.wins).toBe(1);
  });

  it('assigns a split-set match to the away side when it scored more', () => {
    const standings = computeStandings({
      participants,
      matches: [
        match('m1', 't1', 't2', [
          [15, 21],
          [21, 18],
        ]),
      ],
      splitSetsDecidedByTotalPoints: true,
    });
    // t1: 36 points, t2: 39 -> t2 takes the match. The mirror of the test
    // above, which only ever had the home side win on points.
    const t2 = standings.find((s) => s.participantId === 't2');
    expect(t2?.wins).toBe(1);
    expect(standings.find((s) => s.participantId === 't1')?.losses).toBe(1);
  });

  /**
   * Playoffs play a third set, so a 1-1 split means the decider has not been
   * played rather than that the match needs resolving on aggregate points.
   * `advanceBracket` refuses to advance a tied elimination match (H15); this
   * is the same rule one layer down, so the two agree about what "1-1" means.
   */
  it('leaves a split-set match undecided when total points do not settle it', () => {
    const standings = computeStandings({
      participants,
      matches: [
        match('m1', 't1', 't2', [
          [21, 15],
          [18, 21],
        ]),
      ],
      splitSetsDecidedByTotalPoints: false,
    });
    for (const id of ['t1', 't2']) {
      const row = standings.find((s) => s.participantId === id);
      expect(row?.wins).toBe(0);
      expect(row?.losses).toBe(0);
    }
  });

  it('still records sets and points for a split-set match it cannot decide', () => {
    const standings = computeStandings({
      participants,
      matches: [
        match('m1', 't1', 't2', [
          [21, 15],
          [18, 21],
        ]),
      ],
      splitSetsDecidedByTotalPoints: false,
    });
    // Undecided is not unplayed: the scoreline still counts toward the
    // differentials an organizer reads off the table.
    const t1 = standings.find((s) => s.participantId === 't1');
    expect(t1?.setsWon).toBe(1);
    expect(t1?.setsLost).toBe(1);
    expect(t1?.pointsFor).toBe(39);
    expect(t1?.pointsAgainst).toBe(36);
  });

  /**
   * AUDIT FINDING M5 — a forfeit injected a fabricated point differential
   * into the only tiebreaker that mattered. A forfeit is a win/loss with no
   * points attached.
   */
  it('M5: a forfeit does not distort point differential', () => {
    const forfeit = { ...match('m1', 't1', 't2', []), status: 'forfeit' as const };
    const standings = computeStandings({ participants, matches: [forfeit] });
    for (const s of standings) {
      expect(s.pointsFor).toBe(0);
      expect(s.pointsAgainst).toBe(0);
    }
  });
});

/**
 * Point adjustments — the organizer's penalty column.
 *
 * A tournament's rules sheet can carry penalties the scores do not: the one
 * that prompted this is "a reffing team that does not start or end its match
 * on time loses 5 points off its differential". Nothing in a match record
 * expresses that, and an organizer applying it by hand to a printed table is
 * how a bracket ends up seeded off a number nobody can reproduce.
 *
 * It arrives as INPUT to the computation, never as a column on a stored
 * standing (rule 1). Clearing a penalty is deleting a key, and the assertions
 * below pin that a cleared penalty leaves no trace at all — an organizer who
 * penalizes the wrong team at 11am has to be able to take it back at 11:01.
 */
describe('computeStandings — point adjustments', () => {
  const participants = [
    participant('t1', 'Team 1'),
    participant('t2', 'Team 2'),
    participant('t3', 'Team 3'),
  ];

  const played = [
    match('m1', 't1', 't2', [
      [21, 10],
      [21, 10],
    ]),
    match('m2', 't3', 't2', [
      [21, 19],
      [21, 19],
    ]),
  ];

  it('reports a zero adjustment on every row when none are given', () => {
    const standings = computeStandings({ participants, matches: played });
    for (const row of standings) expect(row.pointAdjustment).toBe(0);
  });

  it('subtracts a penalty from point differential and nothing else', () => {
    const clean = computeStandings({ participants, matches: played });
    const penalized = computeStandings({
      participants,
      matches: played,
      pointAdjustments: { t1: -5 },
    });

    const before = clean.find((row) => row.participantId === 't1');
    const after = penalized.find((row) => row.participantId === 't1');

    expect(after?.pointAdjustment).toBe(-5);
    expect(after?.pointDifferential).toBe((before?.pointDifferential ?? 0) - 5);

    // The scoreline is what the teams actually scored. A penalty is the
    // organizer's ruling on top of it, and overwriting pointsFor to bury the
    // adjustment would leave a table nobody can check against a scoresheet.
    expect(after?.pointsFor).toBe(before?.pointsFor);
    expect(after?.pointsAgainst).toBe(before?.pointsAgainst);
    expect(after?.wins).toBe(before?.wins);
    expect(after?.losses).toBe(before?.losses);
    expect(after?.setDifferential).toBe(before?.setDifferential);
    expect(after?.winPercentage).toBe(before?.winPercentage);
  });

  it('lets a penalty change the ranking it is a tiebreaker for', () => {
    // t1 and t3 both win one and lose none here, so the order is decided
    // further down. Without the penalty t1 leads on differential.
    const twoWinners = [
      match('m1', 't1', 't2', [
        [21, 5],
        [21, 5],
      ]),
      match('m2', 't3', 't2', [
        [21, 19],
        [21, 19],
      ]),
    ];

    const clean = computeStandings({ participants, matches: twoWinners });
    expect(clean[0]?.participantId).toBe('t1');

    const penalized = computeStandings({
      participants,
      matches: twoWinners,
      pointAdjustments: { t1: -60 },
    });
    expect(penalized[0]?.participantId).toBe('t3');
    expect(penalized.find((row) => row.participantId === 't1')?.rank).toBe(2);
  });

  it('accepts a positive adjustment, not only a penalty', () => {
    const standings = computeStandings({
      participants,
      matches: played,
      pointAdjustments: { t2: 12 },
    });
    expect(standings.find((row) => row.participantId === 't2')?.pointAdjustment).toBe(12);
  });

  it('sums repeated penalties into one adjustment per participant', () => {
    // The caller holds one number per participant, so two penalties are added
    // up before they arrive. This pins that the engine reports what it was
    // given rather than quietly capping or replacing it.
    const standings = computeStandings({
      participants,
      matches: played,
      pointAdjustments: { t2: -10 },
    });
    expect(standings.find((row) => row.participantId === 't2')?.pointAdjustment).toBe(-10);
  });

  it('clearing an adjustment leaves no trace of it', () => {
    const never = computeStandings({ participants, matches: played });
    const cleared = computeStandings({ participants, matches: played, pointAdjustments: {} });
    expect(cleared).toEqual(never);
  });

  it('ignores an adjustment against somebody who is not in the table', () => {
    const standings = computeStandings({
      participants,
      matches: played,
      pointAdjustments: { 'not-entered': -5 },
    });
    expect(standings).toEqual(computeStandings({ participants, matches: played }));
  });

  it('does not mutate the adjustments it was handed', () => {
    const adjustments = { t1: -5 };
    computeStandings({ participants, matches: played, pointAdjustments: adjustments });
    expect(adjustments).toEqual({ t1: -5 });
  });

  it('refuses an adjustment that is not a finite number', () => {
    // A NaN would poison every comparison it touches and sort the table into
    // an order nothing can explain. Raise, do not ignore.
    expect(() =>
      computeStandings({
        participants,
        matches: played,
        pointAdjustments: { t1: Number.NaN },
      }),
    ).toThrow(/finite/i);

    expect(() =>
      computeStandings({
        participants,
        matches: played,
        pointAdjustments: { t2: Number.POSITIVE_INFINITY },
      }),
    ).toThrow(/finite/i);
  });

  it('is deterministic: the same adjustments produce the same table', () => {
    const once = computeStandings({
      participants,
      matches: played,
      pointAdjustments: { t1: -5, t3: -5 },
    });
    const twice = computeStandings({
      participants,
      matches: played,
      pointAdjustments: { t3: -5, t1: -5 },
    });
    expect(twice).toEqual(once);
  });
});

describe('forfeit policy', () => {
  const teams: Participant[] = ['t1', 't2'].map((id) => ({
    id,
    competitionId: 'comp-1',
    kind: 'team' as const,
    name: id.toUpperCase(),
    registeredAt: '2026-01-01T00:00:00Z',
  }));

  /** A forfeit the organizer recorded as a real 25-0, 25-0. */
  const forfeit: Match = {
    id: 'm-forfeit',
    competitionId: 'comp-1',
    sessionId: 'sess-1',
    poolId: 'pool-a',
    courtId: 'court-1',
    timeslotId: 'ts-1',
    homeParticipantId: 't1',
    awayParticipantId: 't2',
    refParticipantId: null,
    bracket: null,
    roundLabel: 'Pool Play',
    status: 'forfeit',
    sets: [
      { id: 's1', matchId: 'm-forfeit', setNumber: 1, homePoints: 25, awayPoints: 0 },
      { id: 's2', matchId: 'm-forfeit', setNumber: 2, homePoints: 25, awayPoints: 0 },
    ],
  };

  const rowFor = (id: string, policy?: (typeof FORFEIT_POLICIES)[number]) => {
    const table = computeStandings({
      participants: teams,
      matches: [forfeit],
      ...(policy ? { forfeitPolicy: policy } : {}),
    });
    const row = table.find((r) => r.participantId === id);
    if (!row) throw new Error(`no row for ${id}`);
    return row;
  };

  it('defaults to setsOnly, which is what every earlier suite was written against', () => {
    // The default must not change behaviour. M5: points from a match nobody
    // played swung the only tiebreaker that mattered, so they stay out.
    const explicit = computeStandings({
      participants: teams,
      matches: [forfeit],
      forfeitPolicy: 'setsOnly',
    });
    expect(computeStandings({ participants: teams, matches: [forfeit] })).toEqual(explicit);
  });

  it('setsOnly counts the sets and none of the points', () => {
    const winner = rowFor('t1', 'setsOnly');
    expect(winner.wins).toBe(1);
    expect(winner.setsWon).toBe(2);
    expect(winner.pointsFor).toBe(0);
    expect(winner.pointDifferential).toBe(0);
  });

  it('winOnly counts neither sets nor points', () => {
    // Nobody gains a differential edge from an opponent's no-show.
    const winner = rowFor('t1', 'winOnly');
    const loser = rowFor('t2', 'winOnly');
    expect(winner.wins).toBe(1);
    expect(loser.losses).toBe(1);
    expect(winner.setsWon).toBe(0);
    expect(winner.setsLost).toBe(0);
    expect(winner.setDifferential).toBe(0);
    expect(winner.pointDifferential).toBe(0);
    expect(loser.setDifferential).toBe(0);
  });

  it('asScored counts both, for an organizer who records a real scoreline', () => {
    const winner = rowFor('t1', 'asScored');
    const loser = rowFor('t2', 'asScored');
    expect(winner.setsWon).toBe(2);
    expect(winner.pointsFor).toBe(50);
    expect(winner.pointDifferential).toBe(50);
    expect(loser.pointsAgainst).toBe(50);
    expect(loser.pointDifferential).toBe(-50);
  });

  it('the win and the loss are recorded under every policy', () => {
    // A forfeit is still a result. No policy may make it disappear.
    for (const policy of FORFEIT_POLICIES) {
      expect(rowFor('t1', policy).wins).toBe(1);
      expect(rowFor('t2', policy).losses).toBe(1);
    }
  });

  it('leaves matches that were actually played alone', () => {
    const played: Match = { ...forfeit, id: 'm-played', status: 'final' };
    const asScored = computeStandings({
      participants: teams,
      matches: [played],
      forfeitPolicy: 'asScored',
    });
    const winOnly = computeStandings({
      participants: teams,
      matches: [played],
      forfeitPolicy: 'winOnly',
    });
    expect(winOnly).toEqual(asScored);
    expect(winOnly[0]?.pointsFor).toBe(50);
  });

  it('is deterministic under every policy', () => {
    for (const policy of FORFEIT_POLICIES) {
      const once = computeStandings({
        participants: teams,
        matches: [forfeit],
        forfeitPolicy: policy,
      });
      const twice = computeStandings({
        participants: teams,
        matches: [forfeit],
        forfeitPolicy: policy,
      });
      expect(twice).toEqual(once);
    }
  });
});
