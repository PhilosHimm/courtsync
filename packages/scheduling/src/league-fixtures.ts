import type { Match, Session, UUID } from '@courtsync/core';
import { leagueMatchId } from './match-ids';
import { roundRobinRounds } from './round-robin';

export interface LeagueFixtureInput {
  competitionSlug: string;
  sessions: Session[];
  participantIds: UUID[];
  courtIds: UUID[];
  /** Timeslot ids grouped by session id. */
  timeslotsBySession: Record<UUID, UUID[]>;
  /** Play every opponent this many times across the season. Default 1. */
  rounds?: number;
  /**
   * The competition's real id. Scheduling is pure and never reads a database,
   * so callers that already know the persisted id pass it here; otherwise the
   * slug stands in and the persistence layer remaps.
   */
  competitionId?: UUID;
}

/**
 * Spread a round-robin across a season's weekly sessions.
 *
 * Same pairings as pool play, distributed differently. Pool play packs a whole
 * round-robin into one day; a league plays one round a week, so a round maps
 * to a session and each participant plays once per week rather than three
 * times before lunch.
 *
 * A second time through the round-robin reverses home and away, which is what
 * a double round-robin means: everyone hosts everyone once.
 */
export function generateLeagueFixtures(input: LeagueFixtureInput): Match[] {
  const { competitionSlug, sessions, participantIds, courtIds, timeslotsBySession } = input;
  const competitionId = input.competitionId ?? competitionSlug;
  const legs = Math.max(1, Math.trunc(input.rounds ?? 1));

  if (sessions.length === 0) return [];

  const basePairings = roundRobinRounds(participantIds);
  if (basePairings.length === 0) return [];

  // One full round-robin per leg; odd legs are the return fixtures.
  const allRounds: Array<Array<[UUID, UUID]>> = [];
  for (let leg = 0; leg < legs; leg++) {
    for (const round of basePairings) {
      allRounds.push(leg % 2 === 1 ? round.map(([home, away]) => [away, home]) : round);
    }
  }

  // Matches already placed in each session, so a session holding more than one
  // round keeps numbering and court/timeslot assignment continuous.
  const placedPerSession = new Map<UUID, number>();
  const matches: Match[] = [];

  for (const [roundIndex, round] of allRounds.entries()) {
    const sessionIndex = roundIndex % sessions.length;
    const session = sessions[sessionIndex];
    if (!session) continue;

    const week = session.sequence ?? sessionIndex + 1;
    const timeslots = timeslotsBySession[session.id] ?? [];

    for (const [home, away] of round) {
      const placed = placedPerSession.get(session.id) ?? 0;
      placedPerSession.set(session.id, placed + 1);

      // Court and timeslot are assigned together or not at all. A fixture
      // holding a court but no time is not placed, it is just confusing —
      // pool play nulls both for the same reason.
      const timeslot =
        courtIds.length > 0 ? timeslots[Math.floor(placed / courtIds.length)] : undefined;
      const court = timeslot === undefined ? undefined : courtIds[placed % courtIds.length];

      matches.push({
        id: leagueMatchId(competitionSlug, week, placed + 1),
        competitionId,
        sessionId: session.id,
        // A league has no pools; every team is in one table all season.
        poolId: null,
        courtId: court ?? null,
        timeslotId: timeslot ?? null,
        homeParticipantId: home,
        awayParticipantId: away,
        refParticipantId: null,
        bracket: null,
        roundLabel: `Week ${week}`,
        status: 'scheduled',
        sets: [],
      });
    }
  }

  return matches;
}
