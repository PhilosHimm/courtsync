import type { Court, Match, Participant, Session, Standing, Timeslot } from '@/lib/core';
import { computeStandings, generateLeagueFixtures } from '@/lib/scheduling';
import type { StoredLeague, StoredTeam } from '@/lib/storage';
import { competitionSlug, STORAGE_SCHEMA_VERSION } from '@/lib/storage';
import { applyResult } from './results';
import { addDays, addMinutes, buildTimeslots } from './time';

/**
 * A stored league season, rebuilt week by week.
 *
 * The fixtures are regenerated from the setup on every read and the table is
 * `computeStandings` over whatever results the convener has entered. There
 * is no season table being kept up to date, and there never will be — audit
 * finding H9 was exactly such a table drifting away from its results.
 */

export interface LeagueView {
  stored: StoredLeague;
  slug: string;
  sessions: Session[];
  courts: Court[];
  timeslotsBySession: Record<string, Timeslot[]>;
  participants: Participant[];
  fixtures: Match[];
  /** Fixtures the weekly grid had no room for — a capacity answer, not an error. */
  unscheduled: Match[];
  standings: Standing[];
  playedCount: number;
  nameOf: Record<string, string>;
  problem: string | null;
}

export interface LeagueSetup {
  name: string;
  venueName?: string;
  startDate: string;
  startTime: string;
  weeks: number;
  gameDurationMin: number;
  bufferMin: number;
  courtNames: string[];
  slotsPerWeek: number;
  legs: number;
  splitByPoints: boolean;
  teams: StoredTeam[];
}

/** A new stored league. `id` and `now` come from the caller to keep this pure. */
export function createLeague(setup: LeagueSetup, id: string, now: string): StoredLeague {
  return {
    id,
    schemaVersion: STORAGE_SCHEMA_VERSION,
    ...setup,
    createdAt: now,
    updatedAt: now,
    results: {},
  };
}

export function buildLeagueView(stored: StoredLeague): LeagueView {
  const slug = competitionSlug(stored.id);

  const endTime = addMinutes(
    stored.startTime,
    stored.slotsPerWeek * (stored.gameDurationMin + stored.bufferMin),
  );

  const sessions: Session[] = Array.from({ length: stored.weeks }, (_, i) => ({
    id: `${slug}-wk-${i + 1}`,
    competitionId: stored.id,
    name: `Week ${i + 1}`,
    playDate: addDays(stored.startDate, i * 7),
    startTime: stored.startTime,
    endTime,
    sequence: i + 1,
  }));

  const courts: Court[] = stored.courtNames.map((name, i) => ({
    id: `${slug}-court-${i + 1}`,
    competitionId: stored.id,
    name: name.trim() || `Court ${i + 1}`,
    isActive: true,
  }));

  const participants: Participant[] = stored.teams.map((team, i) => ({
    id: team.id,
    competitionId: stored.id,
    kind: 'team' as const,
    name: team.name,
    seed: i + 1,
    registeredAt: stored.createdAt,
  }));
  const nameOf = Object.fromEntries(participants.map((p) => [p.id, p.name]));

  const timeslotsBySession: Record<string, Timeslot[]> = {};
  for (const session of sessions) {
    timeslotsBySession[session.id] = buildTimeslots({
      sessionId: session.id,
      playDate: session.playDate,
      startTime: session.startTime,
      count: stored.slotsPerWeek,
      durationMin: stored.gameDurationMin,
      bufferMin: stored.bufferMin,
    });
  }

  const empty: Omit<LeagueView, 'problem'> = {
    stored,
    slug,
    sessions,
    courts,
    timeslotsBySession,
    participants,
    fixtures: [],
    unscheduled: [],
    standings: [],
    playedCount: 0,
    nameOf,
  };

  if (participants.length < 2) {
    return { ...empty, problem: 'A league needs at least two teams — add more in setup.' };
  }
  if (sessions.length === 0) {
    return { ...empty, problem: 'A season needs at least one week.' };
  }

  const generated = generateLeagueFixtures({
    competitionSlug: slug,
    competitionId: stored.id,
    sessions,
    participantIds: participants.map((p) => p.id),
    courtIds: courts.map((c) => c.id),
    timeslotsBySession: Object.fromEntries(
      Object.entries(timeslotsBySession).map(([id, slots]) => [id, slots.map((s) => s.id)]),
    ),
    rounds: Math.max(1, Math.trunc(stored.legs)),
  });

  const fixtures = generated.map((match) => applyResult(match, stored.results));
  const playedCount = fixtures.filter((match) => match.status === 'final').length;

  return {
    ...empty,
    fixtures,
    unscheduled: fixtures.filter((m) => m.timeslotId === null),
    standings: computeStandings({
      participants,
      matches: fixtures,
      splitSetsDecidedByTotalPoints: stored.splitByPoints,
    }),
    playedCount,
    problem: null,
  };
}
