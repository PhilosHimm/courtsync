import type { UUID } from '../types/ids';
import type { Match, MatchSet } from '../types/match';
import type { PaymentStatus, PaymentSummary, Transaction } from '../types/payment';

export const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

/**
 * Sets won by each side of a match. Ignores unfinished sets.
 *
 * A set is won by whoever has more points; a set with equal points is not
 * yet decided and counts for neither side.
 */
export function setsWon(match: Match): { home: number; away: number } {
  let home = 0;
  let away = 0;
  for (const s of match.sets) {
    if (s.homePoints > s.awayPoints) home += 1;
    else if (s.awayPoints > s.homePoints) away += 1;
  }
  return { home, away };
}

/** Total points scored by each side across every set. */
export function totalPoints(match: Match): { home: number; away: number } {
  let home = 0;
  let away = 0;
  for (const s of match.sets) {
    home += s.homePoints;
    away += s.awayPoints;
  }
  return { home, away };
}

export function sortSets(sets: readonly MatchSet[]): MatchSet[] {
  return [...sets].sort((a, b) => a.setNumber - b.setNumber);
}

/**
 * Fold a participant's transaction ledger into a balance.
 *
 * `payment` adds, `refund` subtracts, `adjustment` subtracts — an adjustment
 * is how an organizer corrects an over-recorded payment without deleting the
 * original row.
 */
export function summarizePayments(
  participantId: UUID,
  registrationFee: number,
  transactions: readonly Transaction[],
): PaymentSummary {
  let amountPaid = 0;
  let lastPaymentAt: string | undefined;

  for (const tx of transactions) {
    if (tx.participantId !== participantId) continue;
    amountPaid += tx.type === 'payment' ? tx.amount : -tx.amount;
    if (tx.type === 'payment' && (!lastPaymentAt || tx.processedAt > lastPaymentAt)) {
      lastPaymentAt = tx.processedAt;
    }
  }

  const balanceDue = registrationFee - amountPaid;
  let status: PaymentStatus;
  if (amountPaid >= registrationFee) status = 'paid';
  else if (amountPaid > 0) status = 'partial';
  else status = 'unpaid';

  return lastPaymentAt === undefined
    ? { participantId, registrationFee, amountPaid, balanceDue, status }
    : { participantId, registrationFee, amountPaid, balanceDue, status, lastPaymentAt };
}
