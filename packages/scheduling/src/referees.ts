import type { Match, UUID } from '@courtsync/core';
import { NotImplementedError } from './errors';
import type { PoolInput } from './pool-play';

export interface RefereeInput {
  matches: Match[];
  pools: PoolInput[];
  /** Every participant in the competition, for cross-pool fallback. */
  allParticipantIds: UUID[];
}

export interface RefereeOutput {
  matches: Match[];
  /** Matches left without a referee, flagged for manual assignment. */
  unassigned: UUID[];
  /** poolId -> participantId -> number of matches refereed. */
  refCounts: Record<UUID, Record<UUID, number>>;
}

/**
 * Assign a refereeing participant to every scheduled match.
 *
 * NOT IMPLEMENTED. Specification: `test/referees.test.ts`.
 *
 * Rules, from the Tournament Scheduler MVP spec:
 *   - a participant cannot referee while playing in the same timeslot
 *   - prefer a referee from the same pool who is currently idle
 *   - balance load: minimise the variance of ref count within a pool
 *   - fall back to idle participants from other pools if needed
 *   - for odd-sized pools, prioritise the bye participant
 *
 * Audit finding H7: scoop's allocation was so unbalanced that in a 4-team
 * pool the fourth team never refereed at all. Balance is the requirement,
 * not a nice-to-have.
 */
export function assignReferees(_input: RefereeInput): RefereeOutput {
  throw new NotImplementedError('assignReferees', 'packages/scheduling/test/referees.test.ts');
}
