/**
 * Specification for venue wall-clock conversion.
 *
 * "9:00 Saturday" at a gym in Toronto is 13:00Z in summer and 14:00Z in
 * winter. Storing it as 09:00Z made every comparison with the real clock
 * wrong by the gym's offset.
 */

import { describe, expect, it } from 'vitest';
import {
  instantToWallClock,
  isTimeZone,
  slotsThatFit,
  timeslotGrid,
  venueClockLabel,
  wallClockToInstant,
} from '@/lib/core/time';

describe('wallClockToInstant', () => {
  it('converts a summer and a winter morning in Toronto', () => {
    expect(wallClockToInstant('2026-07-04', '09:00', 'America/Toronto')).toBe(
      '2026-07-04T13:00:00.000Z',
    );
    expect(wallClockToInstant('2026-01-10', '09:00', 'America/Toronto')).toBe(
      '2026-01-10T14:00:00.000Z',
    );
  });

  it('is the identity in UTC', () => {
    expect(wallClockToInstant('2026-05-02', '19:30', 'UTC')).toBe('2026-05-02T19:30:00.000Z');
  });

  it('handles a zone east of UTC across midnight', () => {
    expect(wallClockToInstant('2026-05-02', '08:00', 'Australia/Sydney')).toBe(
      '2026-05-01T22:00:00.000Z',
    );
  });

  it('keeps an evening on the right side of a DST change', () => {
    // 2026-03-08 is the spring-forward day in North America.
    expect(wallClockToInstant('2026-03-08', '19:00', 'America/Toronto')).toBe(
      '2026-03-08T23:00:00.000Z',
    );
    expect(wallClockToInstant('2026-03-07', '19:00', 'America/Toronto')).toBe(
      '2026-03-08T00:00:00.000Z',
    );
  });

  it('round-trips through instantToWallClock', () => {
    for (const zone of ['America/Vancouver', 'Europe/Berlin', 'Asia/Kolkata', 'UTC']) {
      const instant = wallClockToInstant('2026-10-17', '18:45', zone);
      expect(instantToWallClock(instant, zone)).toEqual({ date: '2026-10-17', clock: '18:45' });
    }
  });
});

describe('venueClockLabel', () => {
  it('shows the gym clock, not UTC', () => {
    expect(venueClockLabel('2026-07-04T16:00:00.000Z', 'America/Toronto')).toBe('12:00pm');
    expect(venueClockLabel('2026-07-04T04:30:00.000Z', 'America/Toronto')).toBe('12:30am');
  });
});

describe('timeslotGrid', () => {
  it('builds slots from the venue clock with the buffer between them', () => {
    const grid = timeslotGrid({
      sessionId: 's1',
      playDate: '2026-07-04',
      startTime: '09:00',
      count: 3,
      durationMin: 45,
      bufferMin: 15,
      timeZone: 'America/Toronto',
    });
    expect(grid).toEqual([
      {
        id: 's1-ts-1',
        sessionId: 's1',
        startAt: '2026-07-04T13:00:00.000Z',
        endAt: '2026-07-04T13:45:00.000Z',
      },
      {
        id: 's1-ts-2',
        sessionId: 's1',
        startAt: '2026-07-04T14:00:00.000Z',
        endAt: '2026-07-04T14:45:00.000Z',
      },
      {
        id: 's1-ts-3',
        sessionId: 's1',
        startAt: '2026-07-04T15:00:00.000Z',
        endAt: '2026-07-04T15:45:00.000Z',
      },
    ]);
  });
});

describe('slotsThatFit', () => {
  it('counts whole matches between the start and end of the day', () => {
    expect(
      slotsThatFit({ startTime: '09:00', endTime: '17:00', durationMin: 45, bufferMin: 15 }),
    ).toBe(8);
    expect(
      slotsThatFit({ startTime: '09:00', endTime: '09:30', durationMin: 45, bufferMin: 15 }),
    ).toBe(0);
    // The last match needs its playing time, not its buffer.
    expect(
      slotsThatFit({ startTime: '19:00', endTime: '21:45', durationMin: 45, bufferMin: 15 }),
    ).toBe(3);
  });
});

describe('isTimeZone', () => {
  it('knows a real zone and refuses a made-up one', () => {
    expect(isTimeZone('America/Toronto')).toBe(true);
    expect(isTimeZone('Mars/Olympus_Mons')).toBe(false);
  });
});
