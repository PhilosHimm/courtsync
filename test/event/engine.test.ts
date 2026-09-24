/**
 * Specification for the engine as applied to a stored event.
 *
 * The data layer calls these and writes what they return, so every decision
 * about who plays whom, where and who advances is made here, without a
 * database, and pinned here.
 */

import { describe, expect, it } from 'vitest';
import {
  advanceAll,
  auditOf,
  driftAfter,
  formatOf,
  leagueTable,
  planLeague,
  planPlayoffs,
  planPoolDraw,
  planPoolPlay,
  poolPlayComplete,
  poolTables,
  setFormatsOf,
} from '@/lib/event/engine';
import type { EventSnapshot } from '@/lib/event/snapshot';
import { auditSchedule } from '@/lib/scheduling';
import { decide, snapshotOf } from './snapshot-fixture';

/** A tournament with pools drawn and pool play generated. */
function scheduled(overrides: Parameters<typeof snapshotOf>[0] = {}): EventSnapshot {
  const base = snapshotOf(overrides);
  const drawn = planPoolDraw(base).pools.map((p, i) => ({ ...p, id: `pool-${i + 1}` }));
  const withPools = { ...base, pools: drawn };
  return { ...withPools, matches: planPoolPlay(withPools).matches };
}

/** Every pool match played, the lower seed number winning. */
function played(snapshot: EventSnapshot): EventSnapshot {
  return {
    ...snapshot,
    matches: snapshot.matches.map((m) =>
      m.poolId ? decide(m, (m.homeParticipantId ?? '') < (m.awayParticipantId ?? '')) : m,
    ),
  };
}

describe('planPoolDraw', () => {
  it('draws the organizer’s pool count, lettered A, B…', () => {
    const { pools } = planPoolDraw(snapshotOf({ teams: 12, competition: { poolCount: 3 } }));
    expect(pools.map((p) => p.name)).toEqual(['A', 'B', 'C']);
    expect(pools.map((p) => p.participantIds.length)).toEqual([4, 4, 4]);
  });

  it('suggests a count when the organizer has not chosen one', () => {
    const { pools } = planPoolDraw(snapshotOf({ teams: 8 }));
    expect(pools.flatMap((p) => p.participantIds).sort()).toHaveLength(8);
  });

  it('refuses a field too small to draw, in words', () => {
    expect(() => planPoolDraw(snapshotOf({ teams: 2 }))).toThrow(/at least three/);
  });
});

describe('planPoolPlay', () => {
  it('schedules every pool match on the first day with a clean audit', () => {
    const s = scheduled();
    expect(s.matches.length).toBe(12); // two pools of four
    expect(s.matches.every((m) => m.sessionId === 'sess-1' && m.courtId && m.timeslotId)).toBe(
      true,
    );
    expect(auditOf(s)).toEqual([]);
  });

  it('keeps matches off a court outside its window', () => {
    const base = snapshotOf();
    const s = scheduled({
      competition: {},
    });
    const windowed: EventSnapshot = {
      ...s,
      matches: [],
      courtWindows: [
        {
          id: 'w',
          courtId: 'court-2',
          sessionId: 'sess-1',
          startAt: base.timeslots[0]!.startAt,
          endAt: base.timeslots[1]!.endAt,
        },
      ],
    };
    const { matches } = planPoolPlay(windowed);
    const late = new Set(base.timeslots.slice(2).map((t) => t.id));
    expect(matches.some((m) => m.courtId === 'court-2' && late.has(m.timeslotId ?? ''))).toBe(
      false,
    );
    expect(
      auditSchedule({ matches, timeslots: s.timeslots, courtWindows: windowed.courtWindows }),
    ).toEqual([]);
  });

  it('converts the organizer’s rest in minutes into slots on the real grid', () => {
    // 60 minutes of rest on 45+15 slots is one empty slot between matches.
    const s = scheduled({ competition: { minRestMin: 60 } });
    const conflicts = auditSchedule({
      matches: s.matches,
      timeslots: s.timeslots,
      minRestSlots: 1,
    });
    expect(conflicts.filter((c) => c.kind === 'insufficient-rest')).toEqual([]);
  });

  it('assigns referees from the pools', () => {
    const s = scheduled();
    expect(s.matches.filter((m) => m.refParticipantId).length).toBeGreaterThan(0);
  });
});

describe('standings', () => {
  it('computes each pool’s table from its own matches', () => {
    const s = played(scheduled());
    const tables = poolTables(s);
    expect(Object.keys(tables)).toEqual(['pool-1', 'pool-2']);
    for (const table of Object.values(tables)) {
      expect(table).toHaveLength(4);
      expect(table[0]!.wins).toBe(3);
    }
    expect(poolPlayComplete(s)).toBe(true);
  });

  it('applies the competition’s tiebreaker order and forfeit policy', () => {
    const s = played(scheduled());
    const winOnly = poolTables({
      ...s,
      competition: { ...s.competition, forfeitPolicy: 'winOnly' },
    });
    expect(Object.values(winOnly)[0]!).toHaveLength(4);
    expect(() =>
      poolTables({ ...s, competition: { ...s.competition, tiebreakerOrder: [] } }),
    ).toThrow();
  });
});

describe('planPlayoffs', () => {
  it('refuses to seed before every pool match has a result', () => {
    expect(() => planPlayoffs(scheduled())).toThrow(/Every pool match/);
  });

  it('seeds the gold bracket and places each round after the one before it', () => {
    const s = played(scheduled());
    const { matches, unplaced } = planPlayoffs(s);
    expect(unplaced).toEqual([]);
    const slotStart = (id: string | null | undefined) =>
      Date.parse(s.timeslots.find((t) => t.id === id)?.startAt ?? '');
    const lastPool = Math.max(...s.matches.map((m) => slotStart(m.timeslotId)));
    const round = (labels: string[]) => matches.filter((m) => labels.includes(m.roundLabel ?? ''));
    const quarters = round(['q1', 'q2', 'q3', 'q4']);
    const semis = round(['s1', 's2']);
    const final = round(['final']);
    expect(quarters.every((m) => slotStart(m.timeslotId) > lastPool)).toBe(true);
    expect(Math.min(...semis.map((m) => slotStart(m.timeslotId)))).toBeGreaterThan(
      Math.max(...quarters.map((m) => slotStart(m.timeslotId))),
    );
    expect(slotStart(final[0]!.timeslotId)).toBeGreaterThan(
      Math.max(...semis.map((m) => slotStart(m.timeslotId))),
    );
    // The combined grid is still clean.
    expect(
      auditOf({ ...s, matches: [...s.matches, ...matches] }).filter(
        (c) => c.severity === 'blocking',
      ),
    ).toEqual([]);
  });

  it('does not place a bye', () => {
    const s = played(scheduled({ teams: 6, competition: { poolCount: 2 } }));
    const { matches } = planPlayoffs(s);
    const byes = matches.filter(
      (m) =>
        /^q/.test(m.roundLabel ?? '') &&
        Boolean(m.homeParticipantId) !== Boolean(m.awayParticipantId),
    );
    expect(byes.length).toBeGreaterThan(0);
    for (const bye of byes) expect(bye.timeslotId).toBeNull();
  });
});

describe('advanceAll', () => {
  it('moves quarterfinal winners into the semifinals', () => {
    const s = played(scheduled());
    const bracket = planPlayoffs(s).matches;
    const decided = bracket.map((m) => (/^q/.test(m.roundLabel ?? '') ? decide(m, true, 25) : m));
    const { matches, stalled } = advanceAll(s, decided);
    expect(stalled).toEqual([]);
    const s1 = matches.find((m) => m.roundLabel === 's1')!;
    const q1 = decided.find((m) => m.roundLabel === 'q1')!;
    expect(s1.homeParticipantId).toBe(q1.homeParticipantId);
  });

  it('stalls a tier on a tied elimination match and says so, rather than throwing (H15)', () => {
    const s = played(scheduled());
    const bracket = planPlayoffs(s).matches;
    const tied = bracket.map((m) =>
      m.roundLabel === 'q1'
        ? {
            ...m,
            status: 'final' as const,
            sets: [
              { id: 'a', matchId: m.id, setNumber: 1, homePoints: 25, awayPoints: 20 },
              { id: 'b', matchId: m.id, setNumber: 2, homePoints: 20, awayPoints: 25 },
            ],
          }
        : m,
    );
    const { stalled } = advanceAll(s, tied);
    expect(stalled.map((x) => x.tier)).toEqual(['gold']);
    expect(stalled[0]!.reason).toMatch(/tie/);
  });
});

describe('driftAfter', () => {
  it('reports the quarterfinals a corrected pool score would move', () => {
    const s = played(scheduled());
    const bracket = planPlayoffs(s).matches;
    const withBracket = { ...s, matches: [...s.matches, ...bracket] };
    // Flip every result in pool 1: its table turns upside down.
    const corrected = withBracket.matches.map((m) =>
      m.poolId === 'pool-1'
        ? decide(m, (m.homeParticipantId ?? '') > (m.awayParticipantId ?? ''))
        : m,
    );
    expect(driftAfter(withBracket, corrected).length).toBeGreaterThan(0);
    expect(driftAfter(withBracket, withBracket.matches)).toEqual([]);
  });
});

describe('planLeague', () => {
  it('plays one round a week across the season, skipping a cancelled week', () => {
    const base = snapshotOf({ format: 'league', teams: 4, sessions: 4, slots: 3 });
    const cancelled = {
      ...base,
      sessions: base.sessions.map((s, i) =>
        i === 1 ? { ...s, cancelledAt: '2026-07-10T00:00:00Z' } : s,
      ),
    };
    const { matches } = planLeague(cancelled);
    expect(matches.some((m) => m.sessionId === 'sess-2')).toBe(false);
    expect(matches).toHaveLength(6); // a single round-robin of four teams
    expect(leagueTable({ ...cancelled, matches })).toHaveLength(4);
  });

  it('plays every opponent twice when the season has two legs', () => {
    const base = snapshotOf({
      format: 'league',
      teams: 4,
      sessions: 6,
      slots: 3,
      competition: { leagueLegs: 2 },
    });
    expect(planLeague(base).matches).toHaveLength(12);
  });
});

describe('set formats', () => {
  it('uses the organizer’s rules for a phase and the default for the other', () => {
    const s = snapshotOf();
    const custom = {
      ...s,
      setFormats: [
        {
          id: 'f',
          competitionId: 'comp-1',
          phase: 'pool' as const,
          setNumber: 1,
          target: 15,
          winBy: 2,
          cap: null,
        },
      ],
    };
    const formats = setFormatsOf(custom);
    expect(formats.pool).toEqual([{ target: 15, winBy: 2, cap: null }]);
    expect(formats.playoff).toHaveLength(3);
  });

  it('plays a league fixture to the regular rules', () => {
    const s = snapshotOf({ format: 'league' });
    const fixture = { ...planLeague({ ...s, sessions: s.sessions }).matches[0]! };
    expect(formatOf(s, fixture).phase).toBe('pool');
  });
});
