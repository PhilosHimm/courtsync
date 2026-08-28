/**
 * Specification for `findBreaks`.
 *
 * A tournament day is not one continuous run of matches. Red Velvet stops for
 * 45 minutes between pool play and the playoffs — a captains' meeting and
 * lunch — and a schedule that renders it as just another five-minute buffer
 * has hidden the most operationally important gap on the sheet.
 *
 * The break is DERIVED from the grid rather than seeded as a row. A break
 * row would be a match that is not a match: every consumer that counts,
 * schedules, referees or scores would need a special case for it, and one of
 * them would forget. The gap is already in the timestamps.
 */

import { describe, expect, it } from 'vitest';
import type { Timeslot } from '@/lib/core';
import { DEFAULT_BREAK_MIN, findBreaks } from '@/lib/scheduling/day-plan';

const DATE = '2026-09-19';

/** A slot from a start clock and a length, both in wall-clock minutes. */
function slot(id: string, startMin: number, lengthMin = 45): Timeslot {
  const at = (minutes: number): string => {
    const h = String(Math.floor(minutes / 60)).padStart(2, '0');
    const m = String(minutes % 60).padStart(2, '0');
    return `${DATE}T${h}:${m}:00Z`;
  };
  return { id, sessionId: 'sess-1', startAt: at(startMin), endAt: at(startMin + lengthMin) };
}

/** 9:00, 9:50, 10:40 — a 45-minute game with a 5-minute buffer. */
const runOfThree = [slot('ts-1', 9 * 60), slot('ts-2', 9 * 60 + 50), slot('ts-3', 10 * 60 + 40)];

describe('findBreaks', () => {
  it('finds nothing in a day with no gaps', () => {
    expect(findBreaks(runOfThree)).toEqual([]);
  });

  it('finds nothing in an empty or single-slot day', () => {
    expect(findBreaks([])).toEqual([]);
    expect(findBreaks([slot('ts-1', 9 * 60)])).toEqual([]);
  });

  it('finds the lunch break between pool play and the playoffs', () => {
    // Pool play ends at 3:05pm; the first playoff match is at 3:50pm.
    const day = [
      slot('ts-1', 14 * 60 + 20),
      slot('ts-2', 15 * 60 + 50),
      slot('ts-3', 16 * 60 + 40),
    ];
    const breaks = findBreaks(day);

    expect(breaks).toHaveLength(1);
    expect(breaks[0]?.afterTimeslotId).toBe('ts-1');
    expect(breaks[0]?.beforeTimeslotId).toBe('ts-2');
    expect(breaks[0]?.minutes).toBe(45);
    expect(breaks[0]?.startAt).toBe(`${DATE}T15:05:00Z`);
    expect(breaks[0]?.endAt).toBe(`${DATE}T15:50:00Z`);
  });

  it('finds every break in a day that has more than one', () => {
    const day = [
      slot('ts-1', 9 * 60),
      slot('ts-2', 11 * 60),
      slot('ts-3', 11 * 60 + 50),
      slot('ts-4', 14 * 60),
    ];
    expect(findBreaks(day).map((b) => b.afterTimeslotId)).toEqual(['ts-1', 'ts-3']);
  });

  it('ignores a gap shorter than the threshold', () => {
    // 20 minutes: long enough to notice, not long enough to be a break.
    const day = [slot('ts-1', 9 * 60), slot('ts-2', 10 * 60 + 5)];
    expect(findBreaks(day)).toEqual([]);
  });

  it('counts a gap exactly at the threshold as a break', () => {
    const day = [slot('ts-1', 9 * 60), slot('ts-2', 9 * 60 + 45 + DEFAULT_BREAK_MIN)];
    expect(findBreaks(day)).toHaveLength(1);
  });

  it('takes a threshold from the caller', () => {
    const day = [slot('ts-1', 9 * 60), slot('ts-2', 10 * 60 + 5)];
    expect(findBreaks(day, { minGapMin: 15 })).toHaveLength(1);
    expect(findBreaks(day, { minGapMin: 60 })).toEqual([]);
  });

  it('refuses a threshold that would call every buffer a break', () => {
    // Zero or negative would report the five minutes between two ordinary
    // matches, which is not a break and would put a divider between every
    // row on the board.
    const day = [slot('ts-1', 9 * 60), slot('ts-2', 9 * 60 + 50)];
    expect(findBreaks(day, { minGapMin: 0 })).toEqual([]);
    expect(findBreaks(day, { minGapMin: -10 })).toEqual([]);
  });

  it('C4: orders the day on the timestamp, not on the id or the label', () => {
    // Handed the day backwards, it still finds the same break in the same
    // place. Sorting on anything but `startAt` is the finding that put a
    // tournament's final above its opening match.
    const day = [
      slot('ts-3', 16 * 60 + 40),
      slot('ts-1', 14 * 60 + 20),
      slot('ts-2', 15 * 60 + 50),
    ];
    const breaks = findBreaks(day);
    expect(breaks).toHaveLength(1);
    expect(breaks[0]?.afterTimeslotId).toBe('ts-1');
    expect(breaks[0]?.beforeTimeslotId).toBe('ts-2');
  });

  it('reports no break between slots that overlap', () => {
    const day = [slot('ts-1', 9 * 60, 120), slot('ts-2', 9 * 60 + 30)];
    expect(findBreaks(day)).toEqual([]);
  });

  it('measures the gap from the latest end, not from the previous row', () => {
    // A long slot running underneath a short one means the day is still busy
    // even though the row before the gap ended early. Measuring from the
    // previous row alone would invent a break in the middle of live play.
    const day = [
      slot('ts-long', 9 * 60, 180), // 9:00–12:00
      slot('ts-short', 9 * 60 + 10, 20), // 9:10–9:30
      slot('ts-next', 12 * 60 + 5),
    ];
    expect(findBreaks(day)).toEqual([]);
  });

  it('does not mutate the timeslots it was given', () => {
    const day = [slot('ts-2', 15 * 60 + 50), slot('ts-1', 14 * 60 + 20)];
    const before = JSON.parse(JSON.stringify(day));
    findBreaks(day);
    expect(day).toEqual(before);
  });

  it('is deterministic: the same day gives the same breaks', () => {
    const day = [slot('ts-1', 9 * 60), slot('ts-2', 12 * 60), slot('ts-3', 12 * 60 + 50)];
    expect(findBreaks(day)).toEqual(findBreaks(day));
  });
});
