/**
 * Specification for the schedule views (#24).
 *
 * Four views, each with a different reader: the match list (the accessible
 * baseline), the court timeline (the one artifact the product actually
 * makes), my schedule (next activity first), and one team's whole day (the
 * thing screenshotted into a group chat). They are all the same rows cut
 * differently, so they share one row builder — and one sort key, the slot's
 * timestamp (C4), never a formatted label.
 */

import { describe, expect, it } from 'vitest';
import type { Court, Match, MatchStatus, Timeslot } from '@/lib/core';
import { MATCH_STATUSES } from '@/lib/core';
import {
  courtTimeline,
  filterRows,
  nextUp,
  STATUS_LABELS,
  scheduleRows,
  teamDay,
} from '@/lib/event/views';

const slot = (id: string, hour: number, sessionId = 'day1'): Timeslot => ({
  id,
  sessionId,
  startAt: `2026-05-02T${String(hour).padStart(2, '0')}:00:00Z`,
  endAt: `2026-05-02T${String(hour).padStart(2, '0')}:45:00Z`,
});

// Deliberately out of order, and with an hour whose 12-hour label sorts
// wrongly (C4): 12:00 must come after 09:00 and before 13:00.
const timeslots = [slot('t13', 13), slot('t09', 9), slot('t12', 12)];

const courts: Court[] = [
  { id: 'c2', venueId: 'v', name: 'Court 2', isActive: true },
  { id: 'c1', venueId: 'v', name: 'Court 1', isActive: true },
];

const names = { spk: 'Spikers', blk: 'Blockheads', dig: 'Dig Deep', set: 'Setters' };

const match = (
  id: string,
  timeslotId: string | null,
  courtId: string | null,
  home: string,
  away: string,
  status: MatchStatus = 'scheduled',
  ref: string | null = null,
): Match => ({
  id,
  competitionId: 'comp',
  sessionId: 'day1',
  poolId: 'pa',
  courtId,
  timeslotId,
  homeParticipantId: home,
  awayParticipantId: away,
  refParticipantId: ref,
  bracket: null,
  roundLabel: 'pool',
  status,
  sets:
    status === 'final'
      ? [
          { id: `${id}-1`, matchId: id, setNumber: 1, homePoints: 21, awayPoints: 18 },
          { id: `${id}-2`, matchId: id, setNumber: 2, homePoints: 19, awayPoints: 21 },
        ]
      : [],
});

const matches = [
  match('m3', 't13', 'c1', 'spk', 'dig'),
  match('m1', 't09', 'c2', 'spk', 'blk', 'final', 'dig'),
  match('m2', 't09', 'c1', 'dig', 'set', 'live'),
  match('m4', 't12', 'c2', 'blk', 'set', 'delayed', 'spk'),
  match('m5', null, null, 'set', 'spk'),
];

const rows = scheduleRows({ matches, timeslots, courts, names });

describe('scheduleRows', () => {
  it('orders by the slot timestamp, then court name, with unplaced matches last', () => {
    expect(rows.map((r) => r.matchId)).toEqual(['m2', 'm1', 'm4', 'm3', 'm5']);
  });

  it('resolves names, court and a readable score', () => {
    const m1 = rows.find((r) => r.matchId === 'm1')!;
    expect(m1).toMatchObject({
      home: 'Spikers',
      away: 'Blockheads',
      referee: 'Dig Deep',
      court: 'Court 2',
      startAt: '2026-05-02T09:00:00Z',
      status: 'final',
      statusLabel: 'Final',
      score: '21–18, 19–21',
    });
  });

  it('says a team is still to be decided rather than showing nothing', () => {
    const tbd = scheduleRows({
      matches: [{ ...match('q1', 't09', 'c1', 'spk', 'blk'), awayParticipantId: null }],
      timeslots,
      courts,
      names,
    });
    expect(tbd[0]!.away).toBe('To be decided');
  });

  it('never mutates the matches it was given', () => {
    const before = JSON.stringify(matches);
    scheduleRows({ matches, timeslots, courts, names });
    expect(JSON.stringify(matches)).toBe(before);
  });
});

describe('STATUS_LABELS', () => {
  it('has a text label for every status, so colour is never the only signal', () => {
    for (const status of MATCH_STATUSES) expect(STATUS_LABELS[status]).toMatch(/\w/);
  });
});

describe('filterRows', () => {
  it('finds a team by any part of its name, ignoring case', () => {
    expect(filterRows(rows, { team: 'spik' }).map((r) => r.matchId)).toEqual([
      'm1',
      'm4',
      'm3',
      'm5',
    ]);
  });

  it('counts refereeing as appearing in a match', () => {
    // A team looking for "when are we on?" means on court in any role.
    expect(filterRows(rows, { team: 'dig deep' }).map((r) => r.matchId)).toContain('m1');
  });

  it('filters by court and by status, and combines filters', () => {
    expect(filterRows(rows, { courtId: 'c1' }).map((r) => r.matchId)).toEqual(['m2', 'm3']);
    expect(filterRows(rows, { status: 'live' }).map((r) => r.matchId)).toEqual(['m2']);
    expect(filterRows(rows, { team: 'setters', courtId: 'c2' }).map((r) => r.matchId)).toEqual([
      'm4',
    ]);
  });

  it('returns everything for an empty filter', () => {
    expect(filterRows(rows, {})).toEqual(rows);
    expect(filterRows(rows, { team: '   ' })).toEqual(rows);
  });
});

describe('courtTimeline', () => {
  const grid = courtTimeline({ rows, timeslots, courts });

  it('has one column per court in name order and one row per slot in time order', () => {
    expect(grid.courts.map((c) => c.name)).toEqual(['Court 1', 'Court 2']);
    expect(grid.slots.map((s) => s.timeslotId)).toEqual(['t09', 't12', 't13']);
  });

  it('puts each placed match in its cell and leaves empty cells null', () => {
    const at = (slotId: string) => grid.slots.find((s) => s.timeslotId === slotId)!.cells;
    expect(at('t09').map((cell) => cell?.matchId ?? null)).toEqual(['m2', 'm1']);
    expect(at('t12').map((cell) => cell?.matchId ?? null)).toEqual([null, 'm4']);
  });

  it('lists what could not be placed on the grid, rather than dropping it', () => {
    expect(grid.unplaced.map((r) => r.matchId)).toEqual(['m5']);
  });

  it('reports every match in a doubled-up cell rather than keeping only one', () => {
    // A hand-edited grid can put two matches in one cell. The audit calls it
    // blocking; the timeline has to show it, not quietly overwrite one.
    const doubled = scheduleRows({
      matches: [...matches, match('m6', 't13', 'c1', 'blk', 'set')],
      timeslots,
      courts,
      names,
    });
    const g = courtTimeline({ rows: doubled, timeslots, courts });
    const cell = g.slots.find((s) => s.timeslotId === 't13')!.cells[0];
    expect(cell?.matchId).toBe('m3');
    expect(g.collisions.map((r) => r.matchId)).toEqual(['m6']);
  });
});

describe('teamDay', () => {
  it('lists a team’s whole day in order, with its role in each match', () => {
    const day = teamDay(rows, 'spk');
    expect(day.map((d) => [d.row.matchId, d.role])).toEqual([
      ['m1', 'playing'],
      ['m4', 'refereeing'],
      ['m3', 'playing'],
      ['m5', 'playing'],
    ]);
    expect(day[0]!.opponent).toBe('Blockheads');
  });
});

describe('nextUp', () => {
  it('is the first match not yet over, by slot time', () => {
    expect(nextUp(rows, ['spk'], '2026-05-02T08:00:00Z')?.matchId).toBe('m4');
  });

  it('passes over a scheduled match whose slot has already ended', () => {
    // Nobody entered the 09:00 result yet, but at 10:00 it is not what this
    // team is walking to.
    const day = scheduleRows({
      matches: [match('a', 't09', 'c1', 'x', 'y'), match('b', 't13', 'c1', 'x', 'z')],
      timeslots,
      courts,
      names,
    });
    expect(nextUp(day, ['x'], '2026-05-02T10:00:00Z')?.matchId).toBe('b');
  });

  it('still offers a delayed match after its slot has passed', () => {
    // m4 at 12:00 is "delayed" and still to be played; m3 at 13:00 is next
    // after it. Past 12:45 m4's slot is over but the match is not — a delayed
    // match is still the next thing this team has to be at.
    expect(nextUp(rows, ['spk'], '2026-05-02T12:50:00Z')?.matchId).toBe('m4');
    expect(nextUp(rows, ['blk'], '2026-05-02T09:50:00Z')?.matchId).toBe('m4');
  });

  it('is null when there is nothing left', () => {
    expect(nextUp(rows, ['nobody'], '2026-05-02T08:00:00Z')).toBeNull();
  });

  it('never offers a cancelled match as next', () => {
    const cancelled = scheduleRows({
      matches: [match('x', 't09', 'c1', 'spk', 'blk', 'cancelled')],
      timeslots,
      courts,
      names,
    });
    expect(nextUp(cancelled, ['spk'], '2026-05-02T08:00:00Z')).toBeNull();
  });
});
