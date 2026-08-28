/**
 * Specification for the CSV exports — data portability for everything the
 * engine produces: the entry list, rosters, the grid, results, standings and
 * attendance.
 *
 * Three properties matter more than the column lists:
 *
 * - Timestamps export as the absolute ISO values they are stored as. An
 *   export that formatted "12:00 PM" would hand the C4 bug (a display string
 *   used as a sort key) straight to the organizer's spreadsheet.
 * - A dangling reference raises. A blank cell where a court name should be
 *   makes an incomplete export look complete.
 * - Everything is deterministic and pure — same rows in, same file out, and
 *   the rows come back untouched.
 */

import { describe, expect, it } from 'vitest';
import type {
  Attendance,
  Court,
  Match,
  Participant,
  Pool,
  Session,
  Standing,
  TeamPlayer,
  Timeslot,
} from '@/lib/core';
import {
  attendanceToCsv,
  participantsToCsv,
  resultsToCsv,
  rosterToCsv,
  scheduleToCsv,
  standingsToCsv,
  toCsv,
} from '@/lib/core';

const lines = (csv: string): string[] => csv.split('\r\n').filter((line) => line !== '');

function team(id: string, name: string, extra: Partial<Participant> = {}): Participant {
  return {
    id,
    competitionId: 'comp-1',
    kind: 'team',
    name,
    registeredAt: '2026-09-01T12:00:00Z',
    ...extra,
  };
}

function match(id: string, extra: Partial<Match> = {}): Match {
  return {
    id,
    competitionId: 'comp-1',
    sessionId: 'sess-1',
    poolId: null,
    courtId: null,
    timeslotId: null,
    homeParticipantId: null,
    awayParticipantId: null,
    refParticipantId: null,
    bracket: null,
    roundLabel: null,
    status: 'scheduled',
    sets: [],
    ...extra,
  };
}

const session: Session = {
  id: 'sess-1',
  competitionId: 'comp-1',
  name: 'Finals Day',
  playDate: '2026-09-19',
  startTime: '09:00',
  endTime: '17:00',
};

const courts: Court[] = [
  { id: 'court-1', competitionId: 'comp-1', name: 'Court 1', isActive: true },
  { id: 'court-2', competitionId: 'comp-1', name: 'Court 2', isActive: true },
];

const timeslots: Timeslot[] = [
  // Deliberately out of order, morning after midday, so ordering is proved
  // to come from the timestamps rather than from input order.
  {
    id: 'ts-2',
    sessionId: 'sess-1',
    startAt: '2026-09-19T12:00:00Z',
    endAt: '2026-09-19T12:45:00Z',
  },
  {
    id: 'ts-1',
    sessionId: 'sess-1',
    startAt: '2026-09-19T09:00:00Z',
    endAt: '2026-09-19T09:45:00Z',
  },
];

describe('toCsv', () => {
  it('quotes only the fields that need it, doubling embedded quotes', () => {
    const csv = toCsv(
      ['name', 'note'],
      [
        ['Plain', 'a,b'],
        ['Say "hi"', 'line\nbreak'],
      ],
    );
    expect(csv).toBe('name,note\r\nPlain,"a,b"\r\n"Say ""hi""","line\nbreak"\r\n');
  });

  it('exports null and undefined as empty cells, keeping zero', () => {
    expect(toCsv(['a', 'b', 'c'], [[null, undefined, 0]])).toBe('a,b,c\r\n,,0\r\n');
  });
});

describe('participantsToCsv', () => {
  it('exports the entry list ordered by name', () => {
    const csv = participantsToCsv([
      team('p2', 'Setters', { seed: 2, contactName: 'Ana' }),
      team('p1', 'Blockers', { seed: 1 }),
    ]);
    expect(lines(csv)).toEqual([
      'name,kind,seed,contactName,contactEmail,contactPhone,registeredAt,notes',
      'Blockers,team,1,,,,2026-09-01T12:00:00Z,',
      'Setters,team,2,Ana,,,2026-09-01T12:00:00Z,',
    ]);
  });

  it('handles a name that fights the format', () => {
    const csv = participantsToCsv([team('p1', 'Serve, "Set", Spike')]);
    expect(lines(csv)[1]).toBe('"Serve, ""Set"", Spike",team,,,,,2026-09-01T12:00:00Z,');
  });
});

describe('rosterToCsv', () => {
  const players: TeamPlayer[] = [
    { id: 'tp-2', participantId: 'p1', name: 'Bea', jerseyNumber: 7 },
    { id: 'tp-1', participantId: 'p2', name: 'Ada' },
    { id: 'tp-3', participantId: 'p1', name: 'Ali' },
  ];

  it('groups players under their team, both ordered by name', () => {
    const csv = rosterToCsv([team('p1', 'Blockers'), team('p2', 'Setters')], players);
    expect(lines(csv)).toEqual([
      'team,player,jerseyNumber',
      'Blockers,Ali,',
      'Blockers,Bea,7',
      'Setters,Ada,',
    ]);
  });

  it('raises on a player whose team was not handed in', () => {
    expect(() => rosterToCsv([team('p1', 'Blockers')], players)).toThrow(/p2/);
  });
});

describe('scheduleToCsv', () => {
  const input = {
    sessions: [session],
    timeslots,
    courts,
    participants: [team('p1', 'Blockers'), team('p2', 'Setters'), team('p3', 'Liberos')],
    pools: [{ id: 'pool-a', competitionId: 'comp-1', name: 'A' } satisfies Pool],
  };

  it('orders rows by slot timestamp, then court name, then id', () => {
    const csv = scheduleToCsv({
      ...input,
      matches: [
        match('m-noon', { courtId: 'court-1', timeslotId: 'ts-2', poolId: 'pool-a' }),
        match('m-morning-c2', { courtId: 'court-2', timeslotId: 'ts-1' }),
        match('m-morning-c1', { courtId: 'court-1', timeslotId: 'ts-1' }),
      ],
    });
    expect(lines(csv).map((line) => line.split(',').at(-1))).toEqual([
      'matchId',
      'm-morning-c1',
      'm-morning-c2',
      'm-noon',
    ]);
  });

  it('exports a full row: names resolved, timestamps absolute', () => {
    const csv = scheduleToCsv({
      ...input,
      matches: [
        match('m1', {
          courtId: 'court-1',
          timeslotId: 'ts-1',
          poolId: 'pool-a',
          roundLabel: 'Pool Play',
          homeParticipantId: 'p1',
          awayParticipantId: 'p2',
          refParticipantId: 'p3',
        }),
      ],
    });
    expect(lines(csv)[1]).toBe(
      'Finals Day,2026-09-19,2026-09-19T09:00:00Z,2026-09-19T09:45:00Z,Court 1,A,Pool Play,,Blockers,Setters,Liberos,scheduled,m1',
    );
  });

  it('keeps unplaced matches, last, with empty time and court cells', () => {
    const csv = scheduleToCsv({
      ...input,
      matches: [
        match('m-unplaced', { bracket: 'gold', roundLabel: 'Semifinal' }),
        match('m-placed', { courtId: 'court-1', timeslotId: 'ts-1' }),
      ],
    });
    expect(lines(csv).at(-1)).toBe(
      'Finals Day,2026-09-19,,,,,Semifinal,gold,,,,scheduled,m-unplaced',
    );
  });

  it('raises on a match naming a court that was not handed in', () => {
    expect(() =>
      scheduleToCsv({
        ...input,
        matches: [match('m1', { courtId: 'court-9', timeslotId: 'ts-1' })],
      }),
    ).toThrow(/court-9/);
  });

  it('raises on a pool id when the pools were not handed in', () => {
    expect(() =>
      scheduleToCsv({
        ...input,
        pools: undefined,
        matches: [match('m1', { courtId: 'court-1', timeslotId: 'ts-1', poolId: 'pool-a' })],
      }),
    ).toThrow(/pool-a/);
  });
});

describe('resultsToCsv', () => {
  const participants = [team('p1', 'Blockers'), team('p2', 'Setters')];
  const sets = (matchId: string, scores: Array<[number, number]>) =>
    scores.map(([home, away], i) => ({
      id: `${matchId}-s${i + 1}`,
      matchId,
      setNumber: i + 1,
      homePoints: home,
      awayPoints: away,
    }));

  it('exports one row per finished match, one column pair per set', () => {
    const csv = resultsToCsv({
      participants,
      matches: [
        match('m1', {
          status: 'final',
          homeParticipantId: 'p1',
          awayParticipantId: 'p2',
          roundLabel: 'Pool Play',
          sets: sets('m1', [
            [25, 20],
            [23, 25],
          ]),
        }),
      ],
    });
    expect(lines(csv)).toEqual([
      'matchId,round,bracket,home,away,status,set1Home,set1Away,set2Home,set2Away,setsHome,setsAway',
      'm1,Pool Play,,Blockers,Setters,final,25,20,23,25,1,1',
    ]);
  });

  it('widens to the largest set count and leaves shorter matches blank', () => {
    const csv = resultsToCsv({
      participants,
      matches: [
        match('m1', {
          status: 'final',
          sets: sets('m1', [
            [25, 20],
            [25, 18],
          ]),
        }),
        match('m2', {
          status: 'final',
          sets: sets('m2', [
            [25, 27],
            [25, 19],
            [15, 12],
          ]),
        }),
      ],
    });
    const header = lines(csv)[0];
    expect(header).toContain('set3Home,set3Away');
    expect(lines(csv)[1]).toBe('m1,,,,,final,25,20,25,18,,,2,0');
    expect(lines(csv)[2]).toBe('m2,,,,,final,25,27,25,19,15,12,2,1');
  });

  it('skips matches that are not finished — a live score is not a result', () => {
    const csv = resultsToCsv({
      participants,
      matches: [
        match('m1', { status: 'live', sets: sets('m1', [[10, 8]]) }),
        match('m2', { status: 'scheduled' }),
        match('m3', { status: 'forfeit' }),
      ],
    });
    expect(lines(csv)).toEqual([
      'matchId,round,bracket,home,away,status,setsHome,setsAway',
      'm3,,,,,forfeit,0,0',
    ]);
  });

  it('exports set scores in set order even when stored out of order', () => {
    const shuffled = sets('m1', [
      [15, 12],
      [25, 20],
      [23, 25],
    ]).map((s, i) => ({ ...s, setNumber: [3, 1, 2][i] ?? 0 }));
    const csv = resultsToCsv({
      participants,
      matches: [match('m1', { status: 'final', sets: shuffled })],
    });
    expect(lines(csv)[1]).toBe('m1,,,,,final,25,20,23,25,15,12,2,1');
  });
});

describe('standingsToCsv', () => {
  const standing = (rank: number, name: string): Standing => ({
    participantId: name.toLowerCase(),
    participantName: name,
    wins: 3,
    losses: 1,
    winPercentage: 0.75,
    setsWon: 6,
    setsLost: 3,
    setDifferential: 3,
    pointsFor: 200,
    pointsAgainst: 180,
    pointDifferential: 20,
    pointAdjustment: 0,
    rank,
  });

  it('exports the table exactly as computed, never re-sorted', () => {
    // The order handed in is computeStandings' order, tiebreakers included.
    // Re-deriving it here would be a second ranking disagreeing with the
    // first — same line the bracket template decision draws.
    const csv = standingsToCsv([standing(2, 'Setters'), standing(1, 'Blockers')]);
    expect(lines(csv)).toEqual([
      'rank,participant,wins,losses,winPercentage,setsWon,setsLost,setDifferential,pointsFor,pointsAgainst,pointDifferential,pointAdjustment',
      '2,Setters,3,1,0.75,6,3,3,200,180,20,0',
      '1,Blockers,3,1,0.75,6,3,3,200,180,20,0',
    ]);
  });

  it('keeps a penalty visible in its own column', () => {
    const penalized = { ...standing(1, 'Blockers'), pointAdjustment: -5, pointDifferential: 15 };
    expect(lines(standingsToCsv([penalized]))[1]).toBe('1,Blockers,3,1,0.75,6,3,3,200,180,15,-5');
  });
});

describe('attendanceToCsv', () => {
  const weeks: Session[] = [
    { ...session, id: 'sess-2', name: 'Week 2', playDate: '2026-09-26', sequence: 2 },
    { ...session, id: 'sess-1', name: 'Week 1', playDate: '2026-09-19', sequence: 1 },
  ];
  const people = [team('p1', 'Ana', {}), team('p2', 'Ben', {}), team('p3', 'Cal', {})].map((p) => ({
    ...p,
    kind: 'individual' as const,
  }));

  const entry = (
    id: string,
    sessionId: string,
    participantId: string,
    status: Attendance['status'],
    waitlistPos?: number,
  ): Attendance => ({
    id,
    sessionId,
    participantId,
    status,
    ...(waitlistPos === undefined ? {} : { waitlistPos }),
    recordedAt: '2026-09-19T18:00:00Z',
  });

  it('orders by session date then participant name, with waitlist position as data', () => {
    const csv = attendanceToCsv({
      sessions: weeks,
      participants: people,
      attendance: [
        entry('a3', 'sess-2', 'p1', 'registered'),
        entry('a2', 'sess-1', 'p3', 'waitlist', 1),
        entry('a1', 'sess-1', 'p2', 'checked_in'),
      ],
    });
    expect(lines(csv)).toEqual([
      'session,date,participant,status,waitlistPos,recordedAt',
      'Week 1,2026-09-19,Ben,checked_in,,2026-09-19T18:00:00Z',
      'Week 1,2026-09-19,Cal,waitlist,1,2026-09-19T18:00:00Z',
      'Week 2,2026-09-26,Ana,registered,,2026-09-19T18:00:00Z',
    ]);
  });

  it('raises on attendance for a session that was not handed in', () => {
    expect(() =>
      attendanceToCsv({
        sessions: weeks,
        participants: people,
        attendance: [entry('a1', 'sess-9', 'p1', 'registered')],
      }),
    ).toThrow(/sess-9/);
  });
});

describe('exports are pure', () => {
  it('leave their inputs untouched and export identically every call', () => {
    const input = {
      matches: [
        match('m1', {
          courtId: 'court-1',
          timeslotId: 'ts-1',
          status: 'final' as const,
          homeParticipantId: 'p1',
          awayParticipantId: 'p2',
          sets: [{ id: 'm1-s1', matchId: 'm1', setNumber: 1, homePoints: 25, awayPoints: 20 }],
        }),
      ],
      sessions: [session],
      timeslots,
      courts,
      participants: [team('p1', 'Blockers'), team('p2', 'Setters')],
    };
    const before = structuredClone(input);
    const first = scheduleToCsv(input);
    const second = scheduleToCsv(input);
    resultsToCsv(input);
    participantsToCsv(input.participants);
    expect(first).toBe(second);
    expect(input).toEqual(before);
  });
});
