import type { UUID } from './ids';

/**
 * A computed row in a standings table.
 *
 * ALWAYS derived from matches, NEVER stored. There is no `standings` table
 * in the schema and there should not be one. See the note on `Participant`.
 */
export interface Standing {
  participantId: UUID;
  participantName: string;
  wins: number;
  losses: number;
  winPercentage: number;
  setsWon: number;
  setsLost: number;
  setDifferential: number;
  pointsFor: number;
  pointsAgainst: number;
  /**
   * `pointsFor - pointsAgainst`, plus `pointAdjustment`.
   *
   * The adjustment is folded in here rather than left for a caller to apply,
   * because this is the field the tiebreakers and `seedBrackets` read. A
   * penalty that a standings table showed but a bracket ignored would be two
   * rankings from one set of results, which is H8 by another route.
   */
  pointDifferential: number;
  /**
   * The organizer's ruling on top of the scores, signed. Zero unless
   * `computeStandings` was given an adjustment for this participant.
   *
   * Reported separately so a table can show the penalty as its own column
   * rather than burying it in a differential nobody can check against a
   * scoresheet. It is an INPUT to the computation, never a stored column on
   * the participant — see the note on `Participant`.
   */
  pointAdjustment: number;
  /** 1-based, after all tiebreakers are applied. */
  rank: number;
}

/**
 * Tiebreakers in the order they are applied, from the Tournament Scheduler
 * MVP spec.
 *
 * `headToHead` sits second deliberately. Audit finding H9: scoop's seeding
 * ignored actual records across pools and fell back to a nondeterministic
 * comparison, so re-running the seed produced different brackets. Every
 * step here must be deterministic — including the last one.
 */
export const TIEBREAKER_ORDER = [
  'winPercentage',
  'headToHead',
  'setDifferential',
  'pointDifferential',
] as const;

export type Tiebreaker = (typeof TIEBREAKER_ORDER)[number];

/**
 * When every tiebreaker ties, order by this rather than by `Math.random()`
 * or insertion order. A stable, arbitrary-but-reproducible key keeps the
 * bracket identical across re-seeds, which is what H9 was actually about.
 */
export type FinalTiebreak = 'participantId';

/**
 * What a forfeit contributes beyond the win and the loss.
 *
 * Lives in core rather than beside `computeStandings` because it is now a
 * stored per-competition setting (`competition.forfeit_policy`) as well as a
 * scheduling input, and core may not import scheduling. The scheduling
 * package re-exports it, so existing imports are unaffected.
 *
 * - `setsOnly` (default) — the sets recorded count, the points do not. M5:
 *   a fabricated forfeit scoreline swung the only tiebreaker that mattered.
 * - `winOnly` — neither sets nor points count.
 * - `asScored` — both count, for an organizer recording a real 25-0.
 */
export type ForfeitPolicy = 'setsOnly' | 'winOnly' | 'asScored';

export const FORFEIT_POLICIES: readonly ForfeitPolicy[] = [
  'setsOnly',
  'winOnly',
  'asScored',
] as const;
