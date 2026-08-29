import type { Court, Match, Timeslot, UUID } from '@/lib/core';

/**
 * Where a match could legally go.
 *
 * `auditSchedule` says what is wrong with a grid and stops there, which makes
 * the conflict screen a complaint rather than a fix. At 8:52 with forty
 * people waiting, an organizer does not want to be told the Spikers are on
 * two courts at once — they want the four places the match could move
 * instead.
 *
 * The output is the same shape of data the audit consumes, so a caller can
 * apply a suggestion and re-audit without a translation layer in between.
 *
 * Suggestions are offered, never applied. Nothing here mutates a match, and
 * nothing here decides: the organizer knows about the team that has to leave
 * by four, and this function does not.
 */

export interface SlotSuggestionInput {
  /** The match to move. Must appear in `matches`. */
  matchId: UUID;
  /** Every match on the grid, including the one being moved. */
  matches: readonly Match[];
  /** Every slot the grid may use. Slots from other sessions are ignored, not an error. */
  timeslots: readonly Timeslot[];
  courts: readonly Court[];
  /**
   * The rest the organizer asked for, in slots. A placement that breaks it is
   * still offered — flagged rather than withheld, because the audit treats
   * short rest as a warning and an organizer working under pressure may
   * accept one knowingly.
   */
  minRestSlots?: number;
}

export interface SlotSuggestion {
  courtId: UUID;
  timeslotId: UUID;
  /**
   * False when placing the match here leaves a participant less rest than
   * `minRestSlots` asked for. Always true when no rest was requested.
   */
  respectsRest: boolean;
  /** Empty slots the tighter of the two participants would get. Undefined when no rest was requested. */
  restSlots?: number;
}

/**
 * Every placement that would not create a blocking conflict.
 *
 * Excluded: a court already busy at that time, and any slot where either
 * participant or the referee is already playing or refereeing. Excluded too
 * is the match's current placement — a suggestion to leave it exactly where
 * it is is not a move.
 *
 * Included but flagged: placements that break the rest request.
 *
 * Ordered rest-respecting first, then chronologically, then by court, so the
 * first suggestion is the earliest good one.
 */
export function suggestSlots(input: SlotSuggestionInput): SlotSuggestion[] {
  const moving = input.matches.find((m) => m.id === input.matchId);
  if (!moving) {
    throw new Error(`Cannot suggest slots: match ${input.matchId} is not among the matches given.`);
  }

  const minRest = Math.max(0, Math.trunc(input.minRestSlots ?? 0));
  const wantsRest = minRest > 0;

  // The match is vacating wherever it currently sits, so it must not count
  // as an obstacle to its own move.
  const others = input.matches.filter((m) => m.id !== moving.id);

  // Its own session only. A league week has an independent grid, and moving
  // week 3 into week 4 is a different fixture list rather than a reschedule.
  const sessionSlots = input.timeslots
    .filter((slot) => slot.sessionId === moving.sessionId)
    .sort(byStart);
  const slotIndex = new Map<UUID, number>(sessionSlots.map((slot, i) => [slot.id, i]));

  const movingParticipants = new Set(roles(moving));

  // Who and what is busy, per slot. Built once rather than per candidate.
  const busyCourts = new Map<UUID, Set<UUID>>();
  const busyParticipants = new Map<UUID, Set<UUID>>();
  for (const other of others) {
    if (other.timeslotId == null) continue;
    const overlapping = overlappingSlots(other.timeslotId, sessionSlots, input.timeslots);
    for (const slotId of overlapping) {
      if (other.courtId != null) {
        const courtsBusy = busyCourts.get(slotId) ?? new Set<UUID>();
        courtsBusy.add(other.courtId);
        busyCourts.set(slotId, courtsBusy);
      }
      const peopleBusy = busyParticipants.get(slotId) ?? new Set<UUID>();
      for (const participantId of roles(other)) peopleBusy.add(participantId);
      busyParticipants.set(slotId, peopleBusy);
    }
  }

  // Playing appearances only, for rest. Refereeing between two of your own
  // matches is what a rest slot is often for.
  const playingSlots = new Map<UUID, number[]>();
  for (const other of others) {
    if (other.timeslotId == null) continue;
    const index = slotIndex.get(other.timeslotId);
    if (index === undefined) continue;
    for (const participantId of [other.homeParticipantId, other.awayParticipantId]) {
      if (participantId == null || !movingParticipants.has(participantId)) continue;
      const list = playingSlots.get(participantId) ?? [];
      list.push(index);
      playingSlots.set(participantId, list);
    }
  }

  const activeCourts = input.courts.filter((court) => court.isActive);
  const suggestions: SlotSuggestion[] = [];

  for (const slot of sessionSlots) {
    const peopleBusy = busyParticipants.get(slot.id);
    if (peopleBusy && roles(moving).some((id) => peopleBusy.has(id))) continue;

    const courtsBusy = busyCourts.get(slot.id);
    const index = slotIndex.get(slot.id) ?? 0;
    const rest = restAt(index, moving, playingSlots);

    for (const court of activeCourts) {
      if (courtsBusy?.has(court.id)) continue;
      // Not a move.
      if (court.id === moving.courtId && slot.id === moving.timeslotId) continue;

      suggestions.push({
        courtId: court.id,
        timeslotId: slot.id,
        respectsRest: !wantsRest || rest === null || rest >= minRest,
        ...(wantsRest && rest !== null ? { restSlots: rest } : {}),
      });
    }
  }

  // Rest-respecting first, then chronological, then court — so the first
  // suggestion is the earliest good one rather than the earliest one.
  const order = new Map<UUID, number>(sessionSlots.map((slot, i) => [slot.id, i]));
  return suggestions.sort((a, b) => {
    if (a.respectsRest !== b.respectsRest) return a.respectsRest ? -1 : 1;
    const slotA = order.get(a.timeslotId) ?? 0;
    const slotB = order.get(b.timeslotId) ?? 0;
    if (slotA !== slotB) return slotA - slotB;
    return a.courtId < b.courtId ? -1 : a.courtId > b.courtId ? 1 : 0;
  });
}

/** Sorted on `startAt`, then `endAt`, then id (C4: timestamps, never labels). */
function byStart(a: Timeslot, b: Timeslot): number {
  if (a.startAt !== b.startAt) return a.startAt < b.startAt ? -1 : 1;
  if (a.endAt !== b.endAt) return a.endAt < b.endAt ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** Everywhere a match puts somebody: playing home, playing away, refereeing. */
function roles(match: Match): UUID[] {
  const ids: UUID[] = [];
  if (match.homeParticipantId != null) ids.push(match.homeParticipantId);
  if (match.awayParticipantId != null) ids.push(match.awayParticipantId);
  if (match.refParticipantId != null) ids.push(match.refParticipantId);
  return ids;
}

/**
 * Which candidate slots a match sitting in `occupiedId` blocks.
 *
 * Half-open overlap on the timestamps, matching `auditSchedule` exactly: two
 * slots that merely touch are a turnaround, and a slot the audit would call
 * a collision must never be offered here. A match on a slot outside the
 * session's own grid blocks nothing.
 */
function overlappingSlots(
  occupiedId: UUID,
  candidates: readonly Timeslot[],
  allSlots: readonly Timeslot[],
): UUID[] {
  const occupied = allSlots.find((slot) => slot.id === occupiedId);
  if (!occupied) return [];
  return candidates
    .filter((slot) => slot.startAt < occupied.endAt && occupied.startAt < slot.endAt)
    .map((slot) => slot.id);
}

/**
 * Empty slots the tighter participant gets if the match lands at `index`.
 * Null when neither side plays anywhere else, which is not a rest problem.
 */
function restAt(index: number, moving: Match, playingSlots: Map<UUID, number[]>): number | null {
  let tightest: number | null = null;
  for (const participantId of [moving.homeParticipantId, moving.awayParticipantId]) {
    if (participantId == null) continue;
    for (const other of playingSlots.get(participantId) ?? []) {
      const gap = Math.abs(other - index) - 1;
      if (tightest === null || gap < tightest) tightest = gap;
    }
  }
  return tightest;
}
