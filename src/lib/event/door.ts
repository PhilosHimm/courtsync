import type { Attendance, AttendanceStatus, UUID } from '@/lib/core';
import { promoteFromWaitlist } from '@/lib/scheduling';

/**
 * The drop-in door (#26): who is in, who is waiting, who showed up.
 *
 * Pure. Each operation takes one session's attendance and returns the next
 * version of it, plus who was promoted off the waitlist — so the caller can
 * tell them. Capacity is enforced on self-service joins and never on the
 * host: the host owns the truth of who is in the building (the paper sheet's
 * one virtue), and turning a walk-in away in a gym doorway because they did
 * not sign up is the tool making the host's night worse.
 */

/** Statuses that hold a place. A no-show gave theirs back; the waitlist never had one. */
const HOLDS_PLACE: ReadonlySet<AttendanceStatus> = new Set(['registered', 'checked_in']);

export interface DoorResult {
  attendance: Attendance[];
  /** Participants moved off the waitlist by this change, in waitlist order. */
  promoted: UUID[];
}

export const occupied = (attendance: readonly Attendance[]): number =>
  attendance.filter((a) => HOLDS_PLACE.has(a.status)).length;

const nextWaitlistPos = (attendance: readonly Attendance[]): number =>
  Math.max(0, ...attendance.map((a) => a.waitlistPos ?? 0)) + 1;

/** Fill any freed places from the waitlist, in order. */
function settle(attendance: Attendance[], capacity: number | null): DoorResult {
  if (capacity === null) return { attendance, promoted: [] };
  const { promoted, attendance: next } = promoteFromWaitlist(attendance, capacity);
  return { attendance: next, promoted: promoted.map((p) => p.participantId) };
}

/**
 * A player signs themselves up. In if there is room, on the waitlist if not.
 * Signing up twice changes nothing.
 */
export function join(input: {
  attendance: readonly Attendance[];
  capacity: number | null;
  participantId: UUID;
  sessionId: UUID;
  id: UUID;
  now: string;
}): DoorResult {
  const { attendance, capacity, participantId } = input;
  if (attendance.some((a) => a.participantId === participantId)) {
    return { attendance: [...attendance], promoted: [] };
  }
  const full = capacity !== null && occupied(attendance) >= capacity;
  const entry: Attendance = full
    ? {
        id: input.id,
        sessionId: input.sessionId,
        participantId,
        status: 'waitlist',
        waitlistPos: nextWaitlistPos(attendance),
        recordedAt: input.now,
      }
    : {
        id: input.id,
        sessionId: input.sessionId,
        participantId,
        status: 'registered',
        recordedAt: input.now,
      };
  return { attendance: [...attendance, entry], promoted: [] };
}

/** A player drops out. Their place goes to the first person waiting. */
export function leave(input: {
  attendance: readonly Attendance[];
  capacity: number | null;
  participantId: UUID;
}): DoorResult {
  const rest = input.attendance.filter((a) => a.participantId !== input.participantId);
  return settle(rest, input.capacity);
}

/**
 * The host sets anyone's status — check in, no-show, back to registered,
 * onto the waitlist. Checking in someone from the waitlist lets them in even
 * when the session is full: the host is looking at the court and the model
 * is not. A no-show frees a place, which goes to the waitlist.
 */
export function hostSet(input: {
  attendance: readonly Attendance[];
  capacity: number | null;
  participantId: UUID;
  status: AttendanceStatus;
  now: string;
}): DoorResult {
  const { participantId, status, now } = input;
  if (!input.attendance.some((a) => a.participantId === participantId)) {
    throw new Error('That player is not on this session’s list.');
  }
  const pos = nextWaitlistPos(input.attendance);
  const changed = input.attendance.map((a): Attendance => {
    if (a.participantId !== participantId) return a;
    const { waitlistPos: _drop, ...rest } = a;
    return status === 'waitlist'
      ? {
          ...rest,
          status,
          waitlistPos: a.status === 'waitlist' ? (a.waitlistPos ?? pos) : pos,
          recordedAt: now,
        }
      : { ...rest, status, recordedAt: now };
  });
  return settle(renumber(changed), input.capacity);
}

/**
 * Self check-in: a registered player marks themselves present. Only from
 * `registered` — a waitlisted player checking themselves in would be taking
 * a place nobody gave them, and a no-show undoing their own no-show is the
 * host's call.
 */
export function selfCheckIn(input: {
  attendance: readonly Attendance[];
  participantId: UUID;
  now: string;
}): Attendance[] {
  const entry = input.attendance.find((a) => a.participantId === input.participantId);
  if (!entry) throw new Error('You are not signed up for this session.');
  if (entry.status === 'checked_in') return [...input.attendance];
  if (entry.status !== 'registered') {
    throw new Error(
      entry.status === 'waitlist'
        ? 'You are on the waitlist. The host can check you in if there is room.'
        : 'Ask the host to check you in.',
    );
  }
  return input.attendance.map((a) =>
    a.participantId === input.participantId
      ? { ...a, status: 'checked_in', recordedAt: input.now }
      : a,
  );
}

/** A walk-in, added by name at the door: checked in, capacity or not. */
export function walkIn(input: {
  attendance: readonly Attendance[];
  participantId: UUID;
  sessionId: UUID;
  id: UUID;
  now: string;
}): Attendance[] {
  return [
    ...input.attendance,
    {
      id: input.id,
      sessionId: input.sessionId,
      participantId: input.participantId,
      status: 'checked_in',
      recordedAt: input.now,
    },
  ];
}

/** Waitlist positions 1..n in their existing order — a waitlist with a hole is one nobody trusts. */
function renumber(attendance: Attendance[]): Attendance[] {
  const waiting = attendance
    .filter((a) => a.status === 'waitlist')
    .sort((a, b) => (a.waitlistPos ?? 0) - (b.waitlistPos ?? 0));
  const position = new Map(waiting.map((a, i) => [a.participantId, i + 1]));
  return attendance.map((a) =>
    a.status === 'waitlist' ? { ...a, waitlistPos: position.get(a.participantId) ?? 1 } : a,
  );
}
