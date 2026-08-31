import type { Timeslot } from '@/lib/core';

/**
 * Clock and date arithmetic for the manage layer.
 *
 * These deliberately duplicate three small helpers in `src/lib/demo/data.ts`
 * rather than import them: the demo is a window onto the engine, not a
 * library, and `manage` importing `demo` would invert that. If a third copy
 * is ever needed, the right home is `src/lib/core/utils` — a shared change,
 * landed on its own.
 *
 * Everything here is pure. No `Date.now()`, no locale reads — a stored
 * competition must rebuild to the identical schedule every time (rule 9).
 */

export const pad2 = (n: number): string => String(n).padStart(2, '0');

/** Add whole days to an ISO date without tripping over month ends. */
export function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** `'09:00'` plus minutes, as `HH:mm`. Pure clock arithmetic. */
export function addMinutes(clock: string, minutes: number): string {
  const [h = '0', m = '0'] = clock.split(':');
  const total = Number.parseInt(h, 10) * 60 + Number.parseInt(m, 10) + minutes;
  const wrapped = ((total % 1440) + 1440) % 1440;
  return `${pad2(Math.floor(wrapped / 60))}:${pad2(wrapped % 60)}`;
}

/** The 12-hour label a gym clock shows. For display only — never a sort key (C4). */
export function clockLabel(isoTimestamp: string): string {
  const time = isoTimestamp.slice(11, 16);
  const [h = '0', m = '00'] = time.split(':');
  const hour = Number.parseInt(h, 10);
  const suffix = hour < 12 ? 'am' : 'pm';
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  return `${twelve}:${m}${suffix}`;
}

/**
 * A session's grid of timeslots. `startAt`/`endAt` are absolute timestamps
 * and every consumer sorts on them, never on the label beside them.
 */
export function buildTimeslots(args: {
  sessionId: string;
  playDate: string;
  startTime: string;
  count: number;
  durationMin: number;
  bufferMin: number;
}): Timeslot[] {
  const { sessionId, playDate, startTime, count, durationMin, bufferMin } = args;
  return Array.from({ length: count }, (_, i) => {
    const start = addMinutes(startTime, i * (durationMin + bufferMin));
    return {
      id: `${sessionId}-ts-${i + 1}`,
      sessionId,
      startAt: `${playDate}T${start}:00Z`,
      endAt: `${playDate}T${addMinutes(start, durationMin)}:00Z`,
    };
  });
}
