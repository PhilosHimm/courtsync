/**
 * Canonical match id construction.
 *
 * IMPLEMENTED — this is the fix for audit finding C3.
 *
 * scoop had three code paths that created playoff matches and each invented
 * a different id scheme: the wizard produced `slug-gold-q1`, the CSV import
 * produced `slug-q1` with no tier segment, and the seed script produced
 * `slug-m13`. The seeder only ever looked for the first form, so imported
 * brackets silently never populated — and because the update affected zero
 * rows without raising, nothing ever reported the failure.
 *
 * Every producer AND every consumer must go through these helpers. Do not
 * build a match id with string concatenation anywhere else.
 */

export type BracketSlot = 'q1' | 'q2' | 'q3' | 'q4' | 's1' | 's2' | 'final' | 'consolation';

export const BRACKET_SLOTS: readonly BracketSlot[] = [
  'q1',
  'q2',
  'q3',
  'q4',
  's1',
  's2',
  'final',
  'consolation',
] as const;

/** `spring-open-gold-q1` */
export function playoffMatchId(competitionSlug: string, tier: string, slot: BracketSlot): string {
  return `${competitionSlug}-${tier}-${slot}`;
}

/** `spring-open-pool-a-3` — 1-based index within the pool. */
export function poolMatchId(competitionSlug: string, poolName: string, index: number): string {
  return `${competitionSlug}-pool-${poolName.toLowerCase()}-${index}`;
}

/** `tuesday-night-wk3-2` — 1-based index within the session. */
export function leagueMatchId(
  competitionSlug: string,
  sessionSequence: number,
  index: number,
): string {
  return `${competitionSlug}-wk${sessionSequence}-${index}`;
}

/** `thursday-dropin-s1-4` — 1-based index within the session. */
export function dropInMatchId(
  competitionSlug: string,
  sessionSequence: number,
  index: number,
): string {
  return `${competitionSlug}-s${sessionSequence}-${index}`;
}

/**
 * Assert that a write touched exactly the rows it intended to.
 *
 * The other half of C3: `writeAssignments` never checked rowcount, so four
 * UPDATEs affecting zero rows raised nothing and the bracket silently stayed
 * at TBD on every subsequent score entry. Call this after any bulk write
 * whose row count is known in advance.
 */
export function assertRowsAffected(expected: number, actual: number, operation: string): void {
  if (expected !== actual) {
    throw new Error(
      `${operation} expected to affect ${expected} row(s) but affected ${actual}. ` +
        'This usually means an id scheme mismatch — see packages/scheduling/src/match-ids.ts.',
    );
  }
}
