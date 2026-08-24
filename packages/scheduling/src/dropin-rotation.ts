import type { Attendance, Match, UUID } from '@courtsync/core';
import { NotImplementedError } from './errors';

export interface DropInRotationInput {
  competitionSlug: string;
  sessionId: UUID;
  sessionSequence: number;
  /** Only `checked_in` entries should be placed. */
  attendance: Attendance[];
  courtIds: UUID[];
  timeslotIds: UUID[];
  /** Players per side. 6 for indoor, 2 for beach, 4 for common rec formats. */
  playersPerSide: number;
}

export interface DropInSide {
  participantIds: UUID[];
}

export interface DropInRotationOutput {
  matches: Match[];
  /** Sides formed for each match, in match order. */
  sides: Array<{ matchId: string; home: DropInSide; away: DropInSide }>;
  /** Players sitting out each timeslot, in timeslot order. */
  sittingOut: Record<UUID, UUID[]>;
}

export interface WaitlistPromotion {
  participantId: UUID;
  fromPosition: number;
}

/**
 * Build a rotation for a drop-in night.
 *
 * NOT IMPLEMENTED. Specification: `test/dropin-rotation.test.ts`.
 *
 * This is the format with no prior art in any of the source repos, and the
 * one most likely to reveal that the model is wrong. Requirements:
 *   - only checked-in players are placed
 *   - court time is shared as evenly as the numbers allow
 *   - nobody sits out twice before everyone has sat out once
 *   - sides are reshuffled between timeslots rather than fixed for the night
 */
export function generateDropInRotation(_input: DropInRotationInput): DropInRotationOutput {
  throw new NotImplementedError(
    'generateDropInRotation',
    'packages/scheduling/test/dropin-rotation.test.ts',
  );
}

/**
 * Promote waitlisted players into a session when capacity frees up.
 *
 * NOT IMPLEMENTED. Specification: `test/dropin-rotation.test.ts`.
 *
 * Must promote strictly in waitlist order and renumber the remainder so
 * positions stay contiguous from 1.
 */
export function promoteFromWaitlist(
  _attendance: Attendance[],
  _capacity: number,
): { promoted: WaitlistPromotion[]; attendance: Attendance[] } {
  throw new NotImplementedError(
    'promoteFromWaitlist',
    'packages/scheduling/test/dropin-rotation.test.ts',
  );
}
