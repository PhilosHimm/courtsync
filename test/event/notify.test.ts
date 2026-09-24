/**
 * Specification for notification planning (#27).
 */

import { describe, expect, it } from 'vitest';
import {
  appendBody,
  channelsFor,
  DIGEST_MAX_HOLD_MS,
  DIGEST_WINDOW_MS,
  holdUntil,
  render,
  smsText,
} from '@/lib/event/notify';

describe('channelsFor', () => {
  it('sends nothing without consent, and nothing to a channel with no address', () => {
    expect(channelsFor(null, { email: 'a@b.c', phone: '+15550000000' })).toEqual([]);
    expect(channelsFor({ emailOptIn: false, smsOptIn: false }, { email: 'a@b.c' })).toEqual([]);
    expect(
      channelsFor({ emailOptIn: true, smsOptIn: true }, { email: 'a@b.c', phone: null }),
    ).toEqual(['email']);
    expect(
      channelsFor({ emailOptIn: true, smsOptIn: true }, { email: 'a@b.c', phone: '+1555' }),
    ).toEqual(['email', 'sms']);
  });
});

describe('render', () => {
  it('groups schedule changes for one event under one key, so forty moves are one message', () => {
    const a = render({
      kind: 'schedule-changed',
      eventName: 'Open',
      eventId: 'e',
      line: 'Match 3 moved to Court 2',
    });
    const b = render({
      kind: 'schedule-changed',
      eventName: 'Open',
      eventId: 'e',
      line: 'Match 5 moved to 11:00',
    });
    expect(a.digestKey).toBe(b.digestKey);
  });

  it('never groups a cancellation with anything else', () => {
    const cancel = render({
      kind: 'session-cancelled',
      eventName: 'Thursday',
      eventId: 'e',
      sessionLabel: 'May 7',
      reason: 'Gym flooded',
    });
    const change = render({
      kind: 'schedule-changed',
      eventName: 'Thursday',
      eventId: 'e',
      line: 'x',
    });
    expect(cancel.digestKey).not.toBe(change.digestKey);
    expect(cancel.body).toBe('May 7 is cancelled. Gym flooded');
  });
});

describe('holdUntil', () => {
  const now = '2026-05-02T08:52:00.000Z';
  it('holds a new message for the digest window', () => {
    expect(Date.parse(holdUntil({ now, existingCreatedAt: null })) - Date.parse(now)).toBe(
      DIGEST_WINDOW_MS,
    );
  });

  it('never holds past the maximum, however many edits arrive', () => {
    const created = '2026-05-02T08:43:00.000Z';
    expect(holdUntil({ now, existingCreatedAt: created })).toBe(
      new Date(Date.parse(created) + DIGEST_MAX_HOLD_MS).toISOString(),
    );
  });
});

describe('appendBody', () => {
  it('adds a line once', () => {
    expect(appendBody(appendBody('a', 'b'), 'b')).toBe('a\nb');
  });
});

describe('smsText', () => {
  it('keeps a text short', () => {
    expect(smsText('S', 'x'.repeat(1000)).length).toBe(300);
    expect(smsText('S', 'short')).toBe('S\nshort');
  });
});
