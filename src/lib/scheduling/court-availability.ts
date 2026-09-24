import type { CourtWindow, Timeslot, UUID } from '@/lib/core';

/**
 * When each court is actually the organizer's to use.
 *
 * "Court 3 is only ours until noon." Every generator used to assume every
 * court was free in every slot. A window is how the real constraint arrives —
 * per court, per day of play — and this module turns windows into the one
 * shape the generators consume: the court-and-slot cells they must not use.
 *
 * Judged on instants, never on strings (C4). Every other timestamp comparison
 * in this package leans on the timestamps sharing a format; a window is typed
 * in by an organizer against a venue's local time, so it may not, and a
 * string comparison of two different offsets is simply wrong.
 */

/** One court at one slot — the unit every generator places a match on. */
export interface CourtCell {
  courtId: UUID;
  timeslotId: UUID;
}

export interface CourtAvailabilityInput {
  courtIds: readonly UUID[];
  timeslots: readonly Timeslot[];
  windows: readonly CourtWindow[];
}

const instant = (timestamp: string): number => {
  const value = Date.parse(timestamp);
  if (Number.isNaN(value)) throw new Error(`Not a timestamp: "${timestamp}".`);
  return value;
};

/**
 * Whether a court may be used for a slot.
 *
 * No windows for this court on this slot's session means no restriction —
 * the common case, and the reason an organizer never has to enter one to say
 * "all day". Otherwise the slot must sit wholly inside one window: half a
 * match on a court that is then handed to somebody else is not a match.
 */
export function isCourtAvailable(
  windows: readonly CourtWindow[],
  courtId: UUID,
  slot: Timeslot,
): boolean {
  const relevant = windows.filter((w) => w.courtId === courtId && w.sessionId === slot.sessionId);
  if (relevant.length === 0) return true;
  const start = instant(slot.startAt);
  const end = instant(slot.endAt);
  return relevant.some((w) => instant(w.startAt) <= start && end <= instant(w.endAt));
}

/** Timestamp order, then id, so equal starts come out the same on every run. */
function byStart(a: Timeslot, b: Timeslot): number {
  const diff = instant(a.startAt) - instant(b.startAt);
  if (diff !== 0) return diff;
  const endDiff = instant(a.endAt) - instant(b.endAt);
  if (endDiff !== 0) return endDiff;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Every cell the generators must leave empty, in slot order then court order.
 *
 * A list of what is closed rather than of what is open, so that "no windows"
 * is an empty list and every generator given one behaves exactly as it did
 * before windows existed.
 */
export function unavailableCells(input: CourtAvailabilityInput): CourtCell[] {
  if (input.windows.length === 0) return [];
  const cells: CourtCell[] = [];
  for (const slot of [...input.timeslots].sort(byStart)) {
    for (const courtId of input.courtIds) {
      if (!isCourtAvailable(input.windows, courtId, slot)) {
        cells.push({ courtId, timeslotId: slot.id });
      }
    }
  }
  return cells;
}

/** `cell` keys for set lookups. Internal to the generators. */
export const cellKey = (courtId: UUID, timeslotId: UUID): string => `${courtId}\u0000${timeslotId}`;

/** The blocked cells as a set, for the generators' inner loops. */
export function blockedSet(cells: readonly CourtCell[] | undefined): Set<string> {
  return new Set((cells ?? []).map((cell) => cellKey(cell.courtId, cell.timeslotId)));
}

/**
 * Rest asked for in minutes, as the number of empty slots the engine needs.
 *
 * The UI speaks minutes and the engine speaks slots, and now that slot
 * lengths vary by stage there is no single slot length to divide by. So this
 * measures the grid itself: the smallest number of empty slots that gives at
 * least `restMinutes` between the end of one match and the start of the next,
 * at every position on every session's grid. Turnaround time between slots
 * counts — it is rest the players actually get.
 *
 * When no number of slots can give that much rest within a session, the
 * answer is the whole session: nobody plays twice. That is what the request
 * means on a grid that short.
 */
export function restSlotsForMinutes(input: {
  timeslots: readonly Timeslot[];
  restMinutes: number;
}): number {
  const { restMinutes } = input;
  if (!Number.isFinite(restMinutes) || restMinutes < 0) {
    throw new Error(`Rest must be a non-negative number of minutes, got ${String(restMinutes)}.`);
  }
  if (restMinutes === 0) return 0;
  const needed = restMinutes * 60_000;

  const bySession = new Map<UUID, Timeslot[]>();
  for (const slot of input.timeslots) {
    const list = bySession.get(slot.sessionId) ?? [];
    list.push(slot);
    bySession.set(slot.sessionId, list);
  }

  let answer = 0;
  for (const list of bySession.values()) {
    const slots = [...list].sort(byStart);
    let k = 0;
    for (;;) {
      let holds = true;
      for (let i = 0; i + k + 1 < slots.length; i++) {
        const earlier = slots[i];
        const later = slots[i + k + 1];
        if (!earlier || !later) continue;
        if (instant(later.startAt) - instant(earlier.endAt) < needed) {
          holds = false;
          break;
        }
      }
      if (holds) break;
      k += 1;
    }
    answer = Math.max(answer, k);
  }
  return answer;
}
