import type {
  Attendance,
  AttendanceStatus,
  Court,
  Participant,
  Session,
  Timeslot,
} from '@/lib/core';
import type { DropInRotationOutput, WaitlistPromotion } from '@/lib/scheduling';
import { generateDropInRotation, promoteFromWaitlist } from '@/lib/scheduling';
import type { StoredAttendanceEntry, StoredDropIn } from '@/lib/storage';
import { competitionSlug, STORAGE_SCHEMA_VERSION } from '@/lib/storage';
import { addMinutes, buildTimeslots } from './time';

/**
 * The drop-in host's night: the door, then the rotation.
 *
 * The stored record holds who signed up and what the host has recorded about
 * each of them — registered, waitlisted, checked in, no-show. The rotation is
 * never stored: it is `generateDropInRotation` over whoever is checked in
 * right now, rebuilt on every read, which is why checking one more player in
 * reflows the courts instantly and consistently.
 *
 * Every action here is a pure `stored -> stored` transform (rule 10). The
 * event handler mints ids and timestamps; nothing here reads a clock.
 */

/** Statuses that occupy a place in the session — must match the engine's rule. */
const OCCUPIES_CAPACITY: ReadonlySet<AttendanceStatus> = new Set(['registered', 'checked_in']);

export interface DropInSetup {
  name: string;
  venueName?: string;
  playDate: string;
  startTime: string;
  gameDurationMin: number;
  bufferMin: number;
  courtNames: string[];
  rounds: number;
  capacity: number;
  playersPerSide: number;
}

/** A new stored drop-in night. `id` and `now` come from the caller. */
export function createDropIn(setup: DropInSetup, id: string, now: string): StoredDropIn {
  return {
    id,
    schemaVersion: STORAGE_SCHEMA_VERSION,
    ...setup,
    players: [],
    attendance: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function occupiedCount(stored: StoredDropIn): number {
  return stored.attendance.filter((entry) => OCCUPIES_CAPACITY.has(entry.status)).length;
}

/** Waitlist positions renumbered 1..n in existing order, everything else untouched. */
function renumberWaitlist(attendance: StoredAttendanceEntry[]): StoredAttendanceEntry[] {
  const waitlisted = attendance
    .filter((entry) => entry.status === 'waitlist')
    .sort((a, b) => (a.waitlistPos ?? 0) - (b.waitlistPos ?? 0));
  const positions = new Map(waitlisted.map((entry, i) => [entry.participantId, i + 1]));

  return attendance.map((entry) => {
    if (entry.status !== 'waitlist') {
      const { waitlistPos: _dropped, ...rest } = entry;
      return rest;
    }
    return { ...entry, waitlistPos: positions.get(entry.participantId) ?? 0 };
  });
}

/**
 * Sign a player up. Inside capacity they arrive `registered`; past it they
 * waitlist at the back, in sign-up order — the only fair order at a door.
 */
export function signUpPlayer(
  stored: StoredDropIn,
  player: { id: string; name: string },
  now: string,
): StoredDropIn {
  const inCap = occupiedCount(stored) < stored.capacity;
  const waitlistCount = stored.attendance.filter((e) => e.status === 'waitlist').length;

  const entry: StoredAttendanceEntry = inCap
    ? { participantId: player.id, status: 'registered', recordedAt: now }
    : {
        participantId: player.id,
        status: 'waitlist',
        waitlistPos: waitlistCount + 1,
        recordedAt: now,
      };

  return {
    ...stored,
    players: [...stored.players, { id: player.id, name: player.name.trim() }],
    attendance: [...stored.attendance, entry],
    updatedAt: now,
  };
}

function setStatus(
  stored: StoredDropIn,
  participantId: string,
  status: AttendanceStatus,
  now: string,
): StoredDropIn {
  const attendance = stored.attendance.map((entry) =>
    entry.participantId === participantId ? { ...entry, status, recordedAt: now } : entry,
  );
  return { ...stored, attendance: renumberWaitlist(attendance), updatedAt: now };
}

/** Through the door. Allowed from any status — the host's call is final. */
export function checkInPlayer(
  stored: StoredDropIn,
  participantId: string,
  now: string,
): StoredDropIn {
  return setStatus(stored, participantId, 'checked_in', now);
}

/** Registered but never appeared. Frees their place for a promotion. */
export function markNoShow(stored: StoredDropIn, participantId: string, now: string): StoredDropIn {
  return setStatus(stored, participantId, 'no_show', now);
}

/** Undo a check-in or no-show, back to plain registered. */
export function resetToRegistered(
  stored: StoredDropIn,
  participantId: string,
  now: string,
): StoredDropIn {
  return setStatus(stored, participantId, 'registered', now);
}

export function removePlayer(
  stored: StoredDropIn,
  participantId: string,
  now: string,
): StoredDropIn {
  return {
    ...stored,
    players: stored.players.filter((p) => p.id !== participantId),
    attendance: renumberWaitlist(
      stored.attendance.filter((e) => e.participantId !== participantId),
    ),
    updatedAt: now,
  };
}

function toEngineAttendance(stored: StoredDropIn, sessionId: string): Attendance[] {
  return stored.attendance.map((entry) => ({
    id: `${sessionId}-att-${entry.participantId}`,
    sessionId,
    participantId: entry.participantId,
    status: entry.status,
    ...(entry.waitlistPos === undefined ? {} : { waitlistPos: entry.waitlistPos }),
    recordedAt: entry.recordedAt,
  }));
}

/**
 * Fill freed places from the waitlist, strictly in order, via the engine.
 * A promoted player becomes `registered`, not `checked_in` — being told a
 * place opened up is not the same as walking through the door.
 */
export function promoteWaitlist(
  stored: StoredDropIn,
  now: string,
): { stored: StoredDropIn; promoted: WaitlistPromotion[] } {
  const sessionId = `${competitionSlug(stored.id)}-s1`;
  const { promoted, attendance } = promoteFromWaitlist(
    toEngineAttendance(stored, sessionId),
    stored.capacity,
  );
  if (promoted.length === 0) return { stored, promoted };

  const byId = new Map(attendance.map((entry) => [entry.participantId, entry]));
  return {
    promoted,
    stored: {
      ...stored,
      attendance: stored.attendance.map((entry) => {
        const next = byId.get(entry.participantId);
        if (!next) return entry;
        return {
          participantId: entry.participantId,
          status: next.status,
          ...(next.waitlistPos === undefined ? {} : { waitlistPos: next.waitlistPos }),
          recordedAt: entry.recordedAt,
        };
      }),
      updatedAt: now,
    },
  };
}

export interface DropInView {
  stored: StoredDropIn;
  slug: string;
  session: Session;
  courts: Court[];
  timeslots: Timeslot[];
  participants: Participant[];
  attendance: Attendance[];
  rotation: DropInRotationOutput;
  /** Rounds each checked-in player sits out. Even is the whole point. */
  sitOutCounts: Record<string, number>;
  counts: {
    signedUp: number;
    checkedIn: number;
    registered: number;
    waitlisted: number;
    noShows: number;
    /** Places free for the next promotion. */
    openings: number;
  };
  nameOf: Record<string, string>;
}

export function buildDropInView(stored: StoredDropIn): DropInView {
  const slug = competitionSlug(stored.id);
  const sessionId = `${slug}-s1`;

  const session: Session = {
    id: sessionId,
    competitionId: stored.id,
    name: stored.name,
    playDate: stored.playDate,
    startTime: stored.startTime,
    endTime: addMinutes(
      stored.startTime,
      stored.rounds * (stored.gameDurationMin + stored.bufferMin),
    ),
    sequence: 1,
  };

  const courts: Court[] = stored.courtNames.map((name, i) => ({
    id: `${slug}-court-${i + 1}`,
    competitionId: stored.id,
    name: name.trim() || `Court ${i + 1}`,
    isActive: true,
  }));

  const timeslots = buildTimeslots({
    sessionId,
    playDate: stored.playDate,
    startTime: stored.startTime,
    count: stored.rounds,
    durationMin: stored.gameDurationMin,
    bufferMin: stored.bufferMin,
  });

  const participants: Participant[] = stored.players.map((player) => ({
    id: player.id,
    competitionId: stored.id,
    kind: 'individual' as const,
    name: player.name,
    registeredAt: stored.createdAt,
  }));
  const nameOf = Object.fromEntries(participants.map((p) => [p.id, p.name]));

  const attendance = toEngineAttendance(stored, sessionId);

  const rotation = generateDropInRotation({
    competitionSlug: slug,
    competitionId: stored.id,
    sessionId,
    sessionSequence: 1,
    attendance,
    courtIds: courts.map((c) => c.id),
    timeslotIds: timeslots.map((t) => t.id),
    playersPerSide: stored.playersPerSide,
  });

  const sitOutCounts: Record<string, number> = {};
  for (const entry of attendance) {
    if (entry.status === 'checked_in') sitOutCounts[entry.participantId] = 0;
  }
  for (const ids of Object.values(rotation.sittingOut)) {
    for (const id of ids) sitOutCounts[id] = (sitOutCounts[id] ?? 0) + 1;
  }

  const byStatus = (status: AttendanceStatus) =>
    attendance.filter((entry) => entry.status === status).length;

  return {
    stored,
    slug,
    session,
    courts,
    timeslots,
    participants,
    attendance,
    rotation,
    sitOutCounts,
    counts: {
      signedUp: attendance.length,
      checkedIn: byStatus('checked_in'),
      registered: byStatus('registered'),
      waitlisted: byStatus('waitlist'),
      noShows: byStatus('no_show'),
      openings: Math.max(0, stored.capacity - occupiedCount(stored)),
    },
    nameOf,
  };
}
