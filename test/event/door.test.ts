/**
 * Specification for the drop-in door (#26).
 */

import { describe, expect, it } from 'vitest';
import type { Attendance, AttendanceStatus } from '@/lib/core';
import { hostSet, join, leave, occupied, selfCheckIn, walkIn } from '@/lib/event/door';

const now = '2026-05-07T19:00:00Z';
const entry = (
  participantId: string,
  status: AttendanceStatus,
  waitlistPos?: number,
): Attendance => ({
  id: `att-${participantId}`,
  sessionId: 's',
  participantId,
  status,
  ...(waitlistPos === undefined ? {} : { waitlistPos }),
  recordedAt: '2026-05-01T00:00:00Z',
});

const full = [
  entry('a', 'registered'),
  entry('b', 'checked_in'),
  entry('w1', 'waitlist', 1),
  entry('w2', 'waitlist', 2),
];

describe('join', () => {
  it('puts a player in when there is room', () => {
    const { attendance } = join({
      attendance: [],
      capacity: 2,
      participantId: 'p',
      sessionId: 's',
      id: 'x',
      now,
    });
    expect(attendance).toEqual([
      { id: 'x', sessionId: 's', participantId: 'p', status: 'registered', recordedAt: now },
    ]);
  });

  it('puts a player at the back of the waitlist when the session is full', () => {
    const { attendance } = join({
      attendance: full,
      capacity: 2,
      participantId: 'p',
      sessionId: 's',
      id: 'x',
      now,
    });
    expect(attendance.at(-1)).toMatchObject({
      participantId: 'p',
      status: 'waitlist',
      waitlistPos: 3,
    });
  });

  it('changes nothing for a player already on the list', () => {
    const { attendance } = join({
      attendance: full,
      capacity: 2,
      participantId: 'w1',
      sessionId: 's',
      id: 'x',
      now,
    });
    expect(attendance).toEqual(full);
  });

  it('has no limit when the session has no capacity set', () => {
    const { attendance } = join({
      attendance: full,
      capacity: null,
      participantId: 'p',
      sessionId: 's',
      id: 'x',
      now,
    });
    expect(attendance.at(-1)?.status).toBe('registered');
  });
});

describe('leave', () => {
  it('gives the freed place to the first person waiting, as registered not checked in', () => {
    const { attendance, promoted } = leave({ attendance: full, capacity: 2, participantId: 'a' });
    expect(promoted).toEqual(['w1']);
    expect(attendance.find((x) => x.participantId === 'w1')).toMatchObject({
      status: 'registered',
    });
    expect(attendance.find((x) => x.participantId === 'w2')).toMatchObject({
      status: 'waitlist',
      waitlistPos: 1,
    });
  });

  it('promotes nobody when a waitlisted player leaves, and closes the gap', () => {
    const { attendance, promoted } = leave({ attendance: full, capacity: 2, participantId: 'w1' });
    expect(promoted).toEqual([]);
    expect(attendance.find((x) => x.participantId === 'w2')?.waitlistPos).toBe(1);
  });
});

describe('hostSet', () => {
  it('frees a place with a no-show and fills it from the waitlist', () => {
    const { attendance, promoted } = hostSet({
      attendance: full,
      capacity: 2,
      participantId: 'a',
      status: 'no_show',
      now,
    });
    expect(promoted).toEqual(['w1']);
    expect(occupied(attendance)).toBe(2);
  });

  it('lets the host check in a waitlisted player over capacity', () => {
    const { attendance, promoted } = hostSet({
      attendance: full,
      capacity: 2,
      participantId: 'w2',
      status: 'checked_in',
      now,
    });
    expect(promoted).toEqual([]);
    expect(occupied(attendance)).toBe(3);
    expect(attendance.find((x) => x.participantId === 'w1')?.waitlistPos).toBe(1);
    expect(attendance.find((x) => x.participantId === 'w2')?.waitlistPos).toBeUndefined();
  });

  it('puts a player back on the end of the waitlist and promotes nobody past them', () => {
    const { attendance } = hostSet({
      attendance: full,
      capacity: 2,
      participantId: 'a',
      status: 'waitlist',
      now,
    });
    // a's place freed, w1 promoted into it; a joins the back of the queue.
    expect(attendance.find((x) => x.participantId === 'w1')?.status).toBe('registered');
    expect(attendance.find((x) => x.participantId === 'a')).toMatchObject({
      status: 'waitlist',
      waitlistPos: 2,
    });
  });

  it('refuses a player who is not on the list', () => {
    expect(() =>
      hostSet({ attendance: full, capacity: 2, participantId: 'zz', status: 'checked_in', now }),
    ).toThrow();
  });
});

describe('selfCheckIn', () => {
  it('checks in a registered player', () => {
    expect(
      selfCheckIn({ attendance: full, participantId: 'a', now }).find(
        (x) => x.participantId === 'a',
      )?.status,
    ).toBe('checked_in');
  });

  it('refuses a waitlisted player, pointing them at the host', () => {
    expect(() => selfCheckIn({ attendance: full, participantId: 'w1', now })).toThrow(/host/);
  });
});

describe('walkIn', () => {
  it('checks a walk-in in even when the session is full', () => {
    const attendance = walkIn({
      attendance: full,
      participantId: 'walk',
      sessionId: 's',
      id: 'x',
      now,
    });
    expect(attendance.at(-1)).toMatchObject({ participantId: 'walk', status: 'checked_in' });
    expect(occupied(attendance)).toBe(3);
  });
});

describe('purity', () => {
  it('never mutates the attendance it was given', () => {
    const before = JSON.stringify(full);
    join({ attendance: full, capacity: 2, participantId: 'p', sessionId: 's', id: 'x', now });
    leave({ attendance: full, capacity: 2, participantId: 'a' });
    hostSet({ attendance: full, capacity: 2, participantId: 'a', status: 'no_show', now });
    selfCheckIn({ attendance: full, participantId: 'a', now });
    walkIn({ attendance: full, participantId: 'walk', sessionId: 's', id: 'x', now });
    expect(JSON.stringify(full)).toBe(before);
  });
});
