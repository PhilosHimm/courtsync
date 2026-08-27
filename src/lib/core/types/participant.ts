import type { UUID } from './ids';

/**
 * Tournaments and leagues have teams. Drop-ins have people who form sides
 * on the night. Both are participants; only the `kind` differs.
 */
export type ParticipantKind = 'team' | 'individual';

export const PARTICIPANT_KINDS: readonly ParticipantKind[] = ['team', 'individual'] as const;

/**
 * Who is competing.
 *
 * Deliberately carries NO win/loss/points columns. Audit finding H9 traces
 * directly to scoop denormalizing `wins`, `losses`, `points_for` and
 * `points_against` onto the team row, where they drifted out of sync with
 * the matches they were supposed to summarize. Standings are computed from
 * matches on read. See `Standing`.
 */
export interface Participant {
  id: UUID;
  competitionId: UUID;
  kind: ParticipantKind;
  name: string;
  /** Optional seeding for bracket placement. */
  seed?: number;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  registeredAt: string;
  notes?: string;
}

/**
 * Drop-in capacity management. A session has a roster cap; people register,
 * overflow goes to a waitlist, and the organizer records who actually showed.
 *
 * This is the drop-in organizer's real pain — not schedule generation.
 */
export type AttendanceStatus = 'registered' | 'waitlist' | 'checked_in' | 'no_show';

export const ATTENDANCE_STATUSES: readonly AttendanceStatus[] = [
  'registered',
  'waitlist',
  'checked_in',
  'no_show',
] as const;

export interface Attendance {
  id: UUID;
  sessionId: UUID;
  participantId: UUID;
  status: AttendanceStatus;
  /** 1-based position when `status` is `waitlist`; undefined otherwise. */
  waitlistPos?: number;
  recordedAt: string;
}
