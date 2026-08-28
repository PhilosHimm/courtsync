import type { Timeslot, UUID } from '@/lib/core';

/**
 * The gaps in a day of play, derived from the grid.
 *
 * A tournament day is not one continuous run of matches. Red Velvet stops for
 * 45 minutes between pool play and the playoffs — a captains' meeting and
 * lunch — and a board that renders that as just another five-minute buffer
 * has hidden the most operationally important gap on the sheet. Teams ask
 * when they are back on; the answer is on the screen or it is not.
 *
 * Derived rather than seeded as a row. A break row would be a match that is
 * not a match: everything that counts, schedules, referees or scores matches
 * would need a special case for it, and one of them would forget — which is
 * how a break ends up in the standings as a bye. The gap is already in the
 * timestamps, so it is read from them.
 */

/** A gap in the day long enough that the schedule should show it. */
export interface ScheduleBreak {
  /** The slot the day pauses after — the one whose end opens the gap. */
  afterTimeslotId: UUID;
  /** The slot play resumes on. */
  beforeTimeslotId: UUID;
  /** Absolute timestamps, as on `Timeslot`. Never a display label (C4). */
  startAt: string;
  endAt: string;
  minutes: number;
}

/**
 * Long enough to be a break rather than a turnaround.
 *
 * `DEFAULT_BUFFER_MIN` is 5 and a slot change is a few minutes more; 30 sits
 * clear of both without needing to know either. It is a display threshold,
 * not a scheduling constraint — nothing downstream reads it.
 */
export const DEFAULT_BREAK_MIN = 30;

const MS_PER_MIN = 60_000;

/**
 * Sorted on `startAt`, then `endAt`, then id.
 *
 * The first is C4 — a 12-hour display string used as a sort key put a
 * tournament's final above its opening match. The other two only exist so
 * that two slots starting together come out in the same order on every run,
 * which is the difference between a pure function and one that happens to
 * agree with itself.
 */
function byStart(a: Timeslot, b: Timeslot): number {
  if (a.startAt !== b.startAt) return a.startAt < b.startAt ? -1 : 1;
  if (a.endAt !== b.endAt) return a.endAt < b.endAt ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function findBreaks(
  timeslots: readonly Timeslot[],
  options?: { minGapMin?: number },
): ScheduleBreak[] {
  // A threshold of zero would report the five minutes between two ordinary
  // matches and put a divider between every row on the board, so anything
  // that low is treated as the default rather than obeyed.
  const requested = options?.minGapMin;
  const minGapMin = requested !== undefined && requested > 0 ? requested : DEFAULT_BREAK_MIN;

  const ordered = [...timeslots].sort(byStart);
  const breaks: ScheduleBreak[] = [];

  const first = ordered[0];
  if (!first) return breaks;

  // The day is busy until the latest end anyone has reached, not until the
  // previous row's end. A long match running underneath a short one means
  // play is still going even though the row before the gap finished early,
  // and measuring off that row alone would invent a break mid-rally.
  let latestEnd = first.endAt;
  let latestEndId = first.id;

  for (const slot of ordered.slice(1)) {
    const gapMs = Date.parse(slot.startAt) - Date.parse(latestEnd);
    const minutes = Math.round(gapMs / MS_PER_MIN);

    if (minutes >= minGapMin) {
      breaks.push({
        afterTimeslotId: latestEndId,
        beforeTimeslotId: slot.id,
        startAt: latestEnd,
        endAt: slot.startAt,
        minutes,
      });
    }

    if (slot.endAt > latestEnd) {
      latestEnd = slot.endAt;
      latestEndId = slot.id;
    }
  }

  return breaks;
}
