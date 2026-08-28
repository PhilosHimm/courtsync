export const COURTSYNC_APP_NAME = 'CourtSync';

/** Default match pacing, from the Tournament Scheduler MVP spec. */
export const DEFAULT_GAME_DURATION_MIN = 45;
export const DEFAULT_BUFFER_MIN = 5;

/**
 * Scoring presets, carried over from the Tournament Scheduler MVP spec.
 *
 * Pool play and playoffs use genuinely different rules, which is why a match
 * needs `MatchSet[]` rather than one score pair.
 */
export interface SetRule {
  /** Points needed to win the set. */
  target: number;
  /** Must win by this margin. */
  winBy: number;
  /** Hard ceiling; `null` means play on until `winBy` is satisfied. */
  cap: number | null;
}

export const POOL_PLAY_SETS: readonly SetRule[] = [
  { target: 21, winBy: 2, cap: 25 },
  { target: 21, winBy: 2, cap: 25 },
] as const;

export const PLAYOFF_SETS: readonly SetRule[] = [
  { target: 25, winBy: 2, cap: null },
  { target: 25, winBy: 2, cap: null },
  { target: 15, winBy: 2, cap: null },
] as const;

/**
 * Pool play is two sets with no decider. If sets split 1-1 the match winner
 * is whoever scored more total points across both sets.
 */
export const POOL_PLAY_ALLOWS_DRAWN_SETS = true;

/**
 * The `Match.roundLabel` every pool-play match carries.
 *
 * A constant rather than a string literal because the label is a filter key,
 * not decoration: anything asking "which matches are pool play" compares
 * against it exactly, and the predecessor shipped a standings query filtering
 * on `round = 'Pool Play'` beside seed data that wrote `Pool A`. The query
 * matched nothing, returned no rows, and the standings simply came out empty
 * — no error, no zero, just a table that was never populated.
 *
 * Producers and consumers both use this. Do not type the string.
 */
export const POOL_PLAY_ROUND_LABEL = 'Pool Play';

/** Bracket tiers, in seeding order. */
export const BRACKET_TIERS = ['gold', 'silver', 'bronze'] as const;
export type BracketTier = (typeof BRACKET_TIERS)[number];

/** Pool sizing bounds used by the auto-pooling heuristic. */
export const MIN_TEAMS_PER_POOL = 3;
export const MAX_TEAMS_PER_POOL = 8;
export const PREFERRED_POOL_SIZES = [4, 5, 6] as const;
