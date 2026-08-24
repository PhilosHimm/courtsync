import type { Match, Standing, UUID } from '@courtsync/core';
import { NotImplementedError } from './errors';
import type { BracketSlot } from './match-ids';

export interface SeedingInput {
  competitionSlug: string;
  sessionId: UUID;
  /** Standings per pool, keyed by pool id. */
  standingsByPool: Record<UUID, Standing[]>;
  /** e.g. `['gold']` or `['gold', 'silver']`. */
  tiers: string[];
}

export interface SeededMatch {
  matchId: string;
  tier: string;
  slot: BracketSlot;
  homeParticipantId: UUID | null;
  awayParticipantId: UUID | null;
}

/**
 * Seed playoff brackets from pool standings.
 *
 * NOT IMPLEMENTED. Specification: `test/seeding.test.ts`.
 *
 * Audit findings this must not reproduce:
 *   - H8: two contradictory seeding implementations produced different
 *     brackets from the same standings. There is exactly one here.
 *   - H9: seeding ignored actual records when ranking across pools, and
 *     ties broke nondeterministically.
 *   - C3: ids must come from `playoffMatchId`, never string concatenation.
 */
export function seedBrackets(_input: SeedingInput): SeededMatch[] {
  throw new NotImplementedError('seedBrackets', 'packages/scheduling/test/seeding.test.ts');
}

export interface AdvanceInput {
  competitionSlug: string;
  tier: string;
  matches: Match[];
}

/**
 * Advance winners from completed bracket matches into the next round.
 *
 * NOT IMPLEMENTED. Specification: `test/seeding.test.ts`.
 *
 * Audit findings this must not reproduce:
 *   - H14: advancement was one-way, so correcting a quarterfinal score
 *     never updated the semifinal that had already been populated.
 *   - H15: a tied playoff match deadlocked the bracket silently. A tie in
 *     an elimination match is invalid input and must raise, not be ignored.
 */
export function advanceBracket(_input: AdvanceInput): Match[] {
  throw new NotImplementedError('advanceBracket', 'packages/scheduling/test/seeding.test.ts');
}
