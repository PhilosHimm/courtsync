/**
 * SKIPPED — specification for `generateLeagueFixtures`.
 *
 * No audit findings here either: no source repo ever scheduled a season.
 * A league differs from pool play in that the round-robin is spread ACROSS
 * sessions rather than packed into one day.
 */

import type { Session } from '@courtsync/core';
import { describe, expect, it } from 'vitest';
import { generateLeagueFixtures } from '../src/league-fixtures';

function sessions(n: number): Session[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `sess-wk-${i + 1}`,
    competitionId: 'comp-league',
    name: `Week ${i + 1}`,
    playDate: `2026-01-${String(6 + i * 7).padStart(2, '0')}`,
    startTime: '19:00',
    endTime: '22:00',
    sequence: i + 1,
  }));
}

function input(teams: number, weeks: number) {
  const ss = sessions(weeks);
  return {
    competitionSlug: 'tuesday-night',
    sessions: ss,
    participantIds: Array.from({ length: teams }, (_, i) => `lteam-${i + 1}`),
    courtIds: ['court-1', 'court-2'],
    timeslotsBySession: Object.fromEntries(
      ss.map((s) => [s.id, ['a', 'b', 'c'].map((t) => `ts-${s.id}-${t}`)]),
    ),
    rounds: 1,
  };
}

describe('generateLeagueFixtures', () => {
  it('generates a single round robin across the season', () => {
    const out = generateLeagueFixtures(input(8, 7));
    expect(out).toHaveLength(28); // 8*7/2
  });

  it('pairs every participant with every other exactly once', () => {
    const out = generateLeagueFixtures(input(8, 7));
    const seen = new Set<string>();
    for (const m of out) {
      const key = [m.homeParticipantId, m.awayParticipantId].sort().join('|');
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });

  it('spreads matches across sessions rather than packing them into week one', () => {
    const out = generateLeagueFixtures(input(8, 7));
    const perSession = new Map<string, number>();
    for (const m of out) {
      perSession.set(m.sessionId, (perSession.get(m.sessionId) ?? 0) + 1);
    }
    expect(perSession.size).toBe(7);
    const counts = [...perSession.values()];
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
  });

  it('gives every participant roughly equal matches per week', () => {
    const out = generateLeagueFixtures(input(8, 7));
    const perTeamPerWeek = new Map<string, Map<string, number>>();
    for (const m of out) {
      for (const id of [m.homeParticipantId, m.awayParticipantId]) {
        if (!id) continue;
        const weeks = perTeamPerWeek.get(id) ?? new Map<string, number>();
        weeks.set(m.sessionId, (weeks.get(m.sessionId) ?? 0) + 1);
        perTeamPerWeek.set(id, weeks);
      }
    }
    for (const [team, weeks] of perTeamPerWeek) {
      for (const [week, n] of weeks) {
        expect(n, `${team} plays ${n} times in ${week}`).toBeLessThanOrEqual(2);
      }
    }
  });

  it('never double-books a participant within a session timeslot', () => {
    const out = generateLeagueFixtures(input(8, 7));
    const bySlot = new Map<string, Set<string>>();
    for (const m of out) {
      if (!m.timeslotId) continue;
      const s = bySlot.get(m.timeslotId) ?? new Set<string>();
      for (const id of [m.homeParticipantId, m.awayParticipantId]) {
        if (!id) continue;
        expect(s.has(id)).toBe(false);
        s.add(id);
      }
      bySlot.set(m.timeslotId, s);
    }
  });

  it('labels matches by week so the UI can group them', () => {
    const out = generateLeagueFixtures(input(8, 7));
    for (const m of out) {
      expect(m.roundLabel).toMatch(/^Week \d+$/);
      expect(m.poolId ?? null).toBeNull();
    }
  });

  it('supports a double round robin', () => {
    const out = generateLeagueFixtures({ ...input(6, 10), rounds: 2 });
    expect(out).toHaveLength(30); // 6*5/2 * 2
  });

  it('handles an odd number of participants by giving byes', () => {
    const out = generateLeagueFixtures(input(7, 7));
    expect(out).toHaveLength(21); // 7*6/2
    const perSession = new Map<string, Set<string>>();
    for (const m of out) {
      const s = perSession.get(m.sessionId) ?? new Set<string>();
      if (m.homeParticipantId) s.add(m.homeParticipantId);
      if (m.awayParticipantId) s.add(m.awayParticipantId);
      perSession.set(m.sessionId, s);
    }
    // With 7 teams somebody sits out each week.
    for (const teams of perSession.values()) {
      expect(teams.size).toBeLessThanOrEqual(6);
    }
  });

  it('is deterministic', () => {
    const a = generateLeagueFixtures(input(8, 7));
    const b = generateLeagueFixtures(input(8, 7));
    expect(a.map((m) => m.id)).toEqual(b.map((m) => m.id));
  });
});
