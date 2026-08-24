import type { Match, Session, UUID } from '@courtsync/core';
import { NotImplementedError } from './errors';

export interface LeagueFixtureInput {
  competitionSlug: string;
  sessions: Session[];
  participantIds: UUID[];
  courtIds: UUID[];
  /** Timeslot ids grouped by session id. */
  timeslotsBySession: Record<UUID, UUID[]>;
  /** Play every opponent this many times across the season. Default 1. */
  rounds?: number;
}

/**
 * Spread a round-robin across a season's weekly sessions.
 *
 * NOT IMPLEMENTED. Specification: `test/league-fixtures.test.ts`.
 *
 * Distinct from pool play in one important way: pool play packs a whole
 * round-robin into a single day, while a league distributes it across
 * sessions so each participant plays roughly the same number of matches
 * each week and faces opponents in a spread-out order.
 */
export function generateLeagueFixtures(_input: LeagueFixtureInput): Match[] {
  throw new NotImplementedError(
    'generateLeagueFixtures',
    'packages/scheduling/test/league-fixtures.test.ts',
  );
}
