import type { Attendance, Match, UUID } from '@/lib/core';
import { dropInMatchId } from './match-ids';

export interface DropInRotationInput {
  competitionSlug: string;
  sessionId: UUID;
  sessionSequence: number;
  /** Only `checked_in` entries should be placed. */
  attendance: Attendance[];
  courtIds: UUID[];
  timeslotIds: UUID[];
  /** Players per side. 6 for indoor, 2 for beach, 4 for common rec formats. */
  playersPerSide: number;
  /**
   * The competition's real id. Scheduling is pure and never reads a database,
   * so callers that already know the persisted id pass it here; otherwise the
   * slug stands in and the persistence layer remaps.
   */
  competitionId?: UUID;
}

export interface DropInSide {
  participantIds: UUID[];
}

export interface DropInRotationOutput {
  matches: Match[];
  /** Sides formed for each match, in match order. */
  sides: Array<{ matchId: string; home: DropInSide; away: DropInSide }>;
  /** Players sitting out each timeslot, in timeslot order. */
  sittingOut: Record<UUID, UUID[]>;
}

export interface WaitlistPromotion {
  participantId: UUID;
  fromPosition: number;
}

/** Statuses that occupy a place in the session. */
const OCCUPIES_CAPACITY = new Set(['registered', 'checked_in']);

/**
 * Build a rotation for a drop-in night.
 *
 * Two requirements pull against each other here. Court time has to be shared
 * evenly, which a rotating queue gives you: whoever sat out last time moves
 * to the front. But sides also have to be reshuffled between rounds, and a
 * queue alone does not do that — when nobody sits out, the queue comes back
 * around unchanged and everyone plays the same teammates all night, which is
 * exactly what a drop-in is meant to avoid.
 *
 * So the queue decides *who plays*, and a per-round offset decides *who is on
 * whose side*. The offset is deliberately not a multiple of `playersPerSide`;
 * rotating by a whole side just relabels the same groups.
 */
export function generateDropInRotation(input: DropInRotationInput): DropInRotationOutput {
  const { competitionSlug, sessionId, sessionSequence, attendance, courtIds, timeslotIds } = input;
  const competitionId = input.competitionId ?? competitionSlug;
  const playersPerSide = Math.max(0, Math.trunc(input.playersPerSide));
  const playersPerMatch = playersPerSide * 2;

  // Only people actually in the gym get placed. Registered-but-absent and
  // waitlisted players are not on a court.
  const queue: UUID[] = attendance
    .filter((entry) => entry.status === 'checked_in')
    .map((entry) => entry.participantId);

  const matches: Match[] = [];
  const sides: DropInRotationOutput['sides'] = [];
  const sittingOut: Record<UUID, UUID[]> = {};

  if (playersPerMatch === 0 || courtIds.length === 0) {
    for (const timeslotId of timeslotIds) sittingOut[timeslotId] = [...queue];
    return { matches, sides, sittingOut };
  }

  let matchNumber = 0;

  for (const [slotIndex, timeslotId] of timeslotIds.entries()) {
    const concurrent = Math.min(courtIds.length, Math.floor(queue.length / playersPerMatch));
    const playingCount = concurrent * playersPerMatch;

    const playing = queue.slice(0, playingCount);
    sittingOut[timeslotId] = queue.slice(playingCount);

    // Reshuffle who partners with whom. A whole-side rotation would keep the
    // same groupings, so this deliberately offsets by rounds rather than sides.
    const offset = playing.length === 0 ? 0 : slotIndex % playing.length;
    const shuffled = [...playing.slice(offset), ...playing.slice(0, offset)];

    for (let c = 0; c < concurrent; c++) {
      const block = shuffled.slice(c * playersPerMatch, (c + 1) * playersPerMatch);
      const home = block.slice(0, playersPerSide);
      const away = block.slice(playersPerSide);
      const court = courtIds[c];

      matchNumber += 1;
      const matchId = dropInMatchId(competitionSlug, sessionSequence, matchNumber);

      matches.push({
        id: matchId,
        competitionId,
        sessionId,
        poolId: null,
        courtId: court ?? null,
        timeslotId,
        // A drop-in side is a set of people assembled for one round, not a
        // persisted participant, so the roster lives in `sides` instead.
        homeParticipantId: null,
        awayParticipantId: null,
        refParticipantId: null,
        bracket: null,
        roundLabel: null,
        status: 'scheduled',
        sets: [],
      });

      sides.push({ matchId, home: { participantIds: home }, away: { participantIds: away } });
    }

    // Whoever played goes to the back, so the people who sat are first in line
    // next round. This is what keeps sit-outs even.
    if (playingCount > 0) {
      queue.push(...queue.splice(0, playingCount));
    }
  }

  return { matches, sides, sittingOut };
}

/**
 * Promote waitlisted players into a session when capacity frees up.
 *
 * Promotes strictly in waitlist order and renumbers the remainder so
 * positions stay contiguous from 1 — a waitlist with a hole in it is a
 * waitlist nobody trusts.
 */
export function promoteFromWaitlist(
  attendance: Attendance[],
  capacity: number,
): { promoted: WaitlistPromotion[]; attendance: Attendance[] } {
  const occupied = attendance.filter((entry) => OCCUPIES_CAPACITY.has(entry.status)).length;
  const openings = Math.max(0, capacity - occupied);

  const waitlisted = attendance
    .filter((entry) => entry.status === 'waitlist')
    .sort((a, b) => (a.waitlistPos ?? 0) - (b.waitlistPos ?? 0));

  const promotedIds = new Set<UUID>();
  const promoted: WaitlistPromotion[] = [];
  for (const entry of waitlisted.slice(0, openings)) {
    promoted.push({ participantId: entry.participantId, fromPosition: entry.waitlistPos ?? 0 });
    promotedIds.add(entry.participantId);
  }

  // Remaining waitlist keeps its order and is renumbered from 1.
  const renumbered = new Map<UUID, number>();
  let position = 0;
  for (const entry of waitlisted) {
    if (promotedIds.has(entry.participantId)) continue;
    position += 1;
    renumbered.set(entry.participantId, position);
  }

  const next = attendance.map((entry) => {
    if (promotedIds.has(entry.participantId)) {
      // Promoted into the session, but not yet through the door.
      const { waitlistPos: _dropped, ...rest } = entry;
      return { ...rest, status: 'registered' as const };
    }
    const pos = renumbered.get(entry.participantId);
    if (entry.status === 'waitlist' && pos !== undefined) {
      return { ...entry, waitlistPos: pos };
    }
    return { ...entry };
  });

  return { promoted, attendance: next };
}
