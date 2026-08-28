import type {
  Competition,
  Court,
  Match,
  Participant,
  Session,
  Standing,
  Timeslot,
} from '@/lib/core';
import { computeStandings, generateLeagueFixtures } from '@/lib/scheduling';
import type { LeagueDemoConfig } from './config';
import {
  addDays,
  demoCompetition,
  demoCourts,
  demoSession,
  demoTeams,
  demoTimeslots,
} from './data';
import type { Outcomes } from './results';
import { play } from './results';

/**
 * A season, week by week.
 *
 * The league convener's whole complaint is that a season is not a big
 * tournament: each week has its own grid, and a table has to stay correct
 * across the weeks that have been played while the weeks ahead sit unplayed.
 * That is why `played` is a knob here rather than a stage name — sliding it
 * is the demo's way of asking the question the convener asks, which is
 * whether the table is right *today*, halfway through.
 *
 * Standings are computed from matches on every build. There is no season
 * table being kept up to date, and there never will be: audit finding H9 was
 * exactly that table drifting away from the results underneath it.
 */

const SLUG = 'demo-tuesday';
/** Tuesdays. The first is a fixed date so a copied link is reproducible. */
const FIRST_PLAY_DATE = '2026-09-15';
const GAME_MIN = 50;
const BUFFER_MIN = 10;

export interface LeagueDemo {
  config: LeagueDemoConfig;
  competition: Competition;
  sessions: Session[];
  courts: Court[];
  timeslotsBySession: Record<string, Timeslot[]>;
  participants: Participant[];
  fixtures: Match[];
  /** Fixtures the weekly grid had no room for — a real capacity answer. */
  unscheduled: Match[];
  standings: Standing[];
  /** Weeks whose results are in. Everything after is still to play. */
  playedWeeks: number;
  nameOf: Record<string, string>;
}

export function buildLeagueDemo(config: LeagueDemoConfig, outcomes: Outcomes = {}): LeagueDemo {
  const competition = demoCompetition({
    format: 'league',
    slug: SLUG,
    name: 'Demo Tuesday Night League',
    venueName: 'Demo Community Centre',
    gameDurationMin: GAME_MIN,
    bufferMin: BUFFER_MIN,
    registrationFee: 400,
  });

  const sessions = Array.from({ length: config.weeks }, (_, i) =>
    demoSession({
      competitionId: competition.id,
      id: `demo-wk-${i + 1}`,
      name: `Week ${i + 1}`,
      playDate: addDays(FIRST_PLAY_DATE, i * 7),
      startTime: '19:00',
      endTime: '22:00',
      sequence: i + 1,
    }),
  );

  const courts = demoCourts(competition.id, config.courts);
  const participants = demoTeams(competition.id, config.teams);
  const nameOf = Object.fromEntries(participants.map((p) => [p.id, p.name]));

  const timeslotsBySession: Record<string, Timeslot[]> = {};
  for (const session of sessions) {
    timeslotsBySession[session.id] = demoTimeslots({
      sessionId: session.id,
      playDate: session.playDate,
      startTime: session.startTime,
      count: config.slotsPerWeek,
      durationMin: GAME_MIN,
      bufferMin: BUFFER_MIN,
    });
  }

  const fixtures = generateLeagueFixtures({
    competitionSlug: SLUG,
    competitionId: competition.id,
    sessions,
    participantIds: participants.map((p) => p.id),
    courtIds: courts.map((c) => c.id),
    timeslotsBySession: Object.fromEntries(
      Object.entries(timeslotsBySession).map(([id, slots]) => [id, slots.map((s) => s.id)]),
    ),
    rounds: config.legs,
  });

  const sequenceOf = new Map(sessions.map((s) => [s.id, s.sequence ?? 0]));
  const playedWeeks = Math.min(config.played, config.weeks);

  const withResults = fixtures.map((match) =>
    (sequenceOf.get(match.sessionId) ?? 0) <= playedWeeks ? play(match, outcomes, 'pool') : match,
  );

  return {
    config,
    competition,
    sessions,
    courts,
    timeslotsBySession,
    participants,
    fixtures: withResults,
    unscheduled: withResults.filter((m) => m.timeslotId === null),
    standings: computeStandings({
      participants,
      matches: withResults,
      splitSetsDecidedByTotalPoints: config.splitByPoints,
    }),
    playedWeeks,
    nameOf,
  };
}
