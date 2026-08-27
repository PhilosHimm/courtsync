/**
 * Fixture builders for the three competition formats.
 *
 * These exist to be executable proof that the domain model can express all
 * three. If a change to the types makes any of these impossible to build,
 * the model has regressed — see `packages/core/test/formats.test.ts`.
 *
 * Ids are deterministic strings rather than real UUIDs so tests can assert
 * on them. Nothing here should ever be imported by application code.
 */

import type {
  Attendance,
  Competition,
  Court,
  Match,
  Participant,
  Pool,
  Session,
  Timeslot,
} from '../types/index';

const ORG_ID = 'org-0000';

/**
 * Add whole days to an ISO date, rolling over month boundaries correctly.
 *
 * Naive string arithmetic (`2026-01-${6 + i * 7}`) produces `2026-01-34`,
 * which parses to Invalid Date. Deterministic — no `Date.now()` involved.
 */
function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export interface CompetitionFixture {
  competition: Competition;
  sessions: Session[];
  courts: Court[];
  timeslots: Timeslot[];
  pools: Pool[];
  participants: Participant[];
  attendance: Attendance[];
  matches: Match[];
}

function court(competitionId: string, n: number): Court {
  return { id: `court-${n}`, competitionId, name: `Court ${n}`, isActive: true };
}

function participant(
  competitionId: string,
  id: string,
  name: string,
  kind: 'team' | 'individual',
  seed?: number,
): Participant {
  return seed === undefined
    ? { id, competitionId, kind, name, registeredAt: '2026-01-01T00:00:00Z' }
    : { id, competitionId, kind, name, seed, registeredAt: '2026-01-01T00:00:00Z' };
}

/**
 * A one-day, 12-team, 3-pool tournament with a gold bracket.
 * Exactly one session — the shape scoopvolleyball was built for.
 */
export function makeTournament(): CompetitionFixture {
  const competitionId = 'comp-tournament';
  const competition: Competition = {
    id: competitionId,
    organizationId: ORG_ID,
    name: 'Spring Open',
    slug: 'spring-open',
    format: 'tournament',
    venueName: 'Main Gym',
    registrationFee: 100,
    gameDurationMin: 45,
    bufferMin: 5,
    createdAt: '2026-01-01T00:00:00Z',
  };

  const sessions: Session[] = [
    {
      id: 'sess-1',
      competitionId,
      playDate: '2026-03-14',
      startTime: '09:00',
      endTime: '18:00',
      sequence: 1,
    },
  ];

  const courts = [1, 2, 3].map((n) => court(competitionId, n));

  // 45-minute games with a 5-minute buffer. endAt is always after startAt —
  // the schema enforces this with a check constraint.
  const timeslots: Timeslot[] = [
    ['09:00', '09:45'],
    ['09:50', '10:35'],
    ['10:40', '11:25'],
    ['11:30', '12:15'],
  ].map(([start, end], i) => ({
    id: `ts-${i + 1}`,
    sessionId: 'sess-1',
    startAt: `2026-03-14T${start}:00Z`,
    endAt: `2026-03-14T${end}:00Z`,
  }));

  const pools: Pool[] = ['A', 'B', 'C'].map((name) => ({
    id: `pool-${name}`,
    competitionId,
    name,
  }));

  const participants: Participant[] = Array.from({ length: 12 }, (_, i) =>
    participant(competitionId, `team-${i + 1}`, `Team ${i + 1}`, 'team', i + 1),
  );

  const matches: Match[] = [
    {
      id: 'spring-open-pool-a-1',
      competitionId,
      sessionId: 'sess-1',
      poolId: 'pool-A',
      courtId: 'court-1',
      timeslotId: 'ts-1',
      homeParticipantId: 'team-1',
      awayParticipantId: 'team-2',
      refParticipantId: 'team-3',
      roundLabel: 'Pool Play',
      status: 'final',
      sets: [
        {
          id: 'set-1',
          matchId: 'spring-open-pool-a-1',
          setNumber: 1,
          homePoints: 21,
          awayPoints: 18,
        },
        {
          id: 'set-2',
          matchId: 'spring-open-pool-a-1',
          setNumber: 2,
          homePoints: 21,
          awayPoints: 15,
        },
      ],
    },
    {
      id: 'spring-open-gold-q1',
      competitionId,
      sessionId: 'sess-1',
      poolId: null,
      courtId: 'court-1',
      timeslotId: 'ts-4',
      homeParticipantId: 'team-1',
      awayParticipantId: 'team-8',
      bracket: 'gold',
      roundLabel: 'Quarterfinal',
      status: 'scheduled',
      sets: [],
    },
  ];

  return { competition, sessions, courts, timeslots, pools, participants, attendance: [], matches };
}

/**
 * A 10-week league season with 8 fixed teams and no pools.
 * The format scoop's schema could not express at all.
 */
export function makeLeagueSeason(): CompetitionFixture {
  const competitionId = 'comp-league';
  const competition: Competition = {
    id: competitionId,
    organizationId: ORG_ID,
    name: 'Tuesday Night League',
    slug: 'tuesday-night',
    format: 'league',
    venueName: 'Community Centre',
    registrationFee: 400,
    gameDurationMin: 50,
    bufferMin: 10,
    createdAt: '2026-01-01T00:00:00Z',
  };

  // Ten weekly sessions. This is the entity that makes a season possible.
  const sessions: Session[] = Array.from({ length: 10 }, (_, i) => ({
    id: `sess-wk-${i + 1}`,
    competitionId,
    name: `Week ${i + 1}`,
    // Tuesdays from 6 Jan 2026; the season runs into March.
    playDate: addDays('2026-01-06', i * 7),
    startTime: '19:00',
    endTime: '22:00',
    sequence: i + 1,
  }));

  const courts = [1, 2].map((n) => court(competitionId, n));

  // Each week gets its own independent grid — this is what `Session` buys.
  const timeslots: Timeslot[] = sessions.flatMap((s) =>
    [
      ['19:00', '19:50'],
      ['20:00', '20:50'],
      ['21:00', '21:50'],
    ].map(([start, end], i) => ({
      id: `ts-${s.id}-${i + 1}`,
      sessionId: s.id,
      startAt: `${s.playDate}T${start}:00Z`,
      endAt: `${s.playDate}T${end}:00Z`,
    })),
  );

  const participants: Participant[] = Array.from({ length: 8 }, (_, i) =>
    participant(competitionId, `lteam-${i + 1}`, `League Team ${i + 1}`, 'team'),
  );

  const matches: Match[] = [
    {
      id: 'tuesday-night-wk1-1',
      competitionId,
      sessionId: 'sess-wk-1',
      poolId: null,
      courtId: 'court-1',
      timeslotId: 'ts-sess-wk-1-1',
      homeParticipantId: 'lteam-1',
      awayParticipantId: 'lteam-2',
      roundLabel: 'Week 1',
      status: 'final',
      sets: [
        {
          id: 'lset-1',
          matchId: 'tuesday-night-wk1-1',
          setNumber: 1,
          homePoints: 25,
          awayPoints: 22,
        },
        {
          id: 'lset-2',
          matchId: 'tuesday-night-wk1-1',
          setNumber: 2,
          homePoints: 23,
          awayPoints: 25,
        },
        {
          id: 'lset-3',
          matchId: 'tuesday-night-wk1-1',
          setNumber: 3,
          homePoints: 15,
          awayPoints: 12,
        },
      ],
    },
  ];

  return {
    competition,
    sessions,
    courts,
    timeslots,
    pools: [],
    participants,
    attendance: [],
    matches,
  };
}

/**
 * A recurring drop-in with individual participants, a capacity cap, and a
 * waitlist. No fixed teams, no pools, no standings.
 */
export function makeDropInSeries(): CompetitionFixture {
  const competitionId = 'comp-dropin';
  const competition: Competition = {
    id: competitionId,
    organizationId: ORG_ID,
    name: 'Thursday Drop-In',
    slug: 'thursday-dropin',
    format: 'dropin',
    venueName: 'Rec Centre',
    registrationFee: 10,
    gameDurationMin: 20,
    bufferMin: 0,
    createdAt: '2026-01-01T00:00:00Z',
  };

  const sessions: Session[] = Array.from({ length: 4 }, (_, i) => ({
    id: `sess-di-${i + 1}`,
    competitionId,
    name: `Session ${i + 1}`,
    // Thursdays from 5 Feb 2026.
    playDate: addDays('2026-02-05', i * 7),
    startTime: '20:00',
    endTime: '22:00',
    sequence: i + 1,
  }));

  const courts = [1, 2].map((n) => court(competitionId, n));

  // Short 20-minute rotations, back to back.
  const timeslots: Timeslot[] = [
    ['20:00', '20:20'],
    ['20:25', '20:45'],
    ['20:50', '21:10'],
  ].map(([start, end], i) => ({
    id: `ts-di-${i + 1}`,
    sessionId: 'sess-di-1',
    startAt: `2026-02-05T${start}:00Z`,
    endAt: `2026-02-05T${end}:00Z`,
  }));

  // 14 individuals. Capacity is 12, so two land on the waitlist.
  const participants: Participant[] = Array.from({ length: 14 }, (_, i) =>
    participant(competitionId, `player-${i + 1}`, `Player ${i + 1}`, 'individual'),
  );

  const attendance: Attendance[] = participants.map((p, i) => {
    const base = {
      id: `att-${i + 1}`,
      sessionId: 'sess-di-1',
      participantId: p.id,
      recordedAt: '2026-02-05T18:00:00Z',
    };
    if (i < 10) return { ...base, status: 'checked_in' as const };
    if (i < 12) return { ...base, status: 'no_show' as const };
    return { ...base, status: 'waitlist' as const, waitlistPos: i - 11 };
  });

  const matches: Match[] = [
    {
      id: 'thursday-dropin-s1-1',
      competitionId,
      sessionId: 'sess-di-1',
      poolId: null,
      courtId: 'court-1',
      timeslotId: 'ts-di-1',
      // Drop-in sides are formed on the night and are not persisted
      // participants; a rotation implementation fills these in.
      homeParticipantId: null,
      awayParticipantId: null,
      status: 'scheduled',
      sets: [],
    },
  ];

  return {
    competition,
    sessions,
    courts,
    timeslots,
    pools: [],
    participants,
    attendance,
    matches,
  };
}

export const ALL_FORMAT_FIXTURES = [makeTournament, makeLeagueSeason, makeDropInSeries] as const;
