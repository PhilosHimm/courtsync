import type { Match, UUID } from '@courtsync/core';
import { NotImplementedError } from './errors';

export interface PoolInput {
  id: UUID;
  name: string;
  participantIds: UUID[];
}

export interface PoolPlayInput {
  competitionSlug: string;
  sessionId: UUID;
  pools: PoolInput[];
  courtIds: UUID[];
  timeslotIds: UUID[];
  /**
   * Minimum number of slots a participant should sit out between its own
   * matches. Soft constraint — the scheduler may violate it rather than
   * leave a match unassigned, but must minimise how often it does.
   */
  minRestSlots?: number;
}

export interface PoolPlayOutput {
  matches: Match[];
  /** Match ids that could not be placed on any court/timeslot. */
  unassigned: UUID[];
}

/**
 * Generate round-robin pool play and place it on the court x timeslot grid.
 *
 * NOT IMPLEMENTED. Specification: `test/pool-play.test.ts`.
 *
 * Port the algorithm from the `Volleyball-tournament-scheduler` repo
 * (`src/utils/scheduling.ts`), NOT from scoopvolleyball — scoop's
 * `schedule-template.ts` is the version audit findings H6 and H10 condemn.
 */
export function generatePoolPlay(_input: PoolPlayInput): PoolPlayOutput {
  throw new NotImplementedError('generatePoolPlay', 'packages/scheduling/test/pool-play.test.ts');
}
