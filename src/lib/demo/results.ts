import type { Match, MatchSet } from '@/lib/core';
import { setsWon, totalPoints } from '@/lib/core';

/**
 * Scorelines for the demo, invented deterministically.
 *
 * The engine is pure and the demo has to stay that way, so results cannot
 * come from `Math.random()` — not because the demo is load-bearing, but
 * because a copied link has to show the person who opens it exactly what the
 * person who sent it saw. A hash of the match id gives that: stable across
 * reloads, across machines, and across a rebuild.
 *
 * `Record<matchId, Outcome>` on top is the part a visitor drives. Flipping a
 * result is the single most important thing to be able to try, because it is
 * the thing organizers actually do — a score goes in wrong and is corrected
 * ten minutes later, and audit finding H14 was a bracket that kept the first
 * answer. Here the whole state is recomputed from the flip, which is what
 * `advanceBracket` is built to survive.
 */

export type Outcome = 'home' | 'away';

/** Winners a visitor has overridden by hand, keyed by match id. */
export type Outcomes = Readonly<Record<string, Outcome>>;

/** FNV-1a, 32-bit. Small, stable, and not a random number generator. */
export function hash(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Who wins when nobody has said otherwise. */
export function defaultOutcome(matchId: string): Outcome {
  return hash(matchId) % 2 === 0 ? 'home' : 'away';
}

export function outcomeOf(matchId: string, overrides: Outcomes): Outcome {
  return overrides[matchId] ?? defaultOutcome(matchId);
}

export const opposite = (outcome: Outcome): Outcome => (outcome === 'home' ? 'away' : 'home');

/**
 * Turn a list of corrected match ids into overrides.
 *
 * A correction is stored as "this one went the other way" rather than as
 * "home won this one", so the link carries ids alone and there is no second
 * copy of the result to fall out of step with the first.
 */
export function outcomesFromFlips(matchIds: readonly string[]): Outcomes {
  return Object.fromEntries(matchIds.map((id) => [id, opposite(defaultOutcome(id))]));
}

function set(matchId: string, setNumber: number, homePoints: number, awayPoints: number): MatchSet {
  return { id: `${matchId}-set-${setNumber}`, matchId, setNumber, homePoints, awayPoints };
}

/**
 * Two sets, sometimes split 1-1.
 *
 * A split is not padding. Pool play here is two sets with no decider, so a
 * 1-1 match is settled on total points across both — `computeStandings` does
 * that and defaults to it, and a demo where every match is a clean 2-0 never
 * shows the rule working.
 */
export function poolSets(matchId: string, winner: Outcome): MatchSet[] {
  const h = hash(matchId);
  const homeWins = winner === 'home';

  if (h % 5 === 0) {
    const lost = 12 + (h % 4);
    const clawedBack = lost + 3 + (h % 3);
    return homeWins
      ? [set(matchId, 1, 21, lost), set(matchId, 2, clawedBack, 21)]
      : [set(matchId, 1, lost, 21), set(matchId, 2, 21, clawedBack)];
  }

  const first = 14 + (h % 6);
  const second = 11 + ((h >>> 3) % 8);
  return homeWins
    ? [set(matchId, 1, 21, first), set(matchId, 2, 21, second)]
    : [set(matchId, 1, first, 21), set(matchId, 2, second, 21)];
}

/**
 * Best of three, to 25 and 25 and 15.
 *
 * Always decisive in sets. `advanceBracket` throws on an elimination match
 * that ends level — correctly, since there is no such thing — and the demo
 * must never hand it one.
 */
export function playoffSets(matchId: string, winner: Outcome): MatchSet[] {
  const h = hash(matchId);
  const homeWins = winner === 'home';
  const w = (points: number, against: number): [number, number] =>
    homeWins ? [points, against] : [against, points];

  if (h % 3 === 0) {
    // Dropped the second set, took the decider.
    const [h1, a1] = w(25, 19 + (h % 5));
    const [h2, a2] = w(21 + (h % 3), 25);
    const [h3, a3] = w(15, 9 + (h % 6));
    return [set(matchId, 1, h1, a1), set(matchId, 2, h2, a2), set(matchId, 3, h3, a3)];
  }

  const [h1, a1] = w(25, 17 + (h % 7));
  const [h2, a2] = w(25, 15 + ((h >>> 5) % 9));
  return [set(matchId, 1, h1, a1), set(matchId, 2, h2, a2)];
}

/**
 * Who a screen should show as having won this match.
 *
 * This exists because a 1-1 pool match has no winner on sets and does have
 * one in the table: pool play is two sets with no decider, so a split goes to
 * whoever scored more across both, and `computeStandings` defaults to exactly
 * that. A board that bolded on sets alone would leave those matches looking
 * undecided while the standings above them quietly awarded the win — the
 * table and the match would be telling a reader two different stories.
 *
 * `splitByTotalPoints` is false for bracket matches, where the rule does not
 * apply. It never matters in practice, since `playoffSets` is always decisive
 * on sets, but passing the flag keeps the display honest about which
 * competition's rules it is showing rather than relying on that.
 */
export function winnerSide(match: Match, splitByTotalPoints = true): Outcome | null {
  const sets = setsWon(match);
  if (sets.home > sets.away) return 'home';
  if (sets.away > sets.home) return 'away';
  if (!splitByTotalPoints || match.sets.length === 0) return null;

  const points = totalPoints(match);
  if (points.home > points.away) return 'home';
  if (points.away > points.home) return 'away';
  return null;
}

/**
 * Put a result on a match. Never mutates the input (rule 10) and leaves a
 * match with a missing side alone — a bracket bye has no score to record.
 */
export function play(match: Match, overrides: Outcomes, kind: 'pool' | 'playoff'): Match {
  if (!match.homeParticipantId || !match.awayParticipantId) return { ...match };
  const winner = outcomeOf(match.id, overrides);
  const sets = kind === 'pool' ? poolSets(match.id, winner) : playoffSets(match.id, winner);
  return { ...match, status: 'final', sets };
}
