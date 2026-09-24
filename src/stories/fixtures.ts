import type { Court, Match, Standing, Timeslot } from '@/lib/core';
import type { ScheduleRow } from '@/lib/event/views';
import { scheduleRows } from '@/lib/event/views';

/**
 * Invented, and obviously so — the same rule as demo mode: nothing here is
 * presented as a real event or a real team.
 */
export const zone = 'America/Toronto';
export const courts: Court[] = [
  { id: 'c1', venueId: 'v', name: 'Court 1', isActive: true },
  { id: 'c2', venueId: 'v', name: 'Court 2', isActive: true },
];
export const timeslots: Timeslot[] = [0, 1, 2].map((i) => ({
  id: `t${i}`,
  sessionId: 's',
  startAt: `2026-07-04T${13 + i}:00:00.000Z`,
  endAt: `2026-07-04T${13 + i}:45:00.000Z`,
}));
const names = {
  a: 'Example Aces',
  b: 'Sample Setters',
  c: 'Placeholder Spikers',
  d: 'Demo Diggers',
};
const match = (
  id: string,
  t: string,
  c: string,
  h: string,
  a: string,
  status: Match['status'],
  score?: [number, number][],
): Match => ({
  id,
  competitionId: 'x',
  sessionId: 's',
  courtId: c,
  timeslotId: t,
  homeParticipantId: h,
  awayParticipantId: a,
  status,
  sets: (score ?? []).map(([hp, ap], i) => ({
    id: `${id}${i}`,
    matchId: id,
    setNumber: i + 1,
    homePoints: hp,
    awayPoints: ap,
  })),
});
export const rows: ScheduleRow[] = scheduleRows({
  matches: [
    match('m1', 't0', 'c1', 'a', 'b', 'final', [
      [21, 18],
      [21, 16],
    ]),
    match('m2', 't0', 'c2', 'c', 'd', 'final', [
      [19, 21],
      [21, 17],
    ]),
    match('m3', 't1', 'c1', 'a', 'c', 'live'),
    match('m4', 't1', 'c2', 'b', 'd', 'delayed'),
    match('m5', 't2', 'c1', 'a', 'd', 'scheduled'),
    match('m6', 't2', 'c2', 'b', 'c', 'cancelled'),
  ],
  timeslots,
  courts,
  names,
});
export const standings: Standing[] = [
  {
    participantId: 'a',
    participantName: names.a,
    wins: 2,
    losses: 0,
    winPercentage: 1,
    setsWon: 4,
    setsLost: 0,
    setDifferential: 4,
    pointsFor: 84,
    pointsAgainst: 64,
    pointDifferential: 20,
    pointAdjustment: 0,
    rank: 1,
  },
  {
    participantId: 'c',
    participantName: names.c,
    wins: 1,
    losses: 1,
    winPercentage: 0.5,
    setsWon: 2,
    setsLost: 2,
    setDifferential: 0,
    pointsFor: 78,
    pointsAgainst: 80,
    pointDifferential: -2,
    pointAdjustment: 0,
    rank: 2,
  },
  {
    participantId: 'd',
    participantName: names.d,
    wins: 1,
    losses: 1,
    winPercentage: 0.5,
    setsWon: 2,
    setsLost: 2,
    setDifferential: 0,
    pointsFor: 76,
    pointsAgainst: 80,
    pointDifferential: -4,
    pointAdjustment: 0,
    rank: 3,
  },
  {
    participantId: 'b',
    participantName: names.b,
    wins: 0,
    losses: 2,
    winPercentage: 0,
    setsWon: 0,
    setsLost: 4,
    setDifferential: -4,
    pointsFor: 60,
    pointsAgainst: 74,
    pointDifferential: -14,
    pointAdjustment: 0,
    rank: 4,
  },
];
