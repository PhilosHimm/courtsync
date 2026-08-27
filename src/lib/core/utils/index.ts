import type { UUID } from '../types/ids';
import type { Match, MatchSet } from '../types/match';
import type { Participant, ParticipantKind } from '../types/participant';
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

/**
 * A participant row ready to be inserted into a new competition. No `id` and
 * no `registeredAt` — both belong to the write, not to this transform.
 */
export interface CarriedParticipant {
  competitionId: UUID;
  kind: ParticipantKind;
  name: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  notes?: string;
}

/**
 * Copy a previous competition's teams into a new one.
 *
 * A league convener runs a season a term, and twenty teams come back with the
 * same names and the same captains. Retyping them is the tedious part of
 * setting up week one. Teams do not gain a shared identity from this — the new
 * rows are independent, so renaming or dropping a team next term touches
 * nothing historical, which is what keeps this on the right side of SCOPE.md's
 * line against player and team profiles.
 *
 * Three fields deliberately do not come across:
 *
 * `id` and `registeredAt` belong to the insert. Minting a uuid or reading the
 * clock here would make this impure (rule 9), and a team copied forward today
 * did not register last spring.
 *
 * `seed` is dropped because last season's ranking is not this season's, and
 * `drawPools` now reads it. A stale seed carried forward would silently shape
 * the new pool draw with a number nobody re-entered — which is the same class
 * of bug as H9, a remembered ranking outliving the results behind it.
 *
 * Rosters are not copied. A roster row points at a participant id, and the new
 * ids do not exist until this output is written, so cloning rosters is the
 * data layer's job once it holds the mapping.
 */
export function carryForwardParticipants(
  participants: readonly Participant[],
  competitionId: UUID,
): CarriedParticipant[] {
  return participants.map((participant) => ({
    competitionId,
    kind: participant.kind,
    name: participant.name,
    ...(participant.contactName === undefined ? {} : { contactName: participant.contactName }),
    ...(participant.contactEmail === undefined ? {} : { contactEmail: participant.contactEmail }),
    ...(participant.contactPhone === undefined ? {} : { contactPhone: participant.contactPhone }),
    ...(participant.notes === undefined ? {} : { notes: participant.notes }),
  }));
}
