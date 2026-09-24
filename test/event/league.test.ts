/**
 * Specification for moving a league week (#28).
 */

import { describe, expect, it } from 'vitest';
import type { Match, Session } from '@/lib/core';
import { timeslotGrid } from '@/lib/core';
import { planPostponement } from '@/lib/event/league';

const zone = 'America/Toronto';
const weeks: Session[] = [1, 2, 3, 4].map((n) => ({
  id: `wk${n}`,
  competitionId: 'l',
  name: `Week ${n}`,
  playDate: `2026-10-${String(1 + (n - 1) * 7).padStart(2, '0')}`,
  startTime: '19:00',
  endTime: '22:00',
  sequence: n,
}));
const timeslots = weeks.flatMap((w) =>
  timeslotGrid({
    sessionId: w.id,
    playDate: w.playDate,
    startTime: '19:00',
    count: 2,
    durationMin: 60,
    bufferMin: 0,
    timeZone: zone,
  }),
);
const fixture = (id: string, sessionId: string, status: Match['status'] = 'scheduled'): Match => ({
  id,
  competitionId: 'l',
  sessionId,
  status,
  sets: [],
});

describe('planPostponement', () => {
  it('moves only this week for a make-up night, with its slots at the same clock times', () => {
    const plan = planPostponement({
      sessions: weeks,
      timeslots,
      matches: [fixture('m', 'wk2')],
      sessionId: 'wk2',
      newDate: '2026-10-10',
      mode: 'only',
      timeZone: zone,
    });
    expect(plan.moved).toEqual(['wk2']);
    expect(plan.sessions.map((s) => s.playDate)).toEqual([
      '2026-10-01',
      '2026-10-10',
      '2026-10-15',
      '2026-10-22',
    ]);
    const slots = plan.timeslots.filter((t) => t.sessionId === 'wk2');
    expect(slots.map((t) => t.startAt)).toEqual([
      '2026-10-10T23:00:00.000Z',
      '2026-10-11T00:00:00.000Z',
    ]);
  });

  it('pushes this week and every later one back by the same number of days', () => {
    const plan = planPostponement({
      sessions: weeks,
      timeslots,
      matches: [],
      sessionId: 'wk2',
      newDate: '2026-10-15',
      mode: 'cascade',
      timeZone: zone,
    });
    expect(plan.moved).toEqual(['wk2', 'wk3', 'wk4']);
    expect(plan.sessions.map((s) => s.playDate)).toEqual([
      '2026-10-01',
      '2026-10-15',
      '2026-10-22',
      '2026-10-29',
    ]);
  });

  it('keeps the venue clock across a daylight-saving change', () => {
    // 2026-11-01: Toronto falls back. 19:00 is 23:00Z before and 00:00Z after.
    const plan = planPostponement({
      sessions: weeks,
      timeslots,
      matches: [],
      sessionId: 'wk4',
      newDate: '2026-11-05',
      mode: 'only',
      timeZone: zone,
    });
    expect(plan.timeslots.find((t) => t.sessionId === 'wk4')?.startAt).toBe(
      '2026-11-06T00:00:00.000Z',
    );
  });

  it('refuses to move a week that has been played', () => {
    expect(() =>
      planPostponement({
        sessions: weeks,
        timeslots,
        matches: [fixture('m', 'wk3', 'final')],
        sessionId: 'wk2',
        newDate: '2026-10-15',
        mode: 'cascade',
        timeZone: zone,
      }),
    ).toThrow(/results/);
  });

  it('refuses a make-up night on a date another week already holds', () => {
    expect(() =>
      planPostponement({
        sessions: weeks,
        timeslots,
        matches: [],
        sessionId: 'wk2',
        newDate: '2026-10-15',
        mode: 'only',
        timeZone: zone,
      }),
    ).toThrow(/Week 3/);
  });

  it('leaves every fixture on its session, so the whole week travels together', () => {
    const matches = [fixture('m1', 'wk2'), fixture('m2', 'wk3')];
    const before = JSON.stringify(matches);
    planPostponement({
      sessions: weeks,
      timeslots,
      matches,
      sessionId: 'wk2',
      newDate: '2026-10-15',
      mode: 'cascade',
      timeZone: zone,
    });
    expect(JSON.stringify(matches)).toBe(before);
  });
});
