/**
 * SKIPPED — specification for `computeStandings`.
 *
 * Encodes audit finding H9 (nondeterministic tiebreaks, records ignored)
 * and the tiebreaker order from the Tournament Scheduler MVP spec.
 */

import type { Match, MatchSet, Participant } from '@courtsync/core';
import { describe, expect, it } from 'vitest';
import { computeStandings } from '../src/standings';

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

describe.skip('computeStandings', () => {
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
