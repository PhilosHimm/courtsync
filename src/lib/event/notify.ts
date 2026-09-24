import type { NotificationChannel, UUID } from '@/lib/core';

/**
 * What to tell people, and how often (#27).
 *
 * Pure: builds messages and decides which queued ones go out together. The
 * data layer queues and marks; the provider module sends. A schedule edit at
 * 8:52 must not fire forty texts per move, so every message carries a digest
 * key — "schedule changes for this event, for this person" — and queued
 * messages sharing a key are held for a short window and sent as one.
 */

/** How long a message waits for others with the same key before it goes. */
export const DIGEST_WINDOW_MS = 2 * 60_000;
/** The longest a message can be held by a steady stream of edits. */
export const DIGEST_MAX_HOLD_MS = 10 * 60_000;

export type Notice =
  | { kind: 'announcement'; eventName: string; eventId: UUID; body: string }
  | {
      kind: 'session-cancelled';
      eventName: string;
      eventId: UUID;
      sessionLabel: string;
      reason: string | null;
    }
  | { kind: 'schedule-changed'; eventName: string; eventId: UUID; line: string }
  | { kind: 'promoted'; eventName: string; eventId: UUID; sessionLabel: string };

export interface Rendered {
  digestKey: string;
  subject: string;
  body: string;
}

/** One notice as a message. The key groups what may be sent together. */
export function render(notice: Notice): Rendered {
  switch (notice.kind) {
    case 'announcement':
      return {
        digestKey: `announce:${notice.eventId}`,
        subject: `${notice.eventName}: an announcement`,
        body: notice.body,
      };
    case 'session-cancelled':
      return {
        // Never coalesced away: its own key per session.
        digestKey: `cancel:${notice.eventId}:${notice.sessionLabel}`,
        subject: `${notice.eventName}: ${notice.sessionLabel} is cancelled`,
        body: `${notice.sessionLabel} is cancelled.${notice.reason ? ` ${notice.reason}` : ''}`,
      };
    case 'schedule-changed':
      return {
        digestKey: `schedule:${notice.eventId}`,
        subject: `${notice.eventName}: the schedule changed`,
        body: notice.line,
      };
    case 'promoted':
      return {
        digestKey: `promoted:${notice.eventId}:${notice.sessionLabel}`,
        subject: `${notice.eventName}: you are in for ${notice.sessionLabel}`,
        body: `A place opened up and you are off the waitlist for ${notice.sessionLabel}. If you can no longer make it, leave the session so the next person gets it.`,
      };
  }
}

/** The channels a person has consented to and can be reached on. */
export function channelsFor(
  preference: { emailOptIn: boolean; smsOptIn: boolean } | null,
  contact: { email?: string | null; phone?: string | null },
): NotificationChannel[] {
  if (!preference) return [];
  const channels: NotificationChannel[] = [];
  if (preference.emailOptIn && contact.email) channels.push('email');
  if (preference.smsOptIn && contact.phone) channels.push('sms');
  return channels;
}

/**
 * When a newly queued message may go, given an unsent one with the same key.
 * Joining an existing message pushes it back by the window, but never past
 * its maximum hold — a steady stream of edits still sends something.
 */
export function holdUntil(input: { now: string; existingCreatedAt: string | null }): string {
  const now = Date.parse(input.now);
  if (input.existingCreatedAt === null) return new Date(now + DIGEST_WINDOW_MS).toISOString();
  const cap = Date.parse(input.existingCreatedAt) + DIGEST_MAX_HOLD_MS;
  return new Date(Math.min(now + DIGEST_WINDOW_MS, cap)).toISOString();
}

/** Join a new line onto a held message, once per distinct line. */
export function appendBody(existing: string, line: string): string {
  const lines = existing.split('\n');
  return lines.includes(line) ? existing : `${existing}\n${line}`;
}

/** An SMS is one or two segments, not an essay: trim with an ellipsis. */
export function smsText(subject: string, body: string, limit = 300): string {
  const text = `${subject}\n${body}`;
  return text.length <= limit ? text : `${text.slice(0, limit - 1)}…`;
}
