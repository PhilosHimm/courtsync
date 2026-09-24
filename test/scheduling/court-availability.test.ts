/**
 * Specification for per-court availability windows across all three
 * generators (#17).
 *
 * "Court 3 is only ours until noon." `generatePoolPlay`,
 * `generateLeagueFixtures` and `generateDropInRotation` all assumed every
 * court was free in every slot. A window breaks that in all three at once,
 * which is why this is one suite and one change rather than three.
 *
 * What it holds:
 *
 * - A window is judged on timestamps (C4), per court and per session. No
 *   windows for a court on a session means no restriction.
 * - Each generator takes the blocked cells and never places a match on one.
 *   With no blocked cells, every generator's output is byte-for-byte what it
 *   was before, so the existing suites keep describing it.
 * - `auditSchedule` reports a match outside its court's window as blocking:
 *   the court is not the organizer's to use then.
 * - `suggestSlots` never offers a cell outside a window.
 * - Rest asked for in minutes converts to slots against the actual
 *   timestamps, not a nominal slot length, because slot lengths now vary by
 *   stage and a nominal length lies at the pool/playoff boundary.
 */

import { describe, expect, it } from 'vitest';
import type { Attendance, Court, CourtWindow, Session, Timeslot } from '@/lib/core';
import {
  isCourtAvailable,
  restSlotsForMinutes,
  unavailableCells,
} from '@/lib/scheduling/court-availability';
import { generateDropInRotation } from '@/lib/scheduling/dropin-rotation';
import { generateLeagueFixtures } from '@/lib/scheduling/league-fixtures';
import { generatePoolPlay } from '@/lib/scheduling/pool-play';
import { auditSchedule } from '@/lib/scheduling/schedule-audit';
import { suggestSlots } from '@/lib/scheduling/slot-suggestions';

/** Hourly slots from 09:00 on the given date, one per hour. */
function hourlySlots(sessionId: string, date: string, count: number, prefix = sessionId) {
  return Array.from({ length: count }, (_, i): Timeslot => {
    const hour = 9 + i;
    const pad = (n: number) => String(n).padStart(2, '0');
    return {
      id: `${prefix}-ts${i + 1}`,
      sessionId,
      startAt: `${date}T${pad(hour)}:00:00Z`,
      endAt: `${date}T${pad(hour + 1)}:00:00Z`,
    };
  });
}

const window = (
  id: string,
  courtId: string,
  sessionId: string,
  startAt: string,
  endAt: string,
): CourtWindow => ({ id, courtId, sessionId, startAt, endAt });

const court = (id: string): Court => ({ id, venueId: 'venue-1', name: id, isActive: true });

const day = hourlySlots('sess-1', '2026-05-02', 8); // 09:00 – 17:00
const until = (hour: string) => `2026-05-02T${hour}:00:00Z`;

describe('isCourtAvailable', () => {
  it('treats a court with no windows as available all session', () => {
    for (const slot of day) expect(isCourtAvailable([], 'c3', slot)).toBe(true);
  });

  it('allows a slot wholly inside one of the court’s windows', () => {
    const windows = [window('w1', 'c3', 'sess-1', until('09'), until('12'))];
    expect(isCourtAvailable(windows, 'c3', day[0]!)).toBe(true); // 09-10
    expect(isCourtAvailable(windows, 'c3', day[2]!)).toBe(true); // 11-12, ends on the boundary
    expect(isCourtAvailable(windows, 'c3', day[3]!)).toBe(false); // 12-13
  });

  it('refuses a slot the window only partly covers', () => {
    // Half a match on a court that is then handed to the badminton club is
    // not a match.
    const windows = [window('w1', 'c3', 'sess-1', until('09'), '2026-05-02T11:30:00Z')];
    expect(isCourtAvailable(windows, 'c3', day[1]!)).toBe(true); // 10-11
    expect(isCourtAvailable(windows, 'c3', day[2]!)).toBe(false); // 11-12
  });

  it('unions several windows for one court', () => {
    const windows = [
      window('w1', 'c3', 'sess-1', until('09'), until('11')),
      window('w2', 'c3', 'sess-1', until('14'), until('17')),
    ];
    const open = day.filter((slot) => isCourtAvailable(windows, 'c3', slot)).map((s) => s.id);
    expect(open).toEqual(['sess-1-ts1', 'sess-1-ts2', 'sess-1-ts6', 'sess-1-ts7', 'sess-1-ts8']);
  });

  it('ignores windows belonging to another court', () => {
    const windows = [window('w1', 'c2', 'sess-1', until('09'), until('10'))];
    for (const slot of day) expect(isCourtAvailable(windows, 'c3', slot)).toBe(true);
  });

  it('ignores windows belonging to another session', () => {
    // A court shared on Tuesdays is not restricted on Thursdays. The
    // constraint arrives per day of play, which is why a window names one.
    const windows = [window('w1', 'c3', 'sess-2', until('09'), until('10'))];
    for (const slot of day) expect(isCourtAvailable(windows, 'c3', slot)).toBe(true);
  });

  it('compares instants, not strings, so an offset timestamp still reads correctly', () => {
    // 07:00-05:00 is 12:00Z. A string comparison would call 07:00 earlier
    // than 11:00Z and let the 11-12 slot through a window that ends at 12:00Z
    // — and would call the 12-13 slot inside it too.
    const windows = [
      window('w1', 'c3', 'sess-1', '2026-05-02T04:00:00-05:00', '2026-05-02T07:00:00-05:00'),
    ];
    expect(isCourtAvailable(windows, 'c3', day[2]!)).toBe(true); // 11-12Z
    expect(isCourtAvailable(windows, 'c3', day[3]!)).toBe(false); // 12-13Z
  });
});

describe('unavailableCells', () => {
  it('lists nothing when there are no windows', () => {
    expect(unavailableCells({ courtIds: ['c1', 'c2'], timeslots: day, windows: [] })).toEqual([]);
  });

  it('lists every slot outside the window, in slot order then court order', () => {
    const windows = [window('w1', 'c2', 'sess-1', until('09'), until('15'))];
    const cells = unavailableCells({ courtIds: ['c1', 'c2'], timeslots: day, windows });
    expect(cells).toEqual([
      { courtId: 'c2', timeslotId: 'sess-1-ts7' },
      { courtId: 'c2', timeslotId: 'sess-1-ts8' },
    ]);
  });

  it('orders by timestamp even when the slots arrive shuffled', () => {
    const windows = [window('w1', 'c2', 'sess-1', until('11'), until('17'))];
    const shuffled = [day[1]!, day[0]!, ...day.slice(2)].reverse();
    const cells = unavailableCells({ courtIds: ['c2'], timeslots: shuffled, windows });
    expect(cells.map((c) => c.timeslotId)).toEqual(['sess-1-ts1', 'sess-1-ts2']);
  });

  it('does not mutate its inputs', () => {
    const windows = [window('w1', 'c2', 'sess-1', until('09'), until('15'))];
    const timeslots = [...day].reverse();
    const before = JSON.stringify({ timeslots, windows });
    unavailableCells({ courtIds: ['c1', 'c2'], timeslots, windows });
    expect(JSON.stringify({ timeslots, windows })).toBe(before);
  });
});

describe('restSlotsForMinutes', () => {
  it('asks for nothing when no rest was asked for', () => {
    expect(restSlotsForMinutes({ timeslots: day, restMinutes: 0 })).toBe(0);
  });

  it('converts against uniform hourly slots', () => {
    expect(restSlotsForMinutes({ timeslots: day, restMinutes: 30 })).toBe(1);
    expect(restSlotsForMinutes({ timeslots: day, restMinutes: 60 })).toBe(1);
    expect(restSlotsForMinutes({ timeslots: day, restMinutes: 61 })).toBe(2);
  });

  it('counts turnaround time between slots toward rest', () => {
    // 45-minute matches with a 15-minute buffer: back-to-back slots already
    // give 15 minutes, so 15 minutes of rest needs no empty slot.
    const buffered: Timeslot[] = [0, 1, 2, 3].map((i) => ({
      id: `b${i}`,
      sessionId: 'sess-1',
      startAt: `2026-05-02T${String(9 + i).padStart(2, '0')}:00:00Z`,
      endAt: `2026-05-02T${String(9 + i).padStart(2, '0')}:45:00Z`,
    }));
    expect(restSlotsForMinutes({ timeslots: buffered, restMinutes: 15 })).toBe(0);
    expect(restSlotsForMinutes({ timeslots: buffered, restMinutes: 16 })).toBe(1);
  });

  it('measures against the real timestamps when slot lengths vary by stage', () => {
    // Three 30-minute pool slots, then 60-minute playoff slots. Taking the
    // playoff slot as the nominal length says 45 minutes of rest is one empty
    // slot — true after the boundary, and 30 minutes of rest in the morning.
    // The answer the engine can use is the one that holds everywhere on the
    // grid.
    const mixed: Timeslot[] = [
      { id: 'p1', sessionId: 's', startAt: '2026-05-02T09:00:00Z', endAt: '2026-05-02T09:30:00Z' },
      { id: 'p2', sessionId: 's', startAt: '2026-05-02T09:30:00Z', endAt: '2026-05-02T10:00:00Z' },
      { id: 'p3', sessionId: 's', startAt: '2026-05-02T10:00:00Z', endAt: '2026-05-02T10:30:00Z' },
      { id: 'q1', sessionId: 's', startAt: '2026-05-02T10:30:00Z', endAt: '2026-05-02T11:30:00Z' },
      { id: 'q2', sessionId: 's', startAt: '2026-05-02T11:30:00Z', endAt: '2026-05-02T12:30:00Z' },
    ];
    expect(restSlotsForMinutes({ timeslots: mixed, restMinutes: 45 })).toBe(2);
    expect(restSlotsForMinutes({ timeslots: mixed, restMinutes: 60 })).toBe(2);
  });

  it('measures each session on its own grid', () => {
    const weekOne = hourlySlots('w1', '2026-05-02', 3);
    const weekTwo = hourlySlots('w2', '2026-05-09', 3);
    expect(restSlotsForMinutes({ timeslots: [...weekOne, ...weekTwo], restMinutes: 60 })).toBe(1);
  });

  it('refuses a negative or non-finite rest', () => {
    expect(() => restSlotsForMinutes({ timeslots: day, restMinutes: -5 })).toThrow();
    expect(() => restSlotsForMinutes({ timeslots: day, restMinutes: Number.NaN })).toThrow();
  });
});

describe('generatePoolPlay with a court that closes at noon', () => {
  const pools = [
    { id: 'pa', name: 'A', participantIds: ['a1', 'a2', 'a3', 'a4'] },
    { id: 'pb', name: 'B', participantIds: ['b1', 'b2', 'b3', 'b4'] },
  ];
  const base = {
    competitionSlug: 'spring',
    sessionId: 'sess-1',
    pools,
    courtIds: ['c1', 'c2', 'c3'],
    timeslotIds: day.map((s) => s.id),
  };
  const windows = [window('w1', 'c3', 'sess-1', until('09'), until('12'))];
  const unavailable = unavailableCells({ courtIds: base.courtIds, timeslots: day, windows });

  it('is unchanged when nothing is unavailable', () => {
    expect(generatePoolPlay({ ...base, unavailable: [] })).toEqual(generatePoolPlay(base));
  });

  it('never places a match on a blocked cell', () => {
    const { matches } = generatePoolPlay({ ...base, unavailable });
    const blocked = new Set(unavailable.map((c) => `${c.courtId}@${c.timeslotId}`));
    for (const match of matches) {
      expect(blocked.has(`${match.courtId}@${match.timeslotId}`)).toBe(false);
    }
  });

  it('still places every match when the remaining courts have room', () => {
    const { matches, unassigned } = generatePoolPlay({ ...base, unavailable });
    expect(unassigned).toEqual([]);
    expect(matches.every((m) => m.courtId !== null && m.timeslotId !== null)).toBe(true);
  });

  it('produces a grid the audit finds nothing wrong with', () => {
    const { matches } = generatePoolPlay({ ...base, unavailable });
    expect(auditSchedule({ matches, timeslots: day, courtWindows: windows })).toEqual([]);
  });

  it('reports what it cannot place rather than squeezing it onto a closed court', () => {
    // Two slots, and the second court is closed for both: twelve matches do
    // not fit on one court in two slots.
    const tight = {
      ...base,
      courtIds: ['c1', 'c2'],
      timeslotIds: day.slice(0, 2).map((s) => s.id),
      unavailable: [
        { courtId: 'c2', timeslotId: day[0]!.id },
        { courtId: 'c2', timeslotId: day[1]!.id },
      ],
    };
    const { matches, unassigned } = generatePoolPlay(tight);
    expect(matches.filter((m) => m.courtId === 'c2')).toEqual([]);
    expect(unassigned.length).toBe(matches.length - 2);
    for (const id of unassigned) {
      const match = matches.find((m) => m.id === id)!;
      expect(match.courtId).toBeNull();
      expect(match.timeslotId).toBeNull();
    }
  });

  it('skips a slot where every court is closed rather than stalling', () => {
    // Lunch: nothing is available 12-13.
    const lunch = ['c1', 'c2', 'c3'].map((courtId) => ({ courtId, timeslotId: day[3]!.id }));
    const { matches, unassigned } = generatePoolPlay({ ...base, unavailable: lunch });
    expect(unassigned).toEqual([]);
    expect(matches.some((m) => m.timeslotId === day[3]!.id)).toBe(false);
  });

  it('never mutates the unavailable list', () => {
    const copy = JSON.stringify(unavailable);
    generatePoolPlay({ ...base, unavailable });
    expect(JSON.stringify(unavailable)).toBe(copy);
  });
});

describe('generateLeagueFixtures with a court shared on one week', () => {
  const sessions: Session[] = [1, 2, 3].map((n) => ({
    id: `wk${n}`,
    competitionId: 'league',
    playDate: `2026-05-0${n}`,
    startTime: '19:00',
    endTime: '22:00',
    sequence: n,
  }));
  const slotsByWeek = Object.fromEntries(
    sessions.map((s) => [s.id, hourlySlots(s.id, s.playDate, 2)]),
  ) as Record<string, Timeslot[]>;
  const base = {
    competitionSlug: 'thursday',
    sessions,
    participantIds: ['t1', 't2', 't3', 't4'],
    courtIds: ['c1', 'c2'],
    timeslotsBySession: Object.fromEntries(
      Object.entries(slotsByWeek).map(([id, slots]) => [id, slots.map((s) => s.id)]),
    ),
  };
  // c2 is the badminton club's in week 2.
  const unavailable = slotsByWeek.wk2!.map((slot) => ({ courtId: 'c2', timeslotId: slot.id }));

  it('is unchanged when nothing is unavailable', () => {
    expect(generateLeagueFixtures({ ...base, unavailable: [] })).toEqual(
      generateLeagueFixtures(base),
    );
  });

  it('moves week 2 onto the court that is free, in later slots', () => {
    const fixtures = generateLeagueFixtures({ ...base, unavailable });
    const week2 = fixtures.filter((m) => m.sessionId === 'wk2');
    expect(week2.length).toBe(2);
    expect(week2.every((m) => m.courtId === 'c1')).toBe(true);
    expect(new Set(week2.map((m) => m.timeslotId)).size).toBe(2);
  });

  it('leaves the other weeks exactly where they were', () => {
    const before = generateLeagueFixtures(base).filter((m) => m.sessionId !== 'wk2');
    const after = generateLeagueFixtures({ ...base, unavailable }).filter(
      (m) => m.sessionId !== 'wk2',
    );
    expect(after).toEqual(before);
  });

  it('leaves a fixture with neither court nor time when the week has no room', () => {
    const closed = [...unavailable, { courtId: 'c1', timeslotId: slotsByWeek.wk2![1]!.id }];
    const week2 = generateLeagueFixtures({ ...base, unavailable: closed }).filter(
      (m) => m.sessionId === 'wk2',
    );
    expect(week2.filter((m) => m.timeslotId !== null)).toHaveLength(1);
    const unplaced = week2.filter((m) => m.timeslotId === null);
    expect(unplaced).toHaveLength(1);
    expect(unplaced[0]!.courtId).toBeNull();
  });
});

describe('generateDropInRotation with a court that opens late', () => {
  const attendance: Attendance[] = Array.from({ length: 16 }, (_, i) => ({
    id: `att-${i + 1}`,
    sessionId: 'sess-1',
    participantId: `p${String(i + 1).padStart(2, '0')}`,
    status: 'checked_in',
    recordedAt: '2026-05-02T08:30:00Z',
  }));
  const slots = day.slice(0, 3);
  const base = {
    competitionSlug: 'thursday',
    sessionId: 'sess-1',
    sessionSequence: 1,
    attendance,
    courtIds: ['c1', 'c2'],
    timeslotIds: slots.map((s) => s.id),
    playersPerSide: 4,
  };
  // c2 is not ours for the first slot.
  const unavailable = [{ courtId: 'c2', timeslotId: slots[0]!.id }];

  it('is unchanged when nothing is unavailable', () => {
    expect(generateDropInRotation({ ...base, unavailable: [] })).toEqual(
      generateDropInRotation(base),
    );
  });

  it('runs one match fewer while the court is closed, and sits those players out', () => {
    const { matches, sittingOut } = generateDropInRotation({ ...base, unavailable });
    const first = matches.filter((m) => m.timeslotId === slots[0]!.id);
    expect(first).toHaveLength(1);
    expect(first[0]!.courtId).toBe('c1');
    expect(sittingOut[slots[0]!.id]).toHaveLength(8);
    expect(matches.filter((m) => m.timeslotId === slots[1]!.id)).toHaveLength(2);
  });

  it('keeps sit-outs even: whoever sat while the court was closed plays next', () => {
    const { sides, sittingOut } = generateDropInRotation({ ...base, unavailable });
    const satFirst = new Set(sittingOut[slots[0]!.id]);
    const secondSlotMatchIds = new Set(
      generateDropInRotation({ ...base, unavailable })
        .matches.filter((m) => m.timeslotId === slots[1]!.id)
        .map((m) => m.id),
    );
    const playedSecond = sides
      .filter((s) => secondSlotMatchIds.has(s.matchId))
      .flatMap((s) => [...s.home.participantIds, ...s.away.participantIds]);
    for (const id of satFirst) expect(playedSecond).toContain(id);
  });
});

describe('auditSchedule and court windows', () => {
  const windows = [window('w1', 'c3', 'sess-1', until('09'), until('12'))];
  const match = (id: string, courtId: string, timeslotId: string) => ({
    id,
    competitionId: 'comp',
    sessionId: 'sess-1',
    poolId: null,
    courtId,
    timeslotId,
    homeParticipantId: `${id}-h`,
    awayParticipantId: `${id}-a`,
    refParticipantId: null,
    bracket: null,
    roundLabel: null,
    status: 'scheduled' as const,
    sets: [],
  });

  it('reports a match placed after its court closed, as blocking', () => {
    const conflicts = auditSchedule({
      matches: [match('m1', 'c3', day[4]!.id)],
      timeslots: day,
      courtWindows: windows,
    });
    expect(conflicts).toEqual([
      {
        kind: 'outside-court-window',
        severity: 'blocking',
        matchId: 'm1',
        courtId: 'c3',
        timeslotId: day[4]!.id,
      },
    ]);
  });

  it('says nothing about a match inside its court’s window', () => {
    expect(
      auditSchedule({
        matches: [match('m1', 'c3', day[1]!.id)],
        timeslots: day,
        courtWindows: windows,
      }),
    ).toEqual([]);
  });

  it('says nothing when no windows were given', () => {
    expect(auditSchedule({ matches: [match('m1', 'c3', day[4]!.id)], timeslots: day })).toEqual([]);
  });

  it('orders window conflicts after collisions and before warnings', () => {
    const conflicts = auditSchedule({
      matches: [
        match('m1', 'c1', day[0]!.id),
        match('m2', 'c1', day[0]!.id),
        match('m3', 'c3', day[5]!.id),
        { ...match('m4', 'c1', day[0]!.id), courtId: null },
      ],
      timeslots: day,
      courtWindows: windows,
    });
    expect(conflicts.map((c) => c.kind)).toEqual([
      'court-double-booked',
      'outside-court-window',
      'unplaced-match',
    ]);
  });
});

describe('suggestSlots and court windows', () => {
  it('never offers a slot outside the court’s window', () => {
    const windows = [window('w1', 'c3', 'sess-1', until('09'), until('12'))];
    const moving = {
      id: 'm1',
      competitionId: 'comp',
      sessionId: 'sess-1',
      poolId: null,
      courtId: 'c1',
      timeslotId: day[0]!.id,
      homeParticipantId: 'h',
      awayParticipantId: 'a',
      refParticipantId: null,
      bracket: null,
      roundLabel: null,
      status: 'scheduled' as const,
      sets: [],
    };
    const suggestions = suggestSlots({
      matchId: 'm1',
      matches: [moving],
      timeslots: day,
      courts: [court('c1'), court('c3')],
      courtWindows: windows,
    });
    const onC3 = suggestions.filter((s) => s.courtId === 'c3').map((s) => s.timeslotId);
    expect(onC3).toEqual(day.slice(0, 3).map((s) => s.id));
    // Court 1 has no windows and is offered everywhere but where it already is.
    expect(suggestions.filter((s) => s.courtId === 'c1')).toHaveLength(day.length - 1);
  });
});
