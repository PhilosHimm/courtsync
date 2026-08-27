/**
 * Boundary coverage for the shared domain helpers.
 *
 * These are small, but everything downstream leans on them: standings and
 * bracket advancement both decide who won a match by calling `setsWon`, and
 * the payment ledger is the only place money is reasoned about.
 */

import { describe, expect, it } from 'vitest';
import type { Match, MatchSet, Transaction } from '@/lib/core/types/index';
import {
  isNonEmptyString,
  setsWon,
  sortSets,
  summarizePayments,
  totalPoints,
} from '@/lib/core/utils/index';

function match(scores: Array<[number, number]>): Match {
  return {
    id: 'm1',
    competitionId: 'comp-1',
    sessionId: 'sess-1',
    poolId: 'pool-a',
    courtId: 'court-1',
    timeslotId: 'ts-1',
    homeParticipantId: 't1',
    awayParticipantId: 't2',
    status: 'final',
    sets: scores.map(([h, a], i) => ({
      id: `m1-s${i + 1}`,
      matchId: 'm1',
      setNumber: i + 1,
      homePoints: h,
      awayPoints: a,
    })),
  };
}

const tx = (over: Partial<Transaction> & Pick<Transaction, 'type' | 'amount'>): Transaction => ({
  id: 'tx',
  participantId: 'team-1',
  processedAt: '2026-01-01T00:00:00Z',
  ...over,
});

describe('isNonEmptyString', () => {
  it('rejects whitespace, empties and non-strings', () => {
    expect(isNonEmptyString('a')).toBe(true);
    expect(isNonEmptyString('  padded  ')).toBe(true);
    expect(isNonEmptyString('')).toBe(false);
    expect(isNonEmptyString('   ')).toBe(false);
    expect(isNonEmptyString(null)).toBe(false);
    expect(isNonEmptyString(undefined)).toBe(false);
    expect(isNonEmptyString(0)).toBe(false);
  });
});

describe('setsWon', () => {
  it('counts nothing for a match with no sets', () => {
    expect(setsWon(match([]))).toEqual({ home: 0, away: 0 });
  });

  it('credits a set to neither side when the points are level', () => {
    // A level set is not yet decided, so it belongs to nobody. Awarding it to
    // one side would silently invent a result.
    expect(setsWon(match([[21, 21]]))).toEqual({ home: 0, away: 0 });
  });

  it('counts a mixed match correctly', () => {
    expect(
      setsWon(
        match([
          [21, 18],
          [19, 21],
          [15, 10],
        ]),
      ),
    ).toEqual({ home: 2, away: 1 });
  });

  it('handles a 0-0 set as undecided rather than a draw for both', () => {
    expect(setsWon(match([[0, 0]]))).toEqual({ home: 0, away: 0 });
  });
});

describe('totalPoints', () => {
  it('is zero for a match with no sets', () => {
    expect(totalPoints(match([]))).toEqual({ home: 0, away: 0 });
  });

  it('sums across every set regardless of who won them', () => {
    expect(
      totalPoints(
        match([
          [21, 18],
          [19, 21],
        ]),
      ),
    ).toEqual({ home: 40, away: 39 });
  });
});

describe('sortSets', () => {
  it('orders by set number without mutating the input', () => {
    const sets: MatchSet[] = [
      { id: 'c', matchId: 'm1', setNumber: 3, homePoints: 15, awayPoints: 10 },
      { id: 'a', matchId: 'm1', setNumber: 1, homePoints: 21, awayPoints: 18 },
      { id: 'b', matchId: 'm1', setNumber: 2, homePoints: 19, awayPoints: 21 },
    ];
    const snapshot = JSON.stringify(sets);

    expect(sortSets(sets).map((s) => s.setNumber)).toEqual([1, 2, 3]);
    expect(JSON.stringify(sets)).toBe(snapshot);
  });

  it('handles an empty list', () => {
    expect(sortSets([])).toEqual([]);
  });
});

describe('summarizePayments — edges', () => {
  it('reports a zero fee as paid without dividing by anything', () => {
    const s = summarizePayments('team-1', 0, []);
    expect(s.status).toBe('paid');
    expect(s.balanceDue).toBe(0);
  });

  it('reports an overpayment as paid with a negative balance', () => {
    // Surfaced rather than clamped: an organizer needs to see they owe a
    // refund, not a tidy zero.
    const s = summarizePayments('team-1', 100, [tx({ type: 'payment', amount: 150 })]);
    expect(s.status).toBe('paid');
    expect(s.balanceDue).toBe(-50);
  });

  it('handles a refund with no prior payment, going negative', () => {
    const s = summarizePayments('team-1', 100, [tx({ type: 'refund', amount: 20 })]);
    expect(s.amountPaid).toBe(-20);
    expect(s.status).toBe('unpaid');
    expect(s.lastPaymentAt).toBeUndefined();
  });

  it('ignores an empty ledger', () => {
    const s = summarizePayments('team-1', 50, []);
    expect(s).toEqual({
      participantId: 'team-1',
      registrationFee: 50,
      amountPaid: 0,
      balanceDue: 50,
      status: 'unpaid',
    });
  });

  it('nets several adjustments in both directions', () => {
    const s = summarizePayments('team-1', 100, [
      tx({ type: 'payment', amount: 60 }),
      tx({ type: 'payment', amount: 60, processedAt: '2026-01-02T00:00:00Z' }),
      tx({ type: 'adjustment', amount: 20, processedAt: '2026-01-03T00:00:00Z' }),
    ]);
    expect(s.amountPaid).toBe(100);
    expect(s.status).toBe('paid');
    expect(s.lastPaymentAt).toBe('2026-01-02T00:00:00Z');
  });

  it('does not mutate the ledger it was given', () => {
    const ledger = [tx({ type: 'payment', amount: 40 })];
    const snapshot = JSON.stringify(ledger);
    summarizePayments('team-1', 100, ledger);
    expect(JSON.stringify(ledger)).toBe(snapshot);
  });
});
