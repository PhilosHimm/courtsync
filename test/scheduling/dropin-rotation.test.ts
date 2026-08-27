/**
 * SKIPPED — specification for `generateDropInRotation` and
 * `promoteFromWaitlist`.
 *
 * No audit findings here: none of the source repos ever implemented a
 * drop-in. That makes this the format most likely to reveal that the
 * domain model is wrong, and the one worth building first if you want a
 * weekly feedback loop rather than a single tournament six months out.
 */

import type { Attendance } from '@courtsync/core';
import { describe, expect, it } from 'vitest';
import { generateDropInRotation, promoteFromWaitlist } from '../src/dropin-rotation';

function attendance(n: number, checkedIn: number, waitlisted = 0): Attendance[] {
  return Array.from({ length: n }, (_, i) => {
    const base = {
      id: `att-${i + 1}`,
      sessionId: 'sess-1',
      participantId: `player-${i + 1}`,
      recordedAt: '2026-02-05T18:00:00Z',
    };
    if (i < checkedIn) return { ...base, status: 'checked_in' as const };
    if (i < checkedIn + waitlisted) {
      return { ...base, status: 'waitlist' as const, waitlistPos: i - checkedIn + 1 };
    }
    return { ...base, status: 'no_show' as const };
  });
}

const input = (att: Attendance[]) => ({
  competitionSlug: 'thursday-dropin',
  sessionId: 'sess-1',
  sessionSequence: 1,
  attendance: att,
  courtIds: ['court-1', 'court-2'],
  timeslotIds: ['ts-1', 'ts-2', 'ts-3'],
  playersPerSide: 4,
});

describe('generateDropInRotation', () => {
  it('places only checked-in players', () => {
    const att = attendance(16, 12, 2);
    const out = generateDropInRotation(input(att));
    const placed = new Set(
      out.sides.flatMap((s) => [...s.home.participantIds, ...s.away.participantIds]),
    );
    for (const id of placed) {
      const a = att.find((x) => x.participantId === id);
      expect(a?.status).toBe('checked_in');
    }
  });

  it('fills each side to playersPerSide', () => {
    const out = generateDropInRotation(input(attendance(16, 16)));
    for (const s of out.sides) {
      expect(s.home.participantIds).toHaveLength(4);
      expect(s.away.participantIds).toHaveLength(4);
    }
  });

  it('never puts the same player on both sides of one match', () => {
    const out = generateDropInRotation(input(attendance(16, 16)));
    for (const s of out.sides) {
      const overlap = s.home.participantIds.filter((p) => s.away.participantIds.includes(p));
      expect(overlap).toHaveLength(0);
    }
  });

  it('never schedules a player on two courts in the same timeslot', () => {
    const out = generateDropInRotation(input(attendance(16, 16)));
    const bySlot = new Map<string, Set<string>>();
    for (const m of out.matches) {
      if (!m.timeslotId) continue;
      const side = out.sides.find((s) => s.matchId === m.id);
      const seen = bySlot.get(m.timeslotId) ?? new Set<string>();
      for (const p of [
        ...(side?.home.participantIds ?? []),
        ...(side?.away.participantIds ?? []),
      ]) {
        expect(seen.has(p)).toBe(false);
        seen.add(p);
      }
      bySlot.set(m.timeslotId, seen);
    }
  });

  it('shares court time evenly — nobody sits out twice before everyone sits once', () => {
    // 20 checked in, 2 courts x 8 players = 16 playing per slot, 4 sit out.
    const out = generateDropInRotation(input(attendance(20, 20)));
    const sitOutCount = new Map<string, number>();
    for (const ids of Object.values(out.sittingOut)) {
      for (const id of ids) sitOutCount.set(id, (sitOutCount.get(id) ?? 0) + 1);
    }
    const counts = [...sitOutCount.values()];
    if (counts.length > 0) {
      expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
    }
  });

  it('reshuffles sides between timeslots rather than fixing teams for the night', () => {
    const out = generateDropInRotation(input(attendance(16, 16)));
    const firstSlot = out.sides.filter(
      (s) => out.matches.find((m) => m.id === s.matchId)?.timeslotId === 'ts-1',
    );
    const secondSlot = out.sides.filter(
      (s) => out.matches.find((m) => m.id === s.matchId)?.timeslotId === 'ts-2',
    );
    const key = (ids: string[]) => [...ids].sort().join(',');
    const firstKeys = new Set(
      firstSlot.flatMap((s) => [key(s.home.participantIds), key(s.away.participantIds)]),
    );
    const repeated = secondSlot.filter(
      (s) => firstKeys.has(key(s.home.participantIds)) || firstKeys.has(key(s.away.participantIds)),
    );
    expect(repeated.length).toBeLessThan(secondSlot.length);
  });

  it('handles a headcount that does not divide evenly', () => {
    // 13 checked in with 4 per side: one match of 8, five sitting out.
    const out = generateDropInRotation(input(attendance(13, 13)));
    expect(out.matches.length).toBeGreaterThan(0);
    for (const s of out.sides) {
      expect(s.home.participantIds.length).toBe(s.away.participantIds.length);
    }
  });

  it('returns no matches when too few players are checked in', () => {
    const out = generateDropInRotation(input(attendance(5, 5)));
    expect(out.matches).toHaveLength(0);
  });

  it('is deterministic', () => {
    const a = generateDropInRotation(input(attendance(16, 16)));
    const b = generateDropInRotation(input(attendance(16, 16)));
    expect(a.sides).toEqual(b.sides);
  });
});

describe('promoteFromWaitlist', () => {
  it('promotes in waitlist order when capacity frees up', () => {
    const att = attendance(14, 10, 4);
    const { promoted } = promoteFromWaitlist(att, 12);
    expect(promoted.map((p) => p.fromPosition)).toEqual([1, 2]);
  });

  it('renumbers the remaining waitlist contiguously from 1', () => {
    const att = attendance(14, 10, 4);
    const { attendance: next } = promoteFromWaitlist(att, 12);
    const positions = next
      .filter((a) => a.status === 'waitlist')
      .map((a) => a.waitlistPos)
      .sort((a, b) => (a ?? 0) - (b ?? 0));
    expect(positions).toEqual([1, 2]);
  });

  it('promotes nobody when the session is already full', () => {
    const att = attendance(14, 12, 2);
    const { promoted } = promoteFromWaitlist(att, 12);
    expect(promoted).toHaveLength(0);
  });

  it('does not mutate the input', () => {
    const att = attendance(14, 10, 4);
    const snapshot = JSON.stringify(att);
    promoteFromWaitlist(att, 12);
    expect(JSON.stringify(att)).toBe(snapshot);
  });
});
