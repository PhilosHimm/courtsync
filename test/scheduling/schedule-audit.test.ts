/**
 * Specification for `auditSchedule` — re-validation of a schedule after the
 * organizer has moved matches by hand.
 *
 * The generators are conflict-free by construction, and nothing else was:
 * once a match is dragged to a new slot, the invariants the generator
 * guaranteed (one match per court per slot, nobody in two places at once —
 * the property `generatePoolPlay` refuses double-entered participants to
 * protect, and the guarantee `assignReferees` makes about referees) are
 * nobody's job to re-check. This function is that job.
 *
 * Severity is part of the specification. Physically impossible schedules
 * (court or participant in two places at once) are `blocking`; playable but
 * wrong ones (a match off the grid, a team playing back-to-back against the
 * rest request) are `warning`. A publish flow gates on the first without
 * nagging about the second.
 */

import { describe, expect, it } from 'vitest';
import type { Match, Timeslot } from '@/lib/core';
import { generatePoolPlay } from '@/lib/scheduling/pool-play';
import { auditSchedule } from '@/lib/scheduling/schedule-audit';

/** An absolute timestamp on a fixed date. Never a display label (C4). */
const T = (clock: string): string => `2026-09-19T${clock}:00Z`;

/** 45-minute slots on one session, back to back from 09:00. */
function slots(count: number, sessionId = 'sess-1', startHour = 9): Timeslot[] {
  return Array.from({ length: count }, (_, i) => {
    const startMin = startHour * 60 + i * 45;
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

function match(
  id: string,
  home: string | null,
  away: string | null,
  placement: { courtId?: string | null; timeslotId?: string | null; refId?: string | null } = {},
): Match {
  return {
    id,
    competitionId: 'comp-1',
    sessionId: 'sess-1',
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

describe('auditSchedule', () => {
  it('a generated schedule audits clean', () => {
    const generated = generatePoolPlay({
      competitionSlug: 'spring-open',
      sessionId: 'sess-1',
      pools: [
        { id: 'pool-a', name: 'A', participantIds: ['p1', 'p2', 'p3', 'p4'] },
        { id: 'pool-b', name: 'B', participantIds: ['p5', 'p6', 'p7', 'p8'] },
      ],
      courtIds: ['court-1', 'court-2'],
      timeslotIds: slots(8).map((s) => s.id),
    });
    expect(generated.unassigned).toEqual([]);
    expect(auditSchedule({ matches: generated.matches, timeslots: slots(8) })).toEqual([]);
  });

  it('reports two matches on one court in the same slot as blocking', () => {
    const conflicts = auditSchedule({
      matches: [
        match('m1', 'p1', 'p2', { courtId: 'court-1', timeslotId: 'sess-1-ts-1' }),
        match('m2', 'p3', 'p4', { courtId: 'court-1', timeslotId: 'sess-1-ts-1' }),
      ],
      timeslots: slots(2),
    });
    expect(conflicts).toEqual([
      {
        kind: 'court-double-booked',
        severity: 'blocking',
        courtId: 'court-1',
        matchIds: ['m1', 'm2'],
        timeslotIds: ['sess-1-ts-1', 'sess-1-ts-1'],
      },
    ]);
  });

  it('catches a court booked across two distinct but overlapping slots', () => {
    // Overlap is measured on the timestamps, not on slot identity: sessions
    // can carry irregular grids, and two slots that share wall-clock time are
    // the same court-minutes even though their ids differ.
    const overlapping: Timeslot[] = [
      { id: 'ts-a', sessionId: 'sess-1', startAt: T('09:00'), endAt: T('10:00') },
      { id: 'ts-b', sessionId: 'sess-1', startAt: T('09:30'), endAt: T('10:30') },
    ];
    const conflicts = auditSchedule({
      matches: [
        match('m1', 'p1', 'p2', { courtId: 'court-1', timeslotId: 'ts-a' }),
        match('m2', 'p3', 'p4', { courtId: 'court-1', timeslotId: 'ts-b' }),
      ],
      timeslots: overlapping,
    });
    expect(conflicts.map((c) => c.kind)).toEqual(['court-double-booked']);
  });

  it('back-to-back slots that touch do not overlap', () => {
    // ts-1 ends at the instant ts-2 starts. That is a turnaround, not a
    // collision — flagging it would put a false conflict between every
    // consecutive pair on the grid.
    const conflicts = auditSchedule({
      matches: [
        match('m1', 'p1', 'p2', { courtId: 'court-1', timeslotId: 'sess-1-ts-1' }),
        match('m2', 'p3', 'p4', { courtId: 'court-1', timeslotId: 'sess-1-ts-2' }),
      ],
      timeslots: slots(2),
    });
    expect(conflicts).toEqual([]);
  });

  it('reports a participant playing on two courts at once as blocking', () => {
    const conflicts = auditSchedule({
      matches: [
        match('m1', 'p1', 'p2', { courtId: 'court-1', timeslotId: 'sess-1-ts-1' }),
        match('m2', 'p1', 'p3', { courtId: 'court-2', timeslotId: 'sess-1-ts-1' }),
      ],
      timeslots: slots(1),
    });
    expect(conflicts).toEqual([
      {
        kind: 'participant-double-booked',
        severity: 'blocking',
        participantId: 'p1',
        matchIds: ['m1', 'm2'],
        timeslotIds: ['sess-1-ts-1', 'sess-1-ts-1'],
      },
    ]);
  });

  it('counts refereeing as being somewhere', () => {
    // assignReferees guarantees a referee never works two courts at once and
    // never refs a match they play in. A manual move can break both silently;
    // the audit is where that surfaces.
    const conflicts = auditSchedule({
      matches: [
        match('m1', 'p1', 'p2', { courtId: 'court-1', timeslotId: 'sess-1-ts-1' }),
        match('m2', 'p3', 'p4', { courtId: 'court-2', timeslotId: 'sess-1-ts-1', refId: 'p1' }),
      ],
      timeslots: slots(1),
    });
    expect(conflicts).toEqual([
      {
        kind: 'participant-double-booked',
        severity: 'blocking',
        participantId: 'p1',
        matchIds: ['m1', 'm2'],
        timeslotIds: ['sess-1-ts-1', 'sess-1-ts-1'],
      },
    ]);
  });

  it('one collision produces one conflict per shared participant', () => {
    // Both teams of m1 are also both teams of m2. That is two people-shaped
    // problems, not one, and each names the participant it is about.
    const conflicts = auditSchedule({
      matches: [
        match('m1', 'p1', 'p2', { courtId: 'court-1', timeslotId: 'sess-1-ts-1' }),
        match('m2', 'p1', 'p2', { courtId: 'court-2', timeslotId: 'sess-1-ts-1' }),
      ],
      timeslots: slots(1),
    });
    expect(conflicts.map((c) => c.kind === 'participant-double-booked' && c.participantId)).toEqual(
      ['p1', 'p2'],
    );
  });

  it('a court collision that also shares a team reports both conflicts', () => {
    const conflicts = auditSchedule({
      matches: [
        match('m1', 'p1', 'p2', { courtId: 'court-1', timeslotId: 'sess-1-ts-1' }),
        match('m2', 'p1', 'p3', { courtId: 'court-1', timeslotId: 'sess-1-ts-1' }),
      ],
      timeslots: slots(1),
    });
    expect(conflicts.map((c) => c.kind)).toEqual([
      'court-double-booked',
      'participant-double-booked',
    ]);
  });

  it('the same two teams meeting twice at different times is not a conflict', () => {
    // A double round-robin plays every pairing twice. Sharing participants
    // only matters when the matches share time.
    const conflicts = auditSchedule({
      matches: [
        match('m1', 'p1', 'p2', { courtId: 'court-1', timeslotId: 'sess-1-ts-1' }),
        match('m2', 'p1', 'p2', { courtId: 'court-1', timeslotId: 'sess-1-ts-3' }),
      ],
      timeslots: slots(3),
    });
    expect(conflicts).toEqual([]);
  });

  it('a match with no court or no slot is a warning, not blocking', () => {
    const conflicts = auditSchedule({
      matches: [
        match('m1', 'p1', 'p2', { timeslotId: 'sess-1-ts-1' }),
        match('m2', 'p3', 'p4', { courtId: 'court-1' }),
      ],
      timeslots: slots(1),
    });
    expect(conflicts).toEqual([
      { kind: 'unplaced-match', severity: 'warning', matchId: 'm1' },
      { kind: 'unplaced-match', severity: 'warning', matchId: 'm2' },
    ]);
  });

  it('a freshly seeded bracket match — no sides, no slot — is only unplaced', () => {
    // Semifinals exist before their participants are known. Null sides must
    // not read as a shared participant, and the unplaced warning is the whole
    // story.
    const semis = [match('semi-1', null, null), match('semi-2', null, null)];
    const conflicts = auditSchedule({ matches: semis, timeslots: slots(1) });
    expect(conflicts).toEqual([
      { kind: 'unplaced-match', severity: 'warning', matchId: 'semi-1' },
      { kind: 'unplaced-match', severity: 'warning', matchId: 'semi-2' },
    ]);
  });

  it('flags a participant playing again without the requested rest', () => {
    const conflicts = auditSchedule({
      matches: [
        match('m1', 'p1', 'p2', { courtId: 'court-1', timeslotId: 'sess-1-ts-1' }),
        match('m2', 'p1', 'p3', { courtId: 'court-1', timeslotId: 'sess-1-ts-2' }),
      ],
      timeslots: slots(2),
      minRestSlots: 1,
    });
    expect(conflicts).toEqual([
      {
        kind: 'insufficient-rest',
        severity: 'warning',
        participantId: 'p1',
        matchIds: ['m1', 'm2'],
        restSlots: 0,
      },
    ]);
  });

  it('rest counts empty slots between appearances, on the session grid', () => {
    // Slots 1 and 3 leave one empty slot between them — exactly the rest
    // minRestSlots: 1 asks for, and the same arithmetic generatePoolPlay
    // uses when it leaves gaps between rounds.
    const conflicts = auditSchedule({
      matches: [
        match('m1', 'p1', 'p2', { courtId: 'court-1', timeslotId: 'sess-1-ts-1' }),
        match('m2', 'p1', 'p3', { courtId: 'court-1', timeslotId: 'sess-1-ts-3' }),
      ],
      timeslots: slots(3),
      minRestSlots: 1,
    });
    expect(conflicts).toEqual([]);
  });

  it('rest is measured between consecutive appearances only', () => {
    // Three matches in a row is two violations — one per back-to-back pair —
    // not three for every pairing.
    const conflicts = auditSchedule({
      matches: [
        match('m1', 'p1', 'p2', { courtId: 'court-1', timeslotId: 'sess-1-ts-1' }),
        match('m2', 'p1', 'p3', { courtId: 'court-1', timeslotId: 'sess-1-ts-2' }),
        match('m3', 'p1', 'p4', { courtId: 'court-1', timeslotId: 'sess-1-ts-3' }),
      ],
      timeslots: slots(3),
      minRestSlots: 1,
    });
    expect(conflicts).toEqual([
      {
        kind: 'insufficient-rest',
        severity: 'warning',
        participantId: 'p1',
        matchIds: ['m1', 'm2'],
        restSlots: 0,
      },
      {
        kind: 'insufficient-rest',
        severity: 'warning',
        participantId: 'p1',
        matchIds: ['m2', 'm3'],
        restSlots: 0,
      },
    ]);
  });

  it('refereeing does not count as playing for rest', () => {
    // Sitting a team down to ref between its matches is the rest slot
    // working as intended, not a violation of it.
    const conflicts = auditSchedule({
      matches: [
        match('m1', 'p1', 'p2', { courtId: 'court-1', timeslotId: 'sess-1-ts-1' }),
        match('m2', 'p3', 'p4', { courtId: 'court-1', timeslotId: 'sess-1-ts-2', refId: 'p1' }),
        match('m3', 'p1', 'p5', { courtId: 'court-1', timeslotId: 'sess-1-ts-3' }),
      ],
      timeslots: slots(3),
      minRestSlots: 1,
    });
    expect(conflicts).toEqual([]);
  });

  it('rest never crosses sessions', () => {
    // A league team playing the last slot of week 1 and the first slot of
    // week 2 has had six days of rest, whatever the slot indexes say.
    const week1 = slots(2, 'sess-wk-1');
    const week2 = slots(2, 'sess-wk-2', 19).map((s) => ({
      ...s,
      startAt: s.startAt.replace('2026-09-19', '2026-09-26'),
      endAt: s.endAt.replace('2026-09-19', '2026-09-26'),
    }));
    const conflicts = auditSchedule({
      matches: [
        {
          ...match('m1', 'p1', 'p2', { courtId: 'court-1', timeslotId: 'sess-wk-1-ts-2' }),
          sessionId: 'sess-wk-1',
        },
        {
          ...match('m2', 'p1', 'p3', { courtId: 'court-1', timeslotId: 'sess-wk-2-ts-1' }),
          sessionId: 'sess-wk-2',
        },
      ],
      timeslots: [...week1, ...week2],
      minRestSlots: 2,
    });
    expect(conflicts).toEqual([]);
  });

  it('omitting minRestSlots disables the rest check', () => {
    const matches = [
      match('m1', 'p1', 'p2', { courtId: 'court-1', timeslotId: 'sess-1-ts-1' }),
      match('m2', 'p1', 'p3', { courtId: 'court-1', timeslotId: 'sess-1-ts-2' }),
    ];
    expect(auditSchedule({ matches, timeslots: slots(2) })).toEqual([]);
    expect(auditSchedule({ matches, timeslots: slots(2), minRestSlots: 0 })).toEqual([]);
  });

  it('a double-booked slot is not also an insufficient-rest violation', () => {
    // Zero slots apart is a collision, already reported as blocking. A rest
    // warning on top would be the same problem counted twice.
    const conflicts = auditSchedule({
      matches: [
        match('m1', 'p1', 'p2', { courtId: 'court-1', timeslotId: 'sess-1-ts-1' }),
        match('m2', 'p1', 'p3', { courtId: 'court-2', timeslotId: 'sess-1-ts-1' }),
      ],
      timeslots: slots(1),
      minRestSlots: 1,
    });
    expect(conflicts.map((c) => c.kind)).toEqual(['participant-double-booked']);
  });

  it('every blocking conflict precedes every warning', () => {
    const conflicts = auditSchedule({
      matches: [
        match('m1', 'p1', 'p2', { courtId: 'court-1', timeslotId: 'sess-1-ts-1' }),
        match('m2', 'p1', 'p3', { courtId: 'court-1', timeslotId: 'sess-1-ts-1' }),
        match('m3', 'p4', 'p5', {}),
        match('m4', 'p2', 'p6', { courtId: 'court-2', timeslotId: 'sess-1-ts-2' }),
      ],
      timeslots: slots(2),
      minRestSlots: 1,
    });
    const severities = conflicts.map((c) => c.severity);
    expect(severities.lastIndexOf('blocking')).toBeLessThan(severities.indexOf('warning'));
    expect(new Set(conflicts.map((c) => c.kind))).toEqual(
      new Set([
        'court-double-booked',
        'participant-double-booked',
        'unplaced-match',
        'insufficient-rest',
      ]),
    );
  });

  it('a match referencing a slot that does not exist raises', () => {
    // A dangling reference is a caller bug, not an organizer problem. It
    // cannot be fixed by moving a match, so it fails loudly instead of
    // surfacing as one more conflict row.
    expect(() =>
      auditSchedule({
        matches: [match('m1', 'p1', 'p2', { courtId: 'court-1', timeslotId: 'ts-nowhere' })],
        timeslots: slots(1),
      }),
    ).toThrow(/ts-nowhere/);
  });

  it('is deterministic: the same schedule audits identically every time', () => {
    const input = {
      matches: [
        match('m1', 'p1', 'p2', { courtId: 'court-1', timeslotId: 'sess-1-ts-1' }),
        match('m2', 'p1', 'p3', { courtId: 'court-1', timeslotId: 'sess-1-ts-1' }),
        match('m3', 'p4', 'p5', {}),
      ],
      timeslots: slots(2),
      minRestSlots: 1,
    };
    expect(auditSchedule(input)).toEqual(auditSchedule(input));
  });
});
