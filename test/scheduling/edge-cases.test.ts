/**
 * Boundary and degenerate-input coverage for the scheduling engine.
 *
 * The per-function suites specify the behaviour an organizer relies on. This
 * one covers what happens at the edges: empty inputs, counts of zero and one,
 * capacity that does not fit, and input that is simply wrong.
 *
 * The rule applied throughout: a schedule that cannot be built is reported,
 * and input that is invalid raises. Nothing here may fail silently — a
 * schedule that is quietly missing matches is worse than one that refuses to
 * generate, because the first is discovered on the day.
 */

import type { Attendance, Match, Participant, Session } from '@courtsync/core';
import { describe, expect, it } from 'vitest';
import { generateDropInRotation, promoteFromWaitlist } from '../src/dropin-rotation';
import { generateLeagueFixtures } from '../src/league-fixtures';
import { generatePoolPlay } from '../src/pool-play';
import { assignReferees } from '../src/referees';
import { advanceBracket, seedBrackets } from '../src/seeding';
import { computeStandings } from '../src/standings';

const BASE = { competitionSlug: 'x', sessionId: 'sess-1' };

const participant = (id: string): Participant => ({
  id,
  competitionId: 'comp-1',
  kind: 'team',
  name: id.toUpperCase(),
  registeredAt: '2026-01-01T00:00:00Z',
});

const attendee = (id: string, status: Attendance['status'], waitlistPos?: number): Attendance => ({
  id: `att-${id}`,
  sessionId: 'sess-1',
  participantId: id,
  status,
  ...(waitlistPos === undefined ? {} : { waitlistPos }),
  recordedAt: '2026-01-01T00:00:00Z',
});

function bareMatch(
  id: string,
  home: string | null,
  away: string | null,
  timeslotId: string,
): Match {
  return {
    id,
    competitionId: 'comp-1',
    sessionId: 'sess-1',
    poolId: 'pool-a',
    courtId: 'court-1',
    timeslotId,
    homeParticipantId: home,
    awayParticipantId: away,
    status: 'scheduled',
    sets: [],
  };
}

// ── pool play ────────────────────────────────────────────────────────────

describe('generatePoolPlay — edges', () => {
  it('returns nothing for no pools rather than throwing', () => {
    const out = generatePoolPlay({ ...BASE, pools: [], courtIds: ['c1'], timeslotIds: ['t1'] });
    expect(out.matches).toEqual([]);
    expect(out.unassigned).toEqual([]);
  });

  it('produces no matches for a pool of one — there is nobody to play', () => {
    const out = generatePoolPlay({
      ...BASE,
      pools: [{ id: 'p', name: 'A', participantIds: ['solo'] }],
      courtIds: ['c1'],
      timeslotIds: ['t1'],
    });
    expect(out.matches).toEqual([]);
  });

  it('produces exactly one match for a pool of two', () => {
    const out = generatePoolPlay({
      ...BASE,
      pools: [{ id: 'p', name: 'A', participantIds: ['a', 'b'] }],
      courtIds: ['c1'],
      timeslotIds: ['t1', 't2'],
    });
    expect(out.matches).toHaveLength(1);
    expect(out.unassigned).toEqual([]);
    expect(out.matches[0]?.timeslotId).toBe('t1');
  });

  it('marks everything unassigned when there are no courts, keeping the fixtures', () => {
    const out = generatePoolPlay({
      ...BASE,
      pools: [{ id: 'p', name: 'A', participantIds: ['a', 'b', 'c', 'd'] }],
      courtIds: [],
      timeslotIds: ['t1', 't2'],
    });
    // The fixtures are still real even when the day cannot hold them.
    expect(out.matches).toHaveLength(6);
    expect(out.unassigned).toHaveLength(6);
    for (const m of out.matches) {
      expect(m.timeslotId).toBeNull();
      expect(m.courtId).toBeNull();
    }
  });

  it('marks everything unassigned when there are no timeslots', () => {
    const out = generatePoolPlay({
      ...BASE,
      pools: [{ id: 'p', name: 'A', participantIds: ['a', 'b'] }],
      courtIds: ['c1'],
      timeslotIds: [],
    });
    expect(out.matches).toHaveLength(1);
    expect(out.unassigned).toHaveLength(1);
  });

  it('refuses a participant entered twice in the same pool', () => {
    // Left alone this pairs somebody against themselves, which the schema
    // then rejects at write time with no useful explanation.
    expect(() =>
      generatePoolPlay({
        ...BASE,
        pools: [{ id: 'p', name: 'A', participantIds: ['a', 'a', 'b'] }],
        courtIds: ['c1'],
        timeslotIds: ['t1', 't2', 't3'],
      }),
    ).toThrow(/appears more than once/i);
  });

  it('refuses a participant entered in two pools', () => {
    // Placement assumes pools are disjoint; a shared participant would be
    // scheduled onto two courts in the same timeslot.
    expect(() =>
      generatePoolPlay({
        ...BASE,
        pools: [
          { id: 'p1', name: 'A', participantIds: ['a', 'shared'] },
          { id: 'p2', name: 'B', participantIds: ['b', 'shared'] },
        ],
        courtIds: ['c1'],
        timeslotIds: ['t1', 't2'],
      }),
    ).toThrow(/both pool/i);
  });

  it('gives an odd pool a bye each round rather than a second match', () => {
    const out = generatePoolPlay({
      ...BASE,
      pools: [{ id: 'p', name: 'A', participantIds: ['a', 'b', 'c'] }],
      courtIds: ['c1'],
      timeslotIds: ['t1', 't2', 't3', 't4', 't5', 't6'],
    });
    expect(out.matches).toHaveLength(3); // 3*2/2
    for (const m of out.matches) {
      expect(m.homeParticipantId).not.toBe(m.awayParticipantId);
    }
  });
});

// ── referees ─────────────────────────────────────────────────────────────

describe('assignReferees — edges', () => {
  it('handles having nothing to do', () => {
    const out = assignReferees({ matches: [], pools: [], allParticipantIds: [] });
    expect(out.matches).toEqual([]);
    expect(out.unassigned).toEqual([]);
    expect(out.refCounts).toEqual({});
  });

  it('balances candidates who belong to no declared pool', () => {
    // refCounts only holds pool members, so balancing off it alone stopped
    // counting anyone reached through the cross-pool fallback — and an
    // uncounted candidate looks permanently idle, so one person refereed
    // everything. Audit finding H7 by another route.
    const out = assignReferees({
      matches: [
        bareMatch('m1', 'a1', 'a2', 'ts-1'),
        bareMatch('m2', 'a1', 'a2', 'ts-2'),
        bareMatch('m3', 'a1', 'a2', 'ts-3'),
      ],
      pools: [{ id: 'pool-a', name: 'A', participantIds: ['a1', 'a2'] }],
      allParticipantIds: ['a1', 'a2', 'x1', 'x2', 'x3'],
    });

    const refs = out.matches.map((m) => m.refParticipantId);
    expect(new Set(refs).size).toBe(3);
    expect(out.unassigned).toEqual([]);
  });

  it('assigns a referee to a match with no pool', () => {
    const noPool = { ...bareMatch('m1', 'a1', 'a2', 'ts-1'), poolId: null };
    const out = assignReferees({
      matches: [noPool],
      pools: [{ id: 'pool-a', name: 'A', participantIds: ['a1', 'a2', 'a3'] }],
      allParticipantIds: ['a1', 'a2', 'a3'],
    });
    expect(out.matches[0]?.refParticipantId).toBe('a3');
  });

  it('treats a match with no timeslot as always refereeable', () => {
    const floating = { ...bareMatch('m1', 'a1', 'a2', ''), timeslotId: null };
    const out = assignReferees({
      matches: [floating],
      pools: [{ id: 'pool-a', name: 'A', participantIds: ['a1', 'a2', 'a3'] }],
      allParticipantIds: ['a1', 'a2', 'a3'],
    });
    expect(out.matches[0]?.refParticipantId).toBe('a3');
  });
});

// ── standings ────────────────────────────────────────────────────────────

describe('computeStandings — edges', () => {
  it('returns an empty table for no participants', () => {
    expect(computeStandings({ participants: [], matches: [] })).toEqual([]);
  });

  it('ignores a match referencing participants it does not know', () => {
    const rows = computeStandings({
      participants: [participant('t1')],
      matches: [{ ...bareMatch('m1', 'ghost-a', 'ghost-b', 'ts-1'), status: 'final' }],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.wins).toBe(0);
    expect(rows[0]?.losses).toBe(0);
  });

  it('ignores a match with a side still to be decided', () => {
    const rows = computeStandings({
      participants: [participant('t1'), participant('t2')],
      matches: [{ ...bareMatch('m1', 't1', null, 'ts-1'), status: 'final' }],
    });
    expect(rows.every((r) => r.wins === 0 && r.losses === 0)).toBe(true);
  });

  it('awards nothing for a final match with no sets recorded', () => {
    // "Final" with no scores is not a result, it is missing data.
    const rows = computeStandings({
      participants: [participant('t1'), participant('t2')],
      matches: [{ ...bareMatch('m1', 't1', 't2', 'ts-1'), status: 'final' }],
    });
    expect(rows.every((r) => r.wins === 0 && r.losses === 0)).toBe(true);
  });

  it('never divides by zero for a participant who has not played', () => {
    const rows = computeStandings({ participants: [participant('t1')], matches: [] });
    expect(rows[0]?.winPercentage).toBe(0);
    expect(Number.isNaN(rows[0]?.winPercentage)).toBe(false);
  });

  it('leaves a drawn split undecided when total points are also level', () => {
    const drawn: Match = {
      ...bareMatch('m1', 't1', 't2', 'ts-1'),
      status: 'final',
      sets: [
        { id: 's1', matchId: 'm1', setNumber: 1, homePoints: 21, awayPoints: 19 },
        { id: 's2', matchId: 'm1', setNumber: 2, homePoints: 19, awayPoints: 21 },
      ],
    };
    const rows = computeStandings({
      participants: [participant('t1'), participant('t2')],
      matches: [drawn],
    });
    expect(rows.every((r) => r.wins === 0 && r.losses === 0)).toBe(true);
    // Sets and points still count even though the match was not won.
    expect(rows.every((r) => r.setsWon === 1 && r.setsLost === 1)).toBe(true);
  });

  it('ranks every participant even when nobody has played', () => {
    const rows = computeStandings({
      participants: [participant('t3'), participant('t1'), participant('t2')],
      matches: [],
    });
    expect(rows.map((r) => r.rank)).toEqual([1, 2, 3]);
    // Fully tied, so the stable final tiebreak decides: participant id.
    expect(rows.map((r) => r.participantId)).toEqual(['t1', 't2', 't3']);
  });
});

// ── seeding ──────────────────────────────────────────────────────────────

describe('seedBrackets and advanceBracket — edges', () => {
  it('seeds nothing from empty standings', () => {
    expect(seedBrackets({ ...BASE, standingsByPool: {}, tiers: ['gold'] })).toEqual([]);
  });

  it('seeds nothing when no tiers are requested', () => {
    expect(seedBrackets({ ...BASE, standingsByPool: { 'pool-a': [] }, tiers: [] })).toEqual([]);
  });

  it('advances nothing when the bracket has no matches', () => {
    expect(advanceBracket({ competitionSlug: 'x', tier: 'gold', matches: [] })).toEqual([]);
  });

  it('leaves unrelated matches untouched', () => {
    const poolMatch = bareMatch('x-pool-a-1', 'a1', 'a2', 'ts-1');
    const out = advanceBracket({ competitionSlug: 'x', tier: 'gold', matches: [poolMatch] });
    expect(out).toEqual([poolMatch]);
  });
});

// ── drop-in ──────────────────────────────────────────────────────────────

describe('generateDropInRotation — edges', () => {
  const dropInBase = { ...BASE, sessionSequence: 1 };

  it('produces nothing when there are no timeslots', () => {
    const out = generateDropInRotation({
      ...dropInBase,
      attendance: [attendee('p1', 'checked_in')],
      courtIds: ['c1'],
      timeslotIds: [],
      playersPerSide: 2,
    });
    expect(out.matches).toEqual([]);
    expect(out.sittingOut).toEqual({});
  });

  it('sits everyone out when there are no courts', () => {
    const out = generateDropInRotation({
      ...dropInBase,
      attendance: [attendee('p1', 'checked_in'), attendee('p2', 'checked_in')],
      courtIds: [],
      timeslotIds: ['t1'],
      playersPerSide: 1,
    });
    expect(out.matches).toEqual([]);
    expect(out.sittingOut.t1).toEqual(['p1', 'p2']);
  });

  it('treats a nonsensical side size as nobody playing rather than crashing', () => {
    const out = generateDropInRotation({
      ...dropInBase,
      attendance: [attendee('p1', 'checked_in')],
      courtIds: ['c1'],
      timeslotIds: ['t1'],
      playersPerSide: -3,
    });
    expect(out.matches).toEqual([]);
    expect(out.sittingOut.t1).toEqual(['p1']);
  });

  it('ignores registered, waitlisted and no-show attendees', () => {
    const out = generateDropInRotation({
      ...dropInBase,
      attendance: [
        attendee('in1', 'checked_in'),
        attendee('in2', 'checked_in'),
        attendee('reg', 'registered'),
        attendee('wait', 'waitlist', 1),
        attendee('gone', 'no_show'),
      ],
      courtIds: ['c1'],
      timeslotIds: ['t1'],
      playersPerSide: 1,
    });
    const placed = out.sides.flatMap((s) => [...s.home.participantIds, ...s.away.participantIds]);
    expect(placed.sort()).toEqual(['in1', 'in2']);
    expect(out.sittingOut.t1).toEqual([]);
  });
});

describe('promoteFromWaitlist — edges', () => {
  it('promotes nobody from an empty waitlist', () => {
    const { promoted, attendance } = promoteFromWaitlist([attendee('p1', 'checked_in')], 10);
    expect(promoted).toEqual([]);
    expect(attendance).toHaveLength(1);
  });

  it('promotes nobody when capacity is already over-subscribed', () => {
    const { promoted } = promoteFromWaitlist(
      [attendee('p1', 'checked_in'), attendee('p2', 'checked_in'), attendee('w1', 'waitlist', 1)],
      1,
    );
    expect(promoted).toEqual([]);
  });

  it('promotes the whole waitlist when there is room for everyone', () => {
    const { promoted, attendance } = promoteFromWaitlist(
      [attendee('w1', 'waitlist', 1), attendee('w2', 'waitlist', 2)],
      10,
    );
    expect(promoted.map((p) => p.participantId)).toEqual(['w1', 'w2']);
    expect(attendance.every((a) => a.status === 'registered')).toBe(true);
    expect(attendance.every((a) => a.waitlistPos === undefined)).toBe(true);
  });

  it('treats zero capacity as no room', () => {
    const { promoted } = promoteFromWaitlist([attendee('w1', 'waitlist', 1)], 0);
    expect(promoted).toEqual([]);
  });
});

// ── league fixtures ──────────────────────────────────────────────────────

describe('generateLeagueFixtures — edges', () => {
  const session = (id: string, sequence: number): Session => ({
    id,
    competitionId: 'comp-1',
    playDate: '2026-01-06',
    startTime: '19:00',
    endTime: '22:00',
    sequence,
  });

  it('produces nothing without sessions', () => {
    expect(
      generateLeagueFixtures({
        competitionSlug: 'x',
        sessions: [],
        participantIds: ['a', 'b'],
        courtIds: ['c1'],
        timeslotsBySession: {},
      }),
    ).toEqual([]);
  });

  it('produces nothing for a single participant', () => {
    expect(
      generateLeagueFixtures({
        competitionSlug: 'x',
        sessions: [session('w1', 1)],
        participantIds: ['solo'],
        courtIds: ['c1'],
        timeslotsBySession: { w1: ['t1'] },
      }),
    ).toEqual([]);
  });

  it('refuses a participant entered twice', () => {
    expect(() =>
      generateLeagueFixtures({
        competitionSlug: 'x',
        sessions: [session('w1', 1)],
        participantIds: ['a', 'b', 'a'],
        courtIds: ['c1'],
        timeslotsBySession: { w1: ['t1'] },
      }),
    ).toThrow(/appears more than once/i);
  });

  it('wraps extra rounds back onto earlier sessions with unique ids', () => {
    // Four teams need three rounds; a two-week season has to hold them.
    const out = generateLeagueFixtures({
      competitionSlug: 'x',
      sessions: [session('w1', 1), session('w2', 2)],
      participantIds: ['a', 'b', 'c', 'd'],
      courtIds: ['court-1'],
      timeslotsBySession: { w1: ['t1', 't2'], w2: ['t3', 't4'] },
    });
    expect(out).toHaveLength(6);
    expect(new Set(out.map((m) => m.id)).size).toBe(6);
  });

  it('leaves court and timeslot null when a session runs out of room', () => {
    // Reported by being null rather than by dropping the fixture: a missing
    // match is discovered on the day, an unplaced one is visible beforehand.
    const out = generateLeagueFixtures({
      competitionSlug: 'x',
      sessions: [session('w1', 1)],
      participantIds: ['a', 'b', 'c', 'd'],
      courtIds: ['court-1'],
      timeslotsBySession: { w1: ['t1'] },
    });
    const unplaced = out.filter((m) => m.timeslotId === null);
    expect(out.length).toBeGreaterThan(0);
    expect(unplaced.length).toBeGreaterThan(0);
    for (const m of unplaced) expect(m.courtId).toBeNull();
  });

  it('still produces fixtures when a session has no timeslots at all', () => {
    const out = generateLeagueFixtures({
      competitionSlug: 'x',
      sessions: [session('w1', 1)],
      participantIds: ['a', 'b'],
      courtIds: ['court-1'],
      timeslotsBySession: {},
    });
    expect(out).toHaveLength(1);
    expect(out[0]?.timeslotId).toBeNull();
  });

  it('treats a round count below one as a single round robin', () => {
    const out = generateLeagueFixtures({
      competitionSlug: 'x',
      sessions: [session('w1', 1), session('w2', 2), session('w3', 3)],
      participantIds: ['a', 'b', 'c', 'd'],
      courtIds: ['court-1', 'court-2'],
      timeslotsBySession: { w1: ['t1'], w2: ['t2'], w3: ['t3'] },
      rounds: 0,
    });
    expect(out).toHaveLength(6); // 4*3/2, not zero
  });
});
