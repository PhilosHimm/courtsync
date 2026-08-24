import type { Match, Participant, Standing } from '@courtsync/core';
import { NotImplementedError } from './errors';

export interface StandingsInput {
  participants: Participant[];
  matches: Match[];
  /**
   * Pool play scores a 1-1 set split by total points. Playoffs do not.
   * Defaults to true.
   */
  splitSetsDecidedByTotalPoints?: boolean;
}

/**
 * Compute a standings table from matches.
 *
 * NOT IMPLEMENTED. Specification: `test/standings.test.ts`.
 *
 * Standings are ALWAYS derived, never stored. There is no standings table.
 *
 * Tiebreakers, in order: win percentage, head-to-head, set differential,
 * point differential, then participant id as a final deterministic key.
 *
 * Audit finding H9: scoop's comparison was nondeterministic on a full tie,
 * so re-running the seed produced a different bracket. The last tiebreaker
 * must be stable, never `Math.random()` and never insertion order.
 */
export function computeStandings(_input: StandingsInput): Standing[] {
  throw new NotImplementedError('computeStandings', 'packages/scheduling/test/standings.test.ts');
}
