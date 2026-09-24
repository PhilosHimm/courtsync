import type { Match, Session, UUID } from '@/lib/core';
import type { CourtCell } from './court-availability';
import { blockedSet, cellKey } from './court-availability';
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
  /**
   * Court-and-slot cells that may not be used, across every week. Build it
   * with `unavailableCells`. A court shared with another club in week 2 only
   * blocks week 2's cells, so every other week is exactly as it was.
   */
  unavailable?: readonly CourtCell[];
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

  // Each week's usable cells, slot by slot and court by court within a slot.
  // With nothing blocked the k-th fixture of a week lands where it always
  // did: slot floor(k / courts), court k % courts.
  const blocked = blockedSet(input.unavailable);
  const cellsBySession = new Map<UUID, Array<{ courtId: UUID; timeslotId: UUID }>>();
  const cellsFor = (sessionId: UUID) => {
    const cached = cellsBySession.get(sessionId);
    if (cached) return cached;
    const cells: Array<{ courtId: UUID; timeslotId: UUID }> = [];
    for (const timeslotId of timeslotsBySession[sessionId] ?? []) {
      for (const courtId of courtIds) {
        if (!blocked.has(cellKey(courtId, timeslotId))) cells.push({ courtId, timeslotId });
      }
    }
    cellsBySession.set(sessionId, cells);
    return cells;
  };

  for (const [roundIndex, round] of allRounds.entries()) {
    const sessionIndex = roundIndex % sessions.length;
    const session = sessions[sessionIndex];
    if (!session) continue;

    const week = session.sequence ?? sessionIndex + 1;
    const cells = cellsFor(session.id);

    for (const [home, away] of round) {
      const placed = placedPerSession.get(session.id) ?? 0;
      placedPerSession.set(session.id, placed + 1);

      // Court and timeslot are assigned together or not at all. A fixture
      // holding a court but no time is not placed, it is just confusing —
      // pool play nulls both for the same reason.
      const cell = cells[placed];
      const timeslot = cell?.timeslotId;
      const court = cell?.courtId;

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
