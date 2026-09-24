/**
 * Wall-clock time at a venue, and the absolute instants the model stores.
 *
 * An organizer types "Saturday, 9:00" and means 9:00 in the gym. `Timeslot`
 * holds absolute instants (C4), so the conversion has to know where the gym
 * is: storing 9:00 as 09:00Z would make every comparison with the real clock
 * — "what is next", "is this live" — wrong by the gym's UTC offset.
 *
 * Pure: `Intl` with an explicit time zone reads the tz database, not the
 * machine's clock or locale.
 */

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatterCache.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatterCache.set(timeZone, f);
  }
  return f;
}

/** Whether a string names a time zone this runtime knows. */
export function isTimeZone(timeZone: string): boolean {
  try {
    partsFormatter(timeZone);
    return true;
  } catch {
    return false;
  }
}

/** Offset of `timeZone` from UTC at `instantMs`, in minutes (east positive). */
function offsetMinutes(instantMs: number, timeZone: string): number {
  const parts = Object.fromEntries(
    partsFormatter(timeZone)
      .formatToParts(new Date(instantMs))
      .map((p) => [p.type, p.value]),
  );
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return Math.round((asUtc - instantMs) / 60_000);
}

/**
 * The instant a wall-clock date and time in `timeZone` names, as ISO UTC.
 *
 * In the hour a clock skips (spring forward) the answer is the instant the
 * clock would read that time if it had not skipped; in the hour it repeats
 * (fall back) it is the earlier of the two. Nobody schedules a volleyball
 * match at 2:30am, but the answer is still defined.
 */
export function wallClockToInstant(isoDate: string, clock: string, timeZone: string): string {
  const [y, mo, d] = isoDate.split('-').map(Number);
  const [h, mi] = clock.split(':').map(Number);
  if ([y, mo, d, h, mi].some((n) => n === undefined || Number.isNaN(n))) {
    throw new Error(`Not a date and time: ${isoDate} ${clock}.`);
  }
  const naive = Date.UTC(y as number, (mo as number) - 1, d as number, h as number, mi as number);
  // Two passes settle the offset across a DST boundary.
  let guess = naive - offsetMinutes(naive, timeZone) * 60_000;
  guess = naive - offsetMinutes(guess, timeZone) * 60_000;
  return new Date(guess).toISOString();
}

/** The wall-clock date (YYYY-MM-DD) and time (HH:mm) an instant shows at the venue. */
export function instantToWallClock(
  instant: string,
  timeZone: string,
): { date: string; clock: string } {
  const parts = Object.fromEntries(
    partsFormatter(timeZone)
      .formatToParts(new Date(instant))
      .map((p) => [p.type, p.value]),
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    clock: `${parts.hour}:${parts.minute}`,
  };
}

/** "9:00am" at the venue. Display only — never a sort key (C4). */
export function venueClockLabel(instant: string, timeZone: string): string {
  const { clock } = instantToWallClock(instant, timeZone);
  const [h = '0', m = '00'] = clock.split(':');
  const hour = Number(h);
  return `${hour % 12 === 0 ? 12 : hour % 12}:${m}${hour < 12 ? 'am' : 'pm'}`;
}

/**
 * A session's grid: `count` slots of `durationMin` with `bufferMin` between,
 * from `startTime` at the venue. Ids are `<sessionId>-ts-<n>` so a regenerated
 * grid names the same slots the same way.
 */
export function timeslotGrid(args: {
  sessionId: string;
  playDate: string;
  startTime: string;
  count: number;
  durationMin: number;
  bufferMin: number;
  timeZone: string;
}): Array<{ id: string; sessionId: string; startAt: string; endAt: string }> {
  const first = Date.parse(wallClockToInstant(args.playDate, args.startTime, args.timeZone));
  const step = (args.durationMin + args.bufferMin) * 60_000;
  return Array.from({ length: Math.max(0, Math.trunc(args.count)) }, (_, i) => {
    const start = first + i * step;
    return {
      id: `${args.sessionId}-ts-${i + 1}`,
      sessionId: args.sessionId,
      startAt: new Date(start).toISOString(),
      endAt: new Date(start + args.durationMin * 60_000).toISOString(),
    };
  });
}

/** How many slots of this shape fit between two wall-clock times. */
export function slotsThatFit(args: {
  startTime: string;
  endTime: string;
  durationMin: number;
  bufferMin: number;
}): number {
  const minutes = (clock: string) => {
    const [h = 0, m = 0] = clock.split(':').map(Number);
    return h * 60 + m;
  };
  const span = minutes(args.endTime) - minutes(args.startTime);
  if (span < args.durationMin || args.durationMin <= 0) return 0;
  return Math.floor((span - args.durationMin) / (args.durationMin + args.bufferMin)) + 1;
}
