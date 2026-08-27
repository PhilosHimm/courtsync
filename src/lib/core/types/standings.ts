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
  pointDifferential: number;
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
