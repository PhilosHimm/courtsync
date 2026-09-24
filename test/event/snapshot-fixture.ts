import type { Competition, Match, Participant } from '@/lib/core';
import { timeslotGrid } from '@/lib/core';
import type { EventSnapshot } from '@/lib/event/snapshot';

/** An event as the data layer would load it, built in memory. */
export function snapshotOf(
  overrides: {
    format?: Competition['format'];
    teams?: number;
    courts?: number;
    slots?: number;
    sessions?: number;
    competition?: Partial<Competition>;
  } = {},
): EventSnapshot {
  const format = overrides.format ?? 'tournament';
  const teams = overrides.teams ?? 8;
  const sessionCount = overrides.sessions ?? 1;
  const competition: Competition = {
    id: 'comp-1',
    name: 'Spring Open',
    slug: 'spring-open',
    format,
    gameDurationMin: 45,
    bufferMin: 15,
    status: 'draft',
    timeZone: 'UTC',
    bracketTiers: ['gold'],
    createdAt: '2026-06-01T00:00:00.000Z',
    ...overrides.competition,
  };
  const sessions = Array.from({ length: sessionCount }, (_, i) => ({
    id: `sess-${i + 1}`,
    competitionId: competition.id,
    playDate: `2026-07-${String(4 + i * 7).padStart(2, '0')}`,
    startTime: '09:00',
    endTime: '17:00',
    sequence: i + 1,
  }));
  const timeslots = sessions.flatMap((s) =>
    timeslotGrid({
      sessionId: s.id,
      playDate: s.playDate,
      startTime: s.startTime,
      count: overrides.slots ?? 12,
      durationMin: 45,
      bufferMin: 15,
      timeZone: 'UTC',
    }),
  );
  const participants: Participant[] = Array.from({ length: teams }, (_, i) => ({
    id: `team-${String(i + 1).padStart(2, '0')}`,
    competitionId: competition.id,
    kind: format === 'dropin' ? 'individual' : 'team',
    name: `Team ${i + 1}`,
    seed: i + 1,
    registeredAt: '2026-06-01T00:00:00.000Z',
  }));
  return {
    competition,
    venue: null,
    courts: Array.from({ length: overrides.courts ?? 2 }, (_, i) => ({
      id: `court-${i + 1}`,
      venueId: 'venue-1',
      name: `Court ${i + 1}`,
      isActive: true,
    })),
    courtWindows: [],
    sessions,
    timeslots,
    pools: [],
    participants,
    teamPlayers: [],
    matches: [],
    attendance: [],
    transactions: [],
    setFormats: [],
    scoreEdits: [],
    announcements: [],
  };
}

/** Record a straight-sets result: home wins when `homeWins`. */
export function decide(match: Match, homeWins: boolean, target = 21): Match {
  const w = target;
  const l = target - 6;
  return {
    ...match,
    status: 'final',
    sets: [1, 2].map((n) => ({
      id: `${match.id}-s${n}`,
      matchId: match.id,
      setNumber: n,
      homePoints: homeWins ? w : l,
      awayPoints: homeWins ? l : w,
    })),
  };
}
