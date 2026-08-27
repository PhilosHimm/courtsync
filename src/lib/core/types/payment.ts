import type { UUID } from './ids';

/**
 * Payment tracking exists because organizers currently chase registration
 * fees in a spreadsheet. CourtSync records what the organizer tells it.
 *
 * It does NOT process payments, hold funds, or touch a payment gateway.
 * Nothing here is app revenue — the app is free.
 */
export type PaymentMethod = 'cash' | 'check' | 'credit_card' | 'etransfer' | 'other';

export type TransactionType = 'payment' | 'refund' | 'adjustment';

export const PAYMENT_METHODS: readonly PaymentMethod[] = [
  'cash',
  'check',
  'credit_card',
  'etransfer',
  'other',
] as const;

export const TRANSACTION_TYPES: readonly TransactionType[] = [
  'payment',
  'refund',
  'adjustment',
] as const;

/**
 * An append-only ledger entry against a participant.
 *
 * Never update or delete a transaction to correct a mistake — write an
 * `adjustment` instead. The running balance is a fold over this list, and
 * an organizer needs to be able to explain every number to a team captain.
 */
export interface Transaction {
  id: UUID;
  participantId: UUID;
  type: TransactionType;
  /** Always positive. `type` carries the sign. */
  amount: number;
  paymentMethod?: PaymentMethod;
  referenceNumber?: string;
  processedAt: string;
  /** Opaque user id of whoever recorded this. No FK yet — see docs/DECISIONS.md. */
  processedBy?: UUID;
  receiptUrl?: string;
  notes?: string;
}

export type PaymentStatus = 'paid' | 'partial' | 'unpaid';

/** Computed from `Transaction[]` plus the competition's registration fee. */
export interface PaymentSummary {
  participantId: UUID;
  registrationFee: number;
  amountPaid: number;
  balanceDue: number;
  status: PaymentStatus;
  lastPaymentAt?: string;
}
