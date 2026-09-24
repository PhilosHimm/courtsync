import type { UUID } from './ids';

/**
 * The app's row for a signed-in person, created on first sign-in.
 *
 * Neon Auth holds the identity; this mirrors it so `created_by`,
 * `processed_by` and `edited_by` reference a real table in the same
 * database. `authUserId` is whatever the auth service calls the user, stored
 * as given and never parsed.
 */
export interface AppUser {
  id: UUID;
  authUserId: string;
  email?: string;
  displayName?: string;
  phone?: string;
  createdAt: string;
}

/**
 * Roles beyond the owner. The owner is `Competition.createdBy`; a
 * co-organizer can do everything the owner can except delete the event or
 * change who else runs it. Scorekeepers are not a role — they hold a
 * per-match link, not an account.
 */
export type MemberRole = 'co_organizer';

export const MEMBER_ROLES: readonly MemberRole[] = ['co_organizer'] as const;

/** Mirrors `notification_channel`. */
export type NotificationChannel = 'email' | 'sms';

export const NOTIFICATION_CHANNELS: readonly NotificationChannel[] = ['email', 'sms'] as const;

/** Per-channel consent, timestamped. Off until somebody turns it on. */
export interface NotificationPreference {
  userId: UUID;
  emailOptIn: boolean;
  smsOptIn: boolean;
  emailConsentAt?: string;
  smsConsentAt?: string;
}

/** Something the organizer told everyone. Null session means the whole event. */
export interface Announcement {
  id: UUID;
  competitionId: UUID;
  sessionId: UUID | null;
  body: string;
  createdBy?: UUID;
  createdAt: string;
}
