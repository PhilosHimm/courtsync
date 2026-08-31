/**
 * Specification for `suggestSlots` — the other half of the conflict screen.
 *
 * `auditSchedule` reports what is wrong and stops. This says where the match
 * could go instead, which is what the organizer standing at the scorer's
 * table at 8:52 actually needs.
 *
 * The contract that matters most: **a suggestion must never create a
 * blocking conflict.** The last test in this file enforces exactly that by
 * applying every suggestion and re-auditing — if the two functions ever
 * disagree about what "free" means, it fails here rather than putting two
 * teams on one court.
 */

import { describe, expect, it } from 'vitest';
import type { Court, Match, Timeslot } from '@/lib/core';
import { auditSchedule } from '@/lib/scheduling/schedule-audit';
import { suggestSlots } from '@/lib/scheduling/slot-suggestions';

const T = (clock: string): string => `2026-09-19T${clock}:00Z`;

function slots(count: number, sessionId = 'sess-1'): Timeslot[] {
  return Array.from({ length: count }, (_, i) => {
    const startMin = 9 * 60 + i * 45;
    const pad = (n: number) => String(n).padStart(2, '0');
    const clock = (m: number) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
    return {
      id: `${sessionId}-ts-${i + 1}`,
      sessionId,
      startAt: T(clock(startMin)),
      endAt: T(clock(startMin + 45)),
    };
  });
}

const courts: Court[] = [
  { id: 'court-1', competitionId: 'comp-1', name: 'Court 1', isActive: true },
  { id: 'court-2', competitionId: 'comp-1', name: 'Court 2', isActive: true },
];

function match(
  id: string,
  home: string | null,
  away: string | null,
  placement: {
    courtId?: string | null;
    timeslotId?: string | null;
    refId?: string | null;
    sessionId?: string;
  } = {},
): Match {
  return {
    id,
    competitionId: 'comp-1',
    sessionId: placement.sessionId ?? 'sess-1',
    poolId: 'pool-a',
    courtId: placement.courtId ?? null,
    timeslotId: placement.timeslotId ?? null,
    homeParticipantId: home,
    awayParticipantId: away,
    refParticipantId: placement.refId ?? null,
    bracket: null,
    roundLabel: 'Pool Play',
    status: 'scheduled',
    sets: [],
  };
}

describe('suggestSlots', () => {
  it('offers every free court and slot on an empty grid', () => {
    const suggestions = suggestSlots({
      matchId: 'm1',
      matches: [match('m1', 'p1', 'p2')],
      timeslots: slots(2),
      courts,
    });
    // 2 slots x 2 courts, and the match is not placed anywhere yet.
    expect(suggestions).toHaveLength(4);
    expect(suggestions.every((s) => s.respectsRest)).toBe(true);
  });

  it('excludes a court already busy at that time', () => {
    const suggestions = suggestSlots({
      matchId: 'm1',
      matches: [
        match('m1', 'p1', 'p2'),
        match('m2', 'p3', 'p4', { courtId: 'court-1', timeslotId: 'sess-1-ts-1' }),
      ],
      timeslots: slots(2),
      courts,
    });
    expect(suggestions.some((s) => s.courtId === 'court-1' && s.timeslotId === 'sess-1-ts-1')).toBe(
      false,
    );
    expect(suggestions).toHaveLength(3);
  });

  it('excludes a slot where either side is already playing', () => {
    const suggestions = suggestSlots({
      matchId: 'm1',
      matches: [
        match('m1', 'p1', 'p2'),
        match('m2', 'p2', 'p3', { courtId: 'court-2', timeslotId: 'sess-1-ts-1' }),
      ],
      timeslots: slots(2),
      courts,
    });
    // p2 is busy in ts-1, so neither court works in that slot.
    expect(suggestions.every((s) => s.timeslotId === 'sess-1-ts-2')).toBe(true);
    expect(suggestions).toHaveLength(2);
  });

  it('counts refereeing as busy, both ways', () => {
    // The match being moved has a referee, and that referee is reffing
    // elsewhere in ts-1. assignReferees guarantees a referee is never on two
    // courts at once; a suggestion must not be the thing that breaks it.
    const suggestions = suggestSlots({
      matchId: 'm1',
      matches: [
        match('m1', 'p1', 'p2', { refId: 'p5' }),
        match('m2', 'p3', 'p4', { courtId: 'court-2', timeslotId: 'sess-1-ts-1', refId: 'p5' }),
      ],
      timeslots: slots(2),
      courts,
    });
    expect(suggestions.every((s) => s.timeslotId === 'sess-1-ts-2')).toBe(true);
  });

  it('never suggests the placement the match already has', () => {
    const suggestions = suggestSlots({
      matchId: 'm1',
      matches: [match('m1', 'p1', 'p2', { courtId: 'court-1', timeslotId: 'sess-1-ts-1' })],
      timeslots: slots(2),
      courts,
    });
    expect(suggestions.some((s) => s.courtId === 'court-1' && s.timeslotId === 'sess-1-ts-1')).toBe(
      false,
    );
    expect(suggestions).toHaveLength(3);
  });

  it('does not treat the moving match as blocking its own move', () => {
    // m1 currently sits on court-1/ts-1. Court 2 in that same slot must still
    // be offered — the match is vacating its old spot, not competing with it.
    const suggestions = suggestSlots({
      matchId: 'm1',
      matches: [match('m1', 'p1', 'p2', { courtId: 'court-1', timeslotId: 'sess-1-ts-1' })],
      timeslots: slots(2),
      courts,
    });
    expect(suggestions.some((s) => s.courtId === 'court-2' && s.timeslotId === 'sess-1-ts-1')).toBe(
      true,
    );
  });

  it('stays inside the match’s own session', () => {
    // A league week has its own independent grid. Moving week 3's match into
    // week 4 is not a reschedule, it is a different fixture list.
    const suggestions = suggestSlots({
      matchId: 'm1',
      matches: [match('m1', 'p1', 'p2', { sessionId: 'sess-wk-1' })],
      timeslots: [...slots(2, 'sess-wk-1'), ...slots(2, 'sess-wk-2')],
      courts,
    });
    expect(suggestions.every((s) => s.timeslotId.startsWith('sess-wk-1'))).toBe(true);
    expect(suggestions).toHaveLength(4);
  });

  it('flags short rest rather than withholding the slot', () => {
    // p1 plays ts-1. Moving m2 into ts-2 gives them no rest — playable, and
    // the audit calls it a warning, so it is offered with the flag down.
    const suggestions = suggestSlots({
      matchId: 'm2',
      matches: [
        match('m1', 'p1', 'p3', { courtId: 'court-1', timeslotId: 'sess-1-ts-1' }),
        match('m2', 'p1', 'p4'),
      ],
      timeslots: slots(3),
      courts,
      minRestSlots: 1,
    });

    const tight = suggestions.filter((s) => s.timeslotId === 'sess-1-ts-2');
    expect(tight.length).toBeGreaterThan(0);
    expect(tight.every((s) => s.respectsRest === false)).toBe(true);
    expect(tight.every((s) => s.restSlots === 0)).toBe(true);

    const roomy = suggestions.filter((s) => s.timeslotId === 'sess-1-ts-3');
    expect(roomy.every((s) => s.respectsRest === true)).toBe(true);
  });

  it('puts rest-respecting placements first, then chronological, then court', () => {
    const suggestions = suggestSlots({
      matchId: 'm2',
      matches: [
        match('m1', 'p1', 'p3', { courtId: 'court-1', timeslotId: 'sess-1-ts-1' }),
        match('m2', 'p1', 'p4'),
      ],
      timeslots: slots(3),
      courts,
      minRestSlots: 1,
    });

    const firstBad = suggestions.findIndex((s) => !s.respectsRest);
    const lastGood = suggestions.map((s) => s.respectsRest).lastIndexOf(true);
    expect(lastGood).toBeLessThan(firstBad);

    const good = suggestions.filter((s) => s.respectsRest);
    expect(good.map((s) => `${s.timeslotId}/${s.courtId}`)).toEqual([
      'sess-1-ts-3/court-1',
      'sess-1-ts-3/court-2',
    ]);
  });

  it('omits restSlots entirely when no rest was requested', () => {
    const suggestions = suggestSlots({
      matchId: 'm1',
      matches: [match('m1', 'p1', 'p2')],
      timeslots: slots(1),
      courts,
    });
    expect(suggestions.every((s) => s.restSlots === undefined)).toBe(true);
    expect(suggestions.every((s) => s.respectsRest)).toBe(true);
  });

  it('skips inactive courts', () => {
    const suggestions = suggestSlots({
      matchId: 'm1',
      matches: [match('m1', 'p1', 'p2')],
      timeslots: slots(1),
      courts: [courts[0]!, { ...courts[1]!, isActive: false }],
    });
    expect(suggestions.map((s) => s.courtId)).toEqual(['court-1']);
  });

  it('a bracket match with no teams yet is limited only by court availability', () => {
    // A semifinal seeded before its quarterfinals are played has null sides.
    // Nobody is double-booked by a slot with nobody in it.
    const suggestions = suggestSlots({
      matchId: 'semi-1',
      matches: [
        match('semi-1', null, null),
        match('m2', 'p1', 'p2', { courtId: 'court-1', timeslotId: 'sess-1-ts-1' }),
      ],
      timeslots: slots(1),
      courts,
    });
    expect(suggestions.map((s) => s.courtId)).toEqual(['court-2']);
  });

  it('returns nothing when the grid is full rather than raising', () => {
    const suggestions = suggestSlots({
      matchId: 'm1',
      matches: [
        match('m1', 'p1', 'p2'),
        match('m2', 'p3', 'p4', { courtId: 'court-1', timeslotId: 'sess-1-ts-1' }),
        match('m3', 'p5', 'p6', { courtId: 'court-2', timeslotId: 'sess-1-ts-1' }),
      ],
      timeslots: slots(1),
      courts,
    });
    expect(suggestions).toEqual([]);
  });

  it('raises when the match is not on the grid it was given', () => {
    // A caller bug, not an organizer problem: there is no honest empty answer.
    expect(() =>
      suggestSlots({
        matchId: 'nope',
        matches: [match('m1', 'p1', 'p2')],
        timeslots: slots(1),
        courts,
      }),
    ).toThrow(/nope/);
  });

  it('is deterministic and leaves its input alone', () => {
    const input = {
      matchId: 'm2',
      matches: [
        match('m1', 'p1', 'p3', { courtId: 'court-1', timeslotId: 'sess-1-ts-1' }),
        match('m2', 'p1', 'p4'),
      ],
      timeslots: slots(3),
      courts,
      minRestSlots: 1,
    };
    const before = structuredClone(input);
    expect(suggestSlots(input)).toEqual(suggestSlots(input));
    expect(input).toEqual(before);
  });

  it('every suggestion survives the audit that produced the conflict', () => {
    // The contract. suggestSlots decides what "free" means and auditSchedule
    // decides what "conflict" means, and nothing structural keeps the two
    // agreeing — so apply each suggestion and re-audit. A blocking conflict
    // here would mean the app confidently offered a placement that puts two
    // teams on one court.
    const timeslots = slots(4);
    const others = [
      match('m2', 'p3', 'p4', { courtId: 'court-1', timeslotId: 'sess-1-ts-1' }),
      match('m3', 'p2', 'p5', { courtId: 'court-2', timeslotId: 'sess-1-ts-2', refId: 'p6' }),
      match('m4', 'p6', 'p7', { courtId: 'court-1', timeslotId: 'sess-1-ts-3' }),
    ];
    const moving = match('m1', 'p1', 'p2', { refId: 'p6' });
    const matches = [moving, ...others];

    const suggestions = suggestSlots({ matchId: 'm1', matches, timeslots, courts });
    expect(suggestions.length).toBeGreaterThan(0);

    for (const suggestion of suggestions) {
      const applied = matches.map((m) =>
        m.id === 'm1'
          ? { ...m, courtId: suggestion.courtId, timeslotId: suggestion.timeslotId }
          : m,
      );
      const blocking = auditSchedule({ matches: applied, timeslots }).filter(
        (c) => c.severity === 'blocking',
      );
      expect(blocking, `${suggestion.timeslotId}/${suggestion.courtId} is not free`).toEqual([]);
    }
  });
});
