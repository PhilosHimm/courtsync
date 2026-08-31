import type { Match, Timeslot, UUID } from '@/lib/core';

/**
 * Re-validation for a schedule the organizer has touched by hand.
 *
 * The generators place matches without collisions by construction, but the
 * tournament persona's peak need is changing the grid under pressure — two
 * teams no-show at 8:52 and matches get dragged to new slots. After a manual
 * move nothing re-checks the invariants the generator guaranteed, which is
 * how a team ends up on two courts at once and nobody knows until both
 * matches call them.
 *
 * This audits a schedule as data and reports what is wrong with it, so the
 * organizer resolves conflicts before the day rather than on it. It reports
 * rather than raises: a broken schedule mid-edit is a normal state the
 * organizer is working through, not a caller bug. Only a dangling reference —
 * a match pointing at a timeslot that does not exist — raises, because that
 * is a caller bug and not something an organizer can fix by moving a match.
 */

export interface ScheduleAuditInput {
  matches: readonly Match[];
  /** Every slot the matches may reference. A match referencing a slot not listed here raises. */
  timeslots: readonly Timeslot[];
  /**
   * Minimum number of slots a participant should sit out between its own
   * matches — the same soft constraint `PoolPlayInput.minRestSlots` asks the
   * generator to honour. Soft here too: a violation is reported as a warning,
   * never as blocking, because the generator itself may violate it rather
   * than leave a match off the grid. Omitted or zero disables the check.
   */
  minRestSlots?: number;
}

/**
 * `blocking` is physically impossible to play as scheduled — somebody or some
 * court is in two places at once. `warning` is playable but wrong enough to
 * show the organizer. The split is what lets a publish flow gate on the first
 * kind without nagging about the second.
 */
export type ConflictSeverity = 'blocking' | 'warning';

/** Two matches on the same court at overlapping times. */
export interface CourtDoubleBooked {
  kind: 'court-double-booked';
  severity: 'blocking';
  courtId: UUID;
  /** Earlier match first, by slot order. */
  matchIds: [UUID, UUID];
  /** The overlapping slots, in the same order as `matchIds`. Often the same slot twice. */
  timeslotIds: [UUID, UUID];
}

/**
 * One participant in two overlapping matches, counting all three roles —
 * playing home, playing away, or refereeing. `assignReferees` guarantees a
 * referee is never on two courts at once; a manual move can silently break
 * that guarantee, so the audit re-checks it.
 */
export interface ParticipantDoubleBooked {
  kind: 'participant-double-booked';
  severity: 'blocking';
  participantId: UUID;
  matchIds: [UUID, UUID];
  timeslotIds: [UUID, UUID];
}

/**
 * A match with no court or no timeslot. A warning rather than blocking,
 * deliberately: a bracket seeded before pool play finishes has semifinals
 * with no slot yet, and that is the normal mid-day state of a tournament,
 * not a mistake. The organizer decides whether an unplaced match matters
 * for what they are about to publish.
 */
export interface UnplacedMatch {
  kind: 'unplaced-match';
  severity: 'warning';
  matchId: UUID;
}

/**
 * A participant playing again with fewer than `minRestSlots` empty slots
 * since their previous match. Reported once per consecutive pair of
 * appearances, measured within one session — rest across a league's weeks
 * is not a thing this checks. Refereeing does not count as playing: sitting
 * a team down to ref between its matches is what the rest slots are for.
 */
export interface InsufficientRest {
  kind: 'insufficient-rest';
  severity: 'warning';
  participantId: UUID;
  /** Earlier match first, by slot order. */
  matchIds: [UUID, UUID];
  /** Empty slots the participant actually got. Always less than `minRestSlots`. */
  restSlots: number;
}

export type ScheduleConflict =
  | CourtDoubleBooked
  | ParticipantDoubleBooked
  | UnplacedMatch
  | InsufficientRest;

/**
 * Audit a schedule and report every conflict in it.
 *
 * Deterministic output order: blocking conflicts first (court collisions,
 * then participant collisions, each in slot order), then warnings (unplaced
 * matches by id, then rest violations). An empty array means the schedule
 * holds every invariant the generators promise.
 */
export function auditSchedule(input: ScheduleAuditInput): ScheduleConflict[] {
  const slotById = new Map<UUID, Timeslot>();
  for (const slot of input.timeslots) slotById.set(slot.id, slot);

  const placed: Match[] = [];
  const unplaced: Match[] = [];
  for (const match of input.matches) {
    if (match.timeslotId != null && !slotById.has(match.timeslotId)) {
      throw new Error(
        `Cannot audit schedule: match ${match.id} references timeslot ${match.timeslotId}, which is not in the timeslots given.`,
      );
    }
    if (match.courtId == null || match.timeslotId == null) unplaced.push(match);
    else placed.push(match);
  }

  const slotOf = (match: Match): Timeslot => {
    const slot = match.timeslotId == null ? undefined : slotById.get(match.timeslotId);
    if (!slot) throw new Error(`Cannot audit schedule: match ${match.id} has no timeslot.`);
    return slot;
  };

  // Slot order first (C4: the timestamps, never a label), then court and id so
  // two matches sharing a slot come out the same way on every run.
  const ordered = [...placed].sort((a, b) => {
    const cmp = byStart(slotOf(a), slotOf(b));
    if (cmp !== 0) return cmp;
    const courtA = a.courtId ?? '';
    const courtB = b.courtId ?? '';
    if (courtA !== courtB) return courtA < courtB ? -1 : 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

  const courtConflicts: CourtDoubleBooked[] = [];
  const participantConflicts: ParticipantDoubleBooked[] = [];
  for (let i = 0; i < ordered.length; i++) {
    for (let j = i + 1; j < ordered.length; j++) {
      const a = ordered[i];
      const b = ordered[j];
      if (!a || !b) continue;
      const slotA = slotOf(a);
      const slotB = slotOf(b);
      if (!overlaps(slotA, slotB)) continue;

      if (a.courtId === b.courtId && a.courtId != null) {
        courtConflicts.push({
          kind: 'court-double-booked',
          severity: 'blocking',
          courtId: a.courtId,
          matchIds: [a.id, b.id],
          timeslotIds: [slotA.id, slotB.id],
        });
      }

      const rolesB = new Set(roles(b));
      for (const participantId of roles(a)) {
        if (!rolesB.has(participantId)) continue;
        participantConflicts.push({
          kind: 'participant-double-booked',
          severity: 'blocking',
          participantId,
          matchIds: [a.id, b.id],
          timeslotIds: [slotA.id, slotB.id],
        });
      }
    }
  }

  const unplacedConflicts: UnplacedMatch[] = unplaced
    .map((match) => match.id)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
    .map((matchId) => ({ kind: 'unplaced-match', severity: 'warning', matchId }));

  return [
    ...courtConflicts,
    ...participantConflicts,
    ...unplacedConflicts,
    ...restConflicts(ordered, slotOf, input.timeslots, input.minRestSlots),
  ];
}

/** Sorted on `startAt`, then `endAt`, then id — same reasoning as day-plan's. */
function byStart(a: Timeslot, b: Timeslot): number {
  if (a.startAt !== b.startAt) return a.startAt < b.startAt ? -1 : 1;
  if (a.endAt !== b.endAt) return a.endAt < b.endAt ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Half-open intervals: a slot ending at the instant another starts is a
 * turnaround, not a collision. String comparison is sound for the same reason
 * sorting on `startAt` is — the timestamps are absolute and share a format.
 */
function overlaps(a: Timeslot, b: Timeslot): boolean {
  return a.startAt < b.endAt && b.startAt < a.endAt;
}

/** Everywhere this match puts somebody: playing home, playing away, or refereeing. */
function roles(match: Match): UUID[] {
  const ids: UUID[] = [];
  if (match.homeParticipantId != null) ids.push(match.homeParticipantId);
  if (match.awayParticipantId != null) ids.push(match.awayParticipantId);
  if (match.refParticipantId != null) ids.push(match.refParticipantId);
  return ids;
}

/**
 * Rest violations, measured the way `generatePoolPlay` measures the rest it
 * grants: empty slots on the session's own grid between a participant's
 * consecutive playing appearances. Two appearances in the same slot are a
 * collision, already reported as blocking, and are not double-counted here.
 */
function restConflicts(
  orderedMatches: readonly Match[],
  slotOf: (match: Match) => Timeslot,
  timeslots: readonly Timeslot[],
  minRestSlots: number | undefined,
): InsufficientRest[] {
  const minRest = Math.max(0, Math.trunc(minRestSlots ?? 0));
  if (minRest === 0) return [];

  // Each session has its own independent grid (a league's week 3 knows
  // nothing of week 4), so slot positions are indexed per session.
  const slotsBySession = new Map<UUID, Timeslot[]>();
  for (const slot of timeslots) {
    const list = slotsBySession.get(slot.sessionId) ?? [];
    list.push(slot);
    slotsBySession.set(slot.sessionId, list);
  }
  const slotIndex = new Map<UUID, number>();
  for (const list of slotsBySession.values()) {
    list.sort(byStart);
    list.forEach((slot, index) => {
      slotIndex.set(slot.id, index);
    });
  }

  // Playing appearances only — refereeing is what a rest slot is often for.
  const appearances = new Map<UUID, Array<{ matchId: UUID; sessionId: UUID; index: number }>>();
  for (const match of orderedMatches) {
    const slot = slotOf(match);
    const index = slotIndex.get(slot.id);
    if (index === undefined) continue;
    for (const participantId of [match.homeParticipantId, match.awayParticipantId]) {
      if (participantId == null) continue;
      const list = appearances.get(participantId) ?? [];
      list.push({ matchId: match.id, sessionId: slot.sessionId, index });
      appearances.set(participantId, list);
    }
  }

  const conflicts: InsufficientRest[] = [];
  for (const [participantId, list] of appearances) {
    for (let i = 1; i < list.length; i++) {
      const earlier = list[i - 1];
      const later = list[i];
      if (!earlier || !later) continue;
      if (earlier.sessionId !== later.sessionId) continue;
      const restSlots = later.index - earlier.index - 1;
      if (restSlots < 0 || restSlots >= minRest) continue;
      conflicts.push({
        kind: 'insufficient-rest',
        severity: 'warning',
        participantId,
        matchIds: [earlier.matchId, later.matchId],
        restSlots,
      });
    }
  }
  return conflicts;
}
