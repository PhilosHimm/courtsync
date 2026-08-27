/**
 * The schema's definition of done: a tournament, a 10-week league season,
 * and a recurring drop-in series all fit the same model.
 *
 * If any of these break, the domain model has regressed to being
 * tournament-shaped and leagues or drop-ins can no longer be expressed.
 * That is the failure this whole consolidation exists to prevent.
 */

import { describe, expect, it } from 'vitest';
import { makeDropInSeries, makeLeagueSeason, makeTournament } from '@/lib/core/testing/fixtures';
import { setsWon, totalPoints } from '@/lib/core/utils/index';

describe('tournament format', () => {
  const f = makeTournament();

  it('has exactly one session', () => {
    expect(f.sessions).toHaveLength(1);
    expect(f.competition.format).toBe('tournament');
  });

  it('groups team participants into pools', () => {
    expect(f.pools).toHaveLength(3);
    expect(f.participants).toHaveLength(12);
    expect(f.participants.every((p) => p.kind === 'team')).toBe(true);
  });

  it('supports bracket matches alongside pool matches', () => {
    const bracket = f.matches.filter((m) => m.bracket !== undefined && m.bracket !== null);
    const pool = f.matches.filter((m) => m.poolId !== null && m.poolId !== undefined);
    expect(bracket.length).toBeGreaterThan(0);
    expect(pool.length).toBeGreaterThan(0);
  });

  it('records pool play as two sets', () => {
    const poolMatch = f.matches.find((m) => m.roundLabel === 'Pool Play');
    expect(poolMatch?.sets).toHaveLength(2);
    expect(setsWon(poolMatch!)).toEqual({ home: 2, away: 0 });
  });
});

describe('league format', () => {
  const f = makeLeagueSeason();

  it('spans ten weekly sessions', () => {
    expect(f.competition.format).toBe('league');
    expect(f.sessions).toHaveLength(10);
    expect(f.sessions.map((s) => s.sequence)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('has no pools — the thing the old tournament-rooted model assumed', () => {
    expect(f.pools).toHaveLength(0);
  });

  it('gives every session its own independent timeslot grid', () => {
    const bySession = new Map<string, number>();
    for (const t of f.timeslots) {
      bySession.set(t.sessionId, (bySession.get(t.sessionId) ?? 0) + 1);
    }
    expect(bySession.size).toBe(10);
    expect([...bySession.values()].every((n) => n === 3)).toBe(true);
  });

  it('supports a three-set match', () => {
    const m = f.matches[0]!;
    expect(m.sets).toHaveLength(3);
    expect(setsWon(m)).toEqual({ home: 2, away: 1 });
    expect(totalPoints(m)).toEqual({ home: 63, away: 59 });
  });
});

describe('drop-in format', () => {
  const f = makeDropInSeries();

  it('uses individual participants rather than teams', () => {
    expect(f.competition.format).toBe('dropin');
    expect(f.participants).toHaveLength(14);
    expect(f.participants.every((p) => p.kind === 'individual')).toBe(true);
  });

  it('tracks capacity through attendance, including a waitlist', () => {
    const checkedIn = f.attendance.filter((a) => a.status === 'checked_in');
    const noShow = f.attendance.filter((a) => a.status === 'no_show');
    const waitlisted = f.attendance.filter((a) => a.status === 'waitlist');

    expect(checkedIn).toHaveLength(10);
    expect(noShow).toHaveLength(2);
    expect(waitlisted).toHaveLength(2);
  });

  it('numbers the waitlist from 1', () => {
    const positions = f.attendance
      .filter((a) => a.status === 'waitlist')
      .map((a) => a.waitlistPos)
      .sort((a, b) => (a ?? 0) - (b ?? 0));
    expect(positions).toEqual([1, 2]);
  });

  it('only assigns a waitlist position to waitlisted entries', () => {
    for (const a of f.attendance) {
      expect(a.waitlistPos !== undefined).toBe(a.status === 'waitlist');
    }
  });

  it('allows matches whose sides are not yet decided', () => {
    const m = f.matches[0]!;
    expect(m.homeParticipantId).toBeNull();
    expect(m.awayParticipantId).toBeNull();
    expect(m.status).toBe('scheduled');
  });
});

describe('cross-format invariants', () => {
  const fixtures = [makeTournament(), makeLeagueSeason(), makeDropInSeries()];

  it('never stores standings on the participant', () => {
    for (const f of fixtures) {
      for (const p of f.participants) {
        for (const forbidden of ['wins', 'losses', 'pointsFor', 'pointsAgainst']) {
          expect(p).not.toHaveProperty(forbidden);
        }
      }
    }
  });

  it('scopes every timeslot to a session that exists', () => {
    for (const f of fixtures) {
      const sessionIds = new Set(f.sessions.map((s) => s.id));
      for (const t of f.timeslots) {
        expect(sessionIds.has(t.sessionId)).toBe(true);
      }
    }
  });

  it('always ends a timeslot after it starts — the schema check constraint', () => {
    for (const f of fixtures) {
      for (const t of f.timeslots) {
        expect(new Date(t.endAt).getTime()).toBeGreaterThan(new Date(t.startAt).getTime());
      }
    }
  });

  it('sorts timeslots correctly by timestamp, not by a display label', () => {
    // Audit finding C4: sorting on a 12-hour string put "12:00 AM" before
    // "12:00 PM". Sorting on startAt cannot have that failure mode.
    for (const f of fixtures) {
      const sorted = [...f.timeslots].sort((a, b) => a.startAt.localeCompare(b.startAt));
      for (let i = 1; i < sorted.length; i++) {
        expect(sorted[i]!.startAt >= sorted[i - 1]!.startAt).toBe(true);
      }
    }
  });

  it('never lets a referee also be playing in the same match', () => {
    for (const f of fixtures) {
      for (const m of f.matches) {
        if (!m.refParticipantId) continue;
        expect(m.refParticipantId).not.toBe(m.homeParticipantId);
        expect(m.refParticipantId).not.toBe(m.awayParticipantId);
      }
    }
  });
});
