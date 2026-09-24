/**
 * Specification for `src/lib/manage/dropin.ts`.
 *
 * This is the module a host uses standing at a door with a phone in one hand.
 * Everything in it is a pure `stored -> stored` transform, so the properties
 * worth pinning are the ones a host would notice going wrong in the gym:
 *
 * - Who occupies a place. A no-show frees one; a waitlisted player never had
 *   one. Get that wrong and the room is either oversold or turning people
 *   away with courts half empty.
 * - The waitlist is strictly sign-up order, renumbered 1..n whenever it
 *   changes. It is the only order that is defensible at a door.
 * - A promoted player becomes `registered`, not `checked_in`. Being told a
 *   place opened up is not the same as walking through the door.
 * - The rotation is never stored. It is `generateDropInRotation` over
 *   whoever is checked in right now, rebuilt on every read, which is what
 *   makes one more check-in reflow the courts (rule 1).
 *
 * Every assertion describes behaviour the module already has.
 */

import { describe, expect, it } from 'vitest';
import {
  buildDropInView,
  checkInPlayer,
  createDropIn,
  type DropInSetup,
  markNoShow,
  occupiedCount,
  promoteWaitlist,
  removePlayer,
  resetToRegistered,
  signUpPlayer,
} from '@/lib/manage/dropin';
import type { StoredDropIn } from '@/lib/storage';
import { STORAGE_SCHEMA_VERSION } from '@/lib/storage';

const T0 = '2026-09-19T17:00:00.000Z';

function setup(overrides: Partial<DropInSetup> = {}): DropInSetup {
  return {
    name: 'Thursday Open Gym',
    playDate: '2026-09-24',
    startTime: '18:30',
    gameDurationMin: 20,
    bufferMin: 5,
    courtNames: ['Court 1', 'Court 2'],
    rounds: 4,
    capacity: 12,
    playersPerSide: 3,
    ...overrides,
  };
}

function night(overrides: Partial<DropInSetup> = {}): StoredDropIn {
  return createDropIn(setup(overrides), 'di-0001', T0);
}

/** Sign `count` players up in order, one minute apart. */
function withPlayers(stored: StoredDropIn, count: number, from = 1): StoredDropIn {
  let next = stored;
  for (let i = 0; i < count; i++) {
    const n = from + i;
    next = signUpPlayer(
      next,
      { id: `p${n}`, name: `Player ${n}` },
      `2026-09-24T18:${String(n).padStart(2, '0')}:00.000Z`,
    );
  }
  return next;
}

const statusOf = (stored: StoredDropIn, id: string) =>
  stored.attendance.find((e) => e.participantId === id)?.status;

const posOf = (stored: StoredDropIn, id: string) =>
  stored.attendance.find((e) => e.participantId === id)?.waitlistPos;

describe('createDropIn', () => {
  it('stamps the schema version and the caller-supplied id and clock', () => {
    const stored = createDropIn(setup(), 'di-0001', T0);

    expect(stored.id).toBe('di-0001');
    expect(stored.schemaVersion).toBe(STORAGE_SCHEMA_VERSION);
    expect(stored.createdAt).toBe(T0);
    expect(stored.updatedAt).toBe(T0);
  });

  it('opens with nobody signed up', () => {
    const stored = createDropIn(setup(), 'di-0001', T0);

    expect(stored.players).toEqual([]);
    expect(stored.attendance).toEqual([]);
  });

  it('takes the id and the timestamp from the caller rather than a clock', () => {
    expect(createDropIn(setup(), 'di-0001', T0)).toEqual(createDropIn(setup(), 'di-0001', T0));
  });

  it('does not mutate the setup it was given (rule 10)', () => {
    const input = setup();
    const before = structuredClone(input);
    createDropIn(input, 'di-0001', T0);

    expect(input).toEqual(before);
  });
});

describe('occupiedCount', () => {
  it('counts registered and checked-in players', () => {
    const stored = checkInPlayer(withPlayers(night(), 3), 'p1', T0);

    expect(occupiedCount(stored)).toBe(3);
  });

  it('does not count a no-show — their place is free again', () => {
    const stored = markNoShow(withPlayers(night(), 3), 'p2', T0);

    expect(occupiedCount(stored)).toBe(2);
  });

  it('does not count the waitlist — they never had a place', () => {
    const stored = withPlayers(night({ capacity: 2 }), 5);

    expect(occupiedCount(stored)).toBe(2);
  });
});

describe('signUpPlayer', () => {
  it('registers a player while there is room', () => {
    const stored = withPlayers(night({ capacity: 4 }), 2);

    expect(statusOf(stored, 'p1')).toBe('registered');
    expect(posOf(stored, 'p1')).toBeUndefined();
    expect(stored.players.map((p) => p.id)).toEqual(['p1', 'p2']);
  });

  it('waitlists past capacity, at the back, in sign-up order', () => {
    // The only fair order at a door: whoever asked first.
    const stored = withPlayers(night({ capacity: 2 }), 5);

    expect(statusOf(stored, 'p3')).toBe('waitlist');
    expect(posOf(stored, 'p3')).toBe(1);
    expect(posOf(stored, 'p4')).toBe(2);
    expect(posOf(stored, 'p5')).toBe(3);
  });

  it('gives a freed place to the next player at the door', () => {
    // Capacity two, both taken, one no-shows: the next arrival registers
    // rather than joining a waitlist behind an empty court.
    let stored = withPlayers(night({ capacity: 2 }), 2);
    stored = markNoShow(stored, 'p1', T0);
    stored = withPlayers(stored, 1, 3);

    expect(statusOf(stored, 'p3')).toBe('registered');
  });

  it('trims a name typed with stray spaces', () => {
    const stored = signUpPlayer(night(), { id: 'p1', name: '  Priya  ' }, T0);

    expect(stored.players[0]!.name).toBe('Priya');
  });

  it('records the sign-up time the caller passed', () => {
    const stored = signUpPlayer(night(), { id: 'p1', name: 'Priya' }, '2026-09-24T18:31:00.000Z');

    expect(stored.attendance[0]!.recordedAt).toBe('2026-09-24T18:31:00.000Z');
    expect(stored.updatedAt).toBe('2026-09-24T18:31:00.000Z');
  });

  it('does not mutate the night it was given (rule 10)', () => {
    const stored = withPlayers(night(), 2);
    const before = structuredClone(stored);
    signUpPlayer(stored, { id: 'p9', name: 'Late' }, T0);

    expect(stored).toEqual(before);
  });
});

describe('checkInPlayer, markNoShow, resetToRegistered', () => {
  it('checks a player in and stamps the time', () => {
    const stored = checkInPlayer(withPlayers(night(), 2), 'p1', '2026-09-24T18:40:00.000Z');

    expect(statusOf(stored, 'p1')).toBe('checked_in');
    expect(stored.attendance[0]!.recordedAt).toBe('2026-09-24T18:40:00.000Z');
  });

  it('lets the host check in a waitlisted player anyway', () => {
    // Documented as the host's call being final. Somebody left, somebody is
    // standing there, and the host is not going to argue with a number.
    const stored = checkInPlayer(withPlayers(night({ capacity: 2 }), 4), 'p4', T0);

    expect(statusOf(stored, 'p4')).toBe('checked_in');
  });

  it('drops the waitlist position when a waitlisted player leaves the waitlist', () => {
    const stored = checkInPlayer(withPlayers(night({ capacity: 2 }), 4), 'p3', T0);

    expect(posOf(stored, 'p3')).toBeUndefined();
  });

  it('renumbers the rest of the waitlist from one, keeping order', () => {
    let stored = withPlayers(night({ capacity: 2 }), 6);
    expect([
      posOf(stored, 'p3'),
      posOf(stored, 'p4'),
      posOf(stored, 'p5'),
      posOf(stored, 'p6'),
    ]).toEqual([1, 2, 3, 4]);

    stored = checkInPlayer(stored, 'p4', T0);

    expect(posOf(stored, 'p3')).toBe(1);
    expect(posOf(stored, 'p5')).toBe(2);
    expect(posOf(stored, 'p6')).toBe(3);
  });

  it('marks a no-show, freeing a place', () => {
    const stored = markNoShow(withPlayers(night({ capacity: 4 }), 4), 'p2', T0);

    expect(statusOf(stored, 'p2')).toBe('no_show');
    expect(buildDropInView(stored).counts.openings).toBe(1);
  });

  it('undoes a check-in or a no-show', () => {
    const checked = checkInPlayer(withPlayers(night(), 2), 'p1', T0);
    expect(statusOf(resetToRegistered(checked, 'p1', T0), 'p1')).toBe('registered');

    const missed = markNoShow(withPlayers(night(), 2), 'p1', T0);
    expect(statusOf(resetToRegistered(missed, 'p1', T0), 'p1')).toBe('registered');
  });

  it('leaves an unknown player id as a no-op on the roster', () => {
    const stored = withPlayers(night(), 2);
    const after = checkInPlayer(stored, 'nobody', T0);

    expect(after.attendance).toEqual(stored.attendance);
    expect(after.players).toEqual(stored.players);
  });

  it('does not mutate the night it was given (rule 10)', () => {
    const stored = withPlayers(night(), 3);
    const before = structuredClone(stored);
    checkInPlayer(stored, 'p1', T0);
    markNoShow(stored, 'p2', T0);
    resetToRegistered(stored, 'p3', T0);

    expect(stored).toEqual(before);
  });
});

describe('removePlayer', () => {
  it('takes a player off the roster and out of attendance', () => {
    const stored = removePlayer(withPlayers(night(), 3), 'p2', T0);

    expect(stored.players.map((p) => p.id)).toEqual(['p1', 'p3']);
    expect(stored.attendance.map((e) => e.participantId)).toEqual(['p1', 'p3']);
  });

  it('closes the gap in the waitlist it leaves behind', () => {
    const stored = removePlayer(withPlayers(night({ capacity: 2 }), 5), 'p4', T0);

    expect(posOf(stored, 'p3')).toBe(1);
    expect(posOf(stored, 'p5')).toBe(2);
  });

  it('does not mutate the night it was given (rule 10)', () => {
    const stored = withPlayers(night(), 3);
    const before = structuredClone(stored);
    removePlayer(stored, 'p2', T0);

    expect(stored).toEqual(before);
  });
});

describe('promoteWaitlist', () => {
  it('fills a freed place from the front of the waitlist', () => {
    let stored = withPlayers(night({ capacity: 2 }), 4);
    stored = markNoShow(stored, 'p1', T0);

    const { stored: after, promoted } = promoteWaitlist(stored, T0);

    expect(promoted).toHaveLength(1);
    expect(promoted[0]!.participantId).toBe('p3');
    expect(statusOf(after, 'p3')).toBe('registered');
    expect(statusOf(after, 'p4')).toBe('waitlist');
    expect(posOf(after, 'p4')).toBe(1);
  });

  it('promotes to registered, never straight to checked in', () => {
    // Being told a place opened up is not the same as walking through the
    // door. A host still has to see them to check them in.
    let stored = withPlayers(night({ capacity: 2 }), 3);
    stored = markNoShow(stored, 'p1', T0);

    const { stored: after } = promoteWaitlist(stored, T0);
    expect(statusOf(after, 'p3')).toBe('registered');
  });

  it('promotes only as many as there are places', () => {
    let stored = withPlayers(night({ capacity: 3 }), 8);
    stored = markNoShow(stored, 'p1', T0);
    stored = markNoShow(stored, 'p2', T0);

    const { promoted, stored: after } = promoteWaitlist(stored, T0);

    expect(promoted.map((p) => p.participantId)).toEqual(['p4', 'p5']);
    expect(occupiedCount(after)).toBe(3);
  });

  it('is a no-op when the session is full, and hands the record back unchanged', () => {
    const stored = withPlayers(night({ capacity: 2 }), 4);
    const { stored: after, promoted } = promoteWaitlist(stored, T0);

    expect(promoted).toEqual([]);
    // Same reference: nothing happened, so nothing was rewritten — including
    // `updatedAt`, which would otherwise make an idle poll look like an edit.
    expect(after).toBe(stored);
  });

  it('is a no-op when nobody is waiting', () => {
    const stored = markNoShow(withPlayers(night({ capacity: 4 }), 2), 'p1', T0);
    const { promoted, stored: after } = promoteWaitlist(stored, T0);

    expect(promoted).toEqual([]);
    expect(after).toBe(stored);
  });

  it('does not mutate the night it was given (rule 10)', () => {
    let stored = withPlayers(night({ capacity: 2 }), 4);
    stored = markNoShow(stored, 'p1', T0);
    const before = structuredClone(stored);
    promoteWaitlist(stored, T0);

    expect(stored).toEqual(before);
  });
});

describe('buildDropInView — the night', () => {
  it('derives the slug from the record id, not the name', () => {
    const renamed: StoredDropIn = { ...night(), name: 'Renamed Session' };

    expect(buildDropInView(night()).slug).toBe(buildDropInView(renamed).slug);
  });

  it('builds one session ending a full rotation after it starts', () => {
    // 4 rounds of 20 + 5 = 100 minutes from 18:30.
    const view = buildDropInView(night({ rounds: 4, gameDurationMin: 20, bufferMin: 5 }));

    expect(view.session.startTime).toBe('18:30');
    expect(view.session.endTime).toBe('20:10');
    expect(view.session.sequence).toBe(1);
  });

  it('builds one timeslot per round', () => {
    expect(buildDropInView(night({ rounds: 6 })).timeslots).toHaveLength(6);
  });

  it('names courts, falling back for a blank name', () => {
    const view = buildDropInView(night({ courtNames: ['Near', '   '] }));

    expect(view.courts.map((c) => c.name)).toEqual(['Near', 'Court 2']);
  });

  it('makes participants individuals, not teams', () => {
    // The reason `Participant` is not called `Team`: at a drop-in the
    // participant is a person.
    const view = buildDropInView(withPlayers(night(), 3));

    expect(view.participants.every((p) => p.kind === 'individual')).toBe(true);
    expect(view.nameOf).toEqual({ p1: 'Player 1', p2: 'Player 2', p3: 'Player 3' });
  });
});

describe('buildDropInView — the counts', () => {
  it('reports the door at a glance', () => {
    let stored = withPlayers(night({ capacity: 4 }), 6);
    stored = checkInPlayer(stored, 'p1', T0);
    stored = checkInPlayer(stored, 'p2', T0);
    stored = markNoShow(stored, 'p3', T0);

    expect(buildDropInView(stored).counts).toEqual({
      signedUp: 6,
      checkedIn: 2,
      registered: 1,
      waitlisted: 2,
      noShows: 1,
      openings: 1,
    });
  });

  it('never reports negative openings', () => {
    // A host may check in more people than capacity; the number of places
    // left is zero, not minus two.
    let stored = withPlayers(night({ capacity: 2 }), 4);
    stored = checkInPlayer(stored, 'p3', T0);
    stored = checkInPlayer(stored, 'p4', T0);

    expect(buildDropInView(stored).counts.openings).toBe(0);
  });
});

describe('buildDropInView — the rotation', () => {
  it('rebuilds the rotation from whoever is checked in, and never stores it', () => {
    // Rule 1 in its drop-in form: one more check-in reflows the courts,
    // because there is nothing saved to go stale.
    let stored = withPlayers(night({ playersPerSide: 2, courtNames: ['A'] }), 6);
    for (const id of ['p1', 'p2', 'p3', 'p4']) stored = checkInPlayer(stored, id, T0);

    const before = buildDropInView(stored).rotation;
    const after = buildDropInView(checkInPlayer(stored, 'p5', T0)).rotation;

    expect(before).not.toEqual(after);
    expect(stored).not.toHaveProperty('rotation');
  });

  it('puts the players on `sides`, not on the match itself', () => {
    // Discovered writing this suite, and worth stating: a drop-in side holds
    // several people, so `Match.homeParticipantId` cannot be where the roster
    // lives. Reading the players off the match gives you nothing — `sides`,
    // keyed by match id, is the only place they are.
    let stored = withPlayers(night({ playersPerSide: 2, courtNames: ['A'] }), 4);
    for (const id of ['p1', 'p2', 'p3', 'p4']) stored = checkInPlayer(stored, id, T0);

    const { rotation } = buildDropInView(stored);
    expect(rotation.matches.length).toBeGreaterThan(0);
    expect(rotation.sides).toHaveLength(rotation.matches.length);

    const first = rotation.sides[0]!;
    expect(first.matchId).toBe(rotation.matches[0]!.id);
    expect(first.home.participantIds).toHaveLength(2);
    expect(first.away.participantIds).toHaveLength(2);
  });

  it('leaves registered and waitlisted players out of the rotation', () => {
    // Only the people in the gym get a court.
    let stored = withPlayers(night({ playersPerSide: 2, courtNames: ['A'] }), 8);
    for (const id of ['p1', 'p2', 'p3', 'p4']) stored = checkInPlayer(stored, id, T0);

    const view = buildDropInView(stored);
    const playing = new Set(
      view.rotation.sides.flatMap((s) => [...s.home.participantIds, ...s.away.participantIds]),
    );

    // Guard the assertions below against passing on an empty rotation.
    expect(view.rotation.sides.length).toBeGreaterThan(0);
    for (const id of ['p1', 'p2', 'p3', 'p4']) expect(playing.has(id)).toBe(true);
    expect(playing.has('p5')).toBe(false);
    expect(playing.has('p8')).toBe(false);
  });

  it('counts a sit-out round for every checked-in player, starting at zero', () => {
    // Fair rotation is the drop-in host's whole job, so the view hands them
    // the number rather than making them count rows. Everyone checked in has
    // an entry even if they never sit.
    let stored = withPlayers(night({ playersPerSide: 2, courtNames: ['A'], rounds: 3 }), 5);
    for (const id of ['p1', 'p2', 'p3', 'p4', 'p5']) stored = checkInPlayer(stored, id, T0);

    const { sitOutCounts } = buildDropInView(stored);

    expect(Object.keys(sitOutCounts).sort()).toEqual(['p1', 'p2', 'p3', 'p4', 'p5']);
    // One court of four players and five checked in: exactly one sits each
    // round, and over three rounds that is three sit-outs spread around.
    expect(Object.values(sitOutCounts).reduce((a, b) => a + b, 0)).toBe(3);
    expect(Math.max(...Object.values(sitOutCounts))).toBeLessThanOrEqual(1);
  });

  it('gives a player nobody has sat out a count of zero, not a missing key', () => {
    let stored = withPlayers(night({ playersPerSide: 2, courtNames: ['A'] }), 4);
    for (const id of ['p1', 'p2', 'p3', 'p4']) stored = checkInPlayer(stored, id, T0);

    expect(buildDropInView(stored).sitOutCounts).toEqual({ p1: 0, p2: 0, p3: 0, p4: 0 });
  });
});

describe('buildDropInView — purity', () => {
  it('is deterministic: the same stored night builds an identical view (rule 9)', () => {
    let stored = withPlayers(night(), 7);
    stored = checkInPlayer(stored, 'p1', T0);

    expect(buildDropInView(stored)).toEqual(buildDropInView(stored));
  });

  it('does not mutate the stored night it reads (rule 10)', () => {
    const stored = checkInPlayer(withPlayers(night(), 5), 'p1', T0);
    const before = structuredClone(stored);
    buildDropInView(stored);

    expect(stored).toEqual(before);
  });

  it('hands back the stored record it was given', () => {
    const stored = night();
    expect(buildDropInView(stored).stored).toBe(stored);
  });
});
