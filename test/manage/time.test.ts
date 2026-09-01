/**
 * Specification for `src/lib/manage/time.ts`.
 *
 * Clock arithmetic is where C4 lives. The predecessor sorted a schedule on a
 * 12-hour display string, so "12:00 AM" sorted above "12:00 PM" and a
 * tournament's final appeared above its opening match. This module produces
 * both the absolute timestamps everything sorts on AND the 12-hour label
 * nothing may sort on, which makes the boundary between them worth pinning.
 *
 * Everything here must also be pure: a stored competition rebuilds its
 * schedule from setup on every read, so the same setup has to produce
 * identical timeslots every time (rule 9).
 */

import { describe, expect, it } from 'vitest';
import { addDays, addMinutes, buildTimeslots, clockLabel, pad2 } from '@/lib/manage/time';

describe('pad2', () => {
  it('pads a single digit and leaves two alone', () => {
    expect(pad2(0)).toBe('00');
    expect(pad2(9)).toBe('09');
    expect(pad2(23)).toBe('23');
  });
});

describe('addDays', () => {
  it('adds days within a month', () => {
    expect(addDays('2026-09-19', 7)).toBe('2026-09-26');
  });

  it('crosses a month end', () => {
    // A league season runs past the end of a month every time.
    expect(addDays('2026-09-28', 7)).toBe('2026-10-05');
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
  });

  it('crosses a year end', () => {
    expect(addDays('2026-12-29', 7)).toBe('2027-01-05');
  });

  it('handles a leap day', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2028-02-29', 1)).toBe('2028-03-01');
    expect(addDays('2027-02-28', 1)).toBe('2027-03-01');
  });

  it('goes backwards', () => {
    expect(addDays('2026-09-19', -19)).toBe('2026-08-31');
  });

  it('adding zero days is the same date', () => {
    expect(addDays('2026-09-19', 0)).toBe('2026-09-19');
  });

  it('is UTC-anchored, so a season cannot drift with the runner timezone', () => {
    // Parsed as `${date}T00:00:00Z` deliberately. A local-time parse would
    // make a CI box in another zone produce different dates across a DST
    // boundary.
    expect(addDays('2026-03-08', 1)).toBe('2026-03-09');
    expect(addDays('2026-10-25', 1)).toBe('2026-10-26');
  });
});

describe('addMinutes', () => {
  it('adds within the hour and across it', () => {
    expect(addMinutes('09:00', 45)).toBe('09:45');
    expect(addMinutes('09:45', 20)).toBe('10:05');
  });

  it('pads both halves', () => {
    expect(addMinutes('09:00', 0)).toBe('09:00');
    expect(addMinutes('00:00', 5)).toBe('00:05');
  });

  it('wraps past midnight rather than producing hour 24', () => {
    // A late drop-in finishing after midnight is real, and `24:15` is
    // neither a valid label nor a valid timestamp fragment.
    expect(addMinutes('23:30', 45)).toBe('00:15');
    expect(addMinutes('23:00', 60)).toBe('00:00');
  });

  it('wraps backwards too', () => {
    expect(addMinutes('00:15', -30)).toBe('23:45');
  });

  it('wraps a full day around to itself', () => {
    expect(addMinutes('09:00', 1440)).toBe('09:00');
    expect(addMinutes('09:00', -1440)).toBe('09:00');
  });
});

describe('clockLabel', () => {
  it('reads midnight and noon the way a gym clock does', () => {
    // The exact pair C4 was about: both are "12", and only the suffix
    // separates them.
    expect(clockLabel('2026-09-19T00:00:00Z')).toBe('12:00am');
    expect(clockLabel('2026-09-19T12:00:00Z')).toBe('12:00pm');
  });

  it('reads ordinary morning and afternoon times', () => {
    expect(clockLabel('2026-09-19T09:05:00Z')).toBe('9:05am');
    expect(clockLabel('2026-09-19T15:30:00Z')).toBe('3:30pm');
    expect(clockLabel('2026-09-19T23:59:00Z')).toBe('11:59pm');
  });

  it('sorts wrongly — which is exactly why nothing may sort on it', () => {
    // Not a defect: it is the point. This assertion exists so anyone tempted
    // to order a schedule by this value sees the failure written down rather
    // than discovering it when a final renders above an opener.
    const opener = clockLabel('2026-09-19T09:00:00Z');
    const final = clockLabel('2026-09-19T17:00:00Z');
    expect([final, opener].sort()).toEqual(['5:00pm', '9:00am']);
    // The timestamps they came from sort correctly.
    expect(['2026-09-19T17:00:00Z', '2026-09-19T09:00:00Z'].sort()).toEqual([
      '2026-09-19T09:00:00Z',
      '2026-09-19T17:00:00Z',
    ]);
  });
});

describe('buildTimeslots', () => {
  const grid = (over: Partial<Parameters<typeof buildTimeslots>[0]> = {}) =>
    buildTimeslots({
      sessionId: 'sess-1',
      playDate: '2026-09-19',
      startTime: '09:00',
      count: 3,
      durationMin: 45,
      bufferMin: 5,
      ...over,
    });

  it('spaces slots by duration plus buffer', () => {
    expect(grid().map((s) => s.startAt)).toEqual([
      '2026-09-19T09:00:00Z',
      '2026-09-19T09:50:00Z',
      '2026-09-19T10:40:00Z',
    ]);
  });

  it('ends each slot a duration after it starts, leaving the buffer as a gap', () => {
    const [first] = grid();
    expect(first?.startAt).toBe('2026-09-19T09:00:00Z');
    expect(first?.endAt).toBe('2026-09-19T09:45:00Z');
  });

  it('the gap between slots is exactly the buffer', () => {
    // findBreaks reads gaps out of these timestamps, so the buffer has to
    // land in the data rather than only in the spacing.
    const [first, second] = grid();
    const gapMs = Date.parse(second?.startAt ?? '') - Date.parse(first?.endAt ?? '');
    expect(gapMs / 60000).toBe(5);
  });

  it('ids are stable and 1-based', () => {
    expect(grid().map((s) => s.id)).toEqual(['sess-1-ts-1', 'sess-1-ts-2', 'sess-1-ts-3']);
  });

  it('every slot belongs to the session it was built for', () => {
    expect(grid().every((s) => s.sessionId === 'sess-1')).toBe(true);
  });

  it('a count of zero is an empty grid, not an error', () => {
    expect(grid({ count: 0 })).toEqual([]);
  });

  it('a zero buffer packs slots back to back', () => {
    const packed = grid({ bufferMin: 0 });
    expect(packed[0]?.endAt).toBe(packed[1]?.startAt);
  });

  it('is deterministic — the same setup rebuilds the identical grid', () => {
    // The whole storage model depends on this: only results are stored and
    // the schedule is rebuilt on every read (rule 9).
    expect(grid()).toEqual(grid());
  });

  it('produces timestamps that sort correctly as strings', () => {
    // What everything downstream relies on, and what a display label could
    // not do (C4).
    const starts = grid({ count: 8 }).map((s) => s.startAt);
    expect([...starts].sort()).toEqual(starts);
  });
});
