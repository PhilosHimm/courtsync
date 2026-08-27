import { describe, expect, it } from 'vitest';
import type { Transaction } from '@/lib/core/types/payment';
import { summarizePayments } from '@/lib/core/utils/index';

const tx = (over: Partial<Transaction> & Pick<Transaction, 'type' | 'amount'>): Transaction => ({
  id: 'tx',
  participantId: 'team-1',
  processedAt: '2026-01-01T00:00:00Z',
  ...over,
});

describe('summarizePayments', () => {
  it('reports unpaid when nothing has been recorded', () => {
    const s = summarizePayments('team-1', 100, []);
    expect(s.status).toBe('unpaid');
    expect(s.amountPaid).toBe(0);
    expect(s.balanceDue).toBe(100);
    expect(s.lastPaymentAt).toBeUndefined();
  });

  it('reports partial for an under-payment', () => {
    const s = summarizePayments('team-1', 100, [tx({ type: 'payment', amount: 40 })]);
    expect(s.status).toBe('partial');
    expect(s.balanceDue).toBe(60);
  });

  it('reports paid once the fee is met', () => {
    const s = summarizePayments('team-1', 100, [
      tx({ type: 'payment', amount: 60 }),
      tx({ type: 'payment', amount: 40, processedAt: '2026-01-02T00:00:00Z' }),
    ]);
    expect(s.status).toBe('paid');
    expect(s.balanceDue).toBe(0);
    expect(s.lastPaymentAt).toBe('2026-01-02T00:00:00Z');
  });

  it('subtracts refunds and can move a team back to partial', () => {
    const s = summarizePayments('team-1', 100, [
      tx({ type: 'payment', amount: 100 }),
      tx({ type: 'refund', amount: 30, processedAt: '2026-01-03T00:00:00Z' }),
    ]);
    expect(s.amountPaid).toBe(70);
    expect(s.status).toBe('partial');
  });

  it('corrects an over-recorded payment via adjustment rather than deletion', () => {
    const s = summarizePayments('team-1', 100, [
      tx({ type: 'payment', amount: 150 }),
      tx({ type: 'adjustment', amount: 50, processedAt: '2026-01-04T00:00:00Z' }),
    ]);
    expect(s.amountPaid).toBe(100);
    expect(s.status).toBe('paid');
  });

  it('does not count another participant transactions', () => {
    const s = summarizePayments('team-1', 100, [
      tx({ type: 'payment', amount: 100, participantId: 'team-2' }),
    ]);
    expect(s.amountPaid).toBe(0);
    expect(s.status).toBe('unpaid');
  });

  it('takes the latest payment date, not the latest transaction date', () => {
    const s = summarizePayments('team-1', 100, [
      tx({ type: 'payment', amount: 100, processedAt: '2026-01-01T00:00:00Z' }),
      tx({ type: 'refund', amount: 10, processedAt: '2026-06-01T00:00:00Z' }),
    ]);
    expect(s.lastPaymentAt).toBe('2026-01-01T00:00:00Z');
  });
});
