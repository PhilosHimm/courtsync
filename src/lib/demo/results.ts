import type { Match, MatchSet, SetRule } from '@/lib/core';
import { PLAYOFF_SETS, POOL_PLAY_SETS, setsWon, totalPoints } from '@/lib/core';

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
 * A losing score for one set: behind by at least `winBy`, never above `cap`.
 *
 * `POOL_PLAY_SETS` and `PLAYOFF_SETS` were declared in core and read by
 * absolutely nothing — a scoring format that looked configurable and was not.
 * Generating from them makes editing those constants a real customization,
 * and means the demo cannot drift into scorelines the stated format forbids.
 */
function losingScore(rule: SetRule, h: number): { win: number; lose: number } {
  const win = rule.cap === null ? rule.target : Math.min(rule.target, rule.cap);
  return { win, lose: Math.max(0, win - rule.winBy - (h % 8)) };
}

/** One set, with the winner on the side `winner` names. */
function ruledSet(matchId: string, n: number, rule: SetRule, winner: Outcome, h: number): MatchSet {
  const { win, lose } = losingScore(rule, h);
  return winner === 'home' ? set(matchId, n, win, lose) : set(matchId, n, lose, win);
}

/** The same, over whatever set rules the caller is playing to. */
export function poolSetsFor(
  matchId: string,
  winner: Outcome,
  rules: readonly SetRule[],
): MatchSet[] {
  const h = hash(matchId);
  const [first, second] = rules;
  if (!first || !second) return [];

  if (h % 5 === 0) {
    // The winner takes set one and drops set two, and must still be ahead on
    // total points — that total is the only thing deciding the match.
    //
    // The margin cannot simply be "one better than the set you lost". Two sets
    // played to different targets shift the totals by the difference between
    // them, and the naive margin then hands the match to the other side: sets
    // to 21 and 25 gave the designated winner 40 against 43. Solve for the
    // score that actually wins, and fall back to a clean two-set win when the
    // rules leave no room for one.
    const dropped = first.target - (first.winBy + 1 + (h % 4));
    const needed = dropped + (second.target - first.target) + 1;
    const highest = second.target - second.winBy;

    if (needed <= highest && needed >= 0) {
      const clawedBack = Math.min(Math.max(needed, dropped + 1), highest);
      return winner === 'home'
        ? [set(matchId, 1, first.target, dropped), set(matchId, 2, clawedBack, second.target)]
        : [set(matchId, 1, dropped, first.target), set(matchId, 2, second.target, clawedBack)];
    }
  }

  return [ruledSet(matchId, 1, first, winner, h), ruledSet(matchId, 2, second, winner, h >>> 3)];
}

/**
 * Two sets, sometimes split 1-1, on the pool preset.
 *
 * A split is not padding. Pool play here is two sets with no decider, so a
 * 1-1 match is settled on total points across both — `computeStandings` does
 * that and defaults to it, and a demo where every match is a clean 2-0 never
 * shows the rule working.
 */
export function poolSets(matchId: string, winner: Outcome): MatchSet[] {
  return poolSetsFor(matchId, winner, POOL_PLAY_SETS);
}

/**
 * Best of three, on the playoff preset.
 *
 * Always decisive in sets. `advanceBracket` throws on an elimination match
 * that ends level — correctly, since there is no such thing — and the demo
 * must never hand it one.
 */
export function playoffSets(matchId: string, winner: Outcome): MatchSet[] {
  const h = hash(matchId);
  const [first, second, decider] = PLAYOFF_SETS;
  if (!first || !second) return [];

  if (h % 3 === 0 && decider) {
    // Dropped the second set, took the decider.
    return [
      ruledSet(matchId, 1, first, winner, h),
      ruledSet(matchId, 2, second, opposite(winner), h >>> 3),
      ruledSet(matchId, 3, decider, winner, h >>> 7),
    ];
  }

  return [ruledSet(matchId, 1, first, winner, h), ruledSet(matchId, 2, second, winner, h >>> 5)];
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
