import type { Match, MatchSet } from '@/lib/core';
import { setsWon, totalPoints } from '@/lib/core';
import type { StoredResult, StoredResults, StoredSetScore } from '@/lib/storage';

/**
 * Recorded results, validated on the way in and reconciled on the way out.
 *
 * The schedule is derived from setup on every read; only results are stored,
 * keyed by the engine-minted match id. That makes reconciliation the critical
 * move: when setup changes, the schedule regenerates, and a stored result is
 * applied to a match only if the id still exists *and* still pairs the same
 * two participants. Anything else is ignored — a score silently reattached
 * to a different pairing is worse than a score dropped.
 */

export type MatchKind = 'pool' | 'playoff';

/** Why a proposed scoreline cannot be saved, in the organizer's words. */
export function resultProblem(sets: readonly StoredSetScore[], kind: MatchKind): string | null {
  if (sets.length === 0) return 'Enter at least one set.';
  const max = kind === 'pool' ? 2 : 3;
  if (sets.length > max) {
    return kind === 'pool' ? 'Pool play is two sets.' : 'A playoff match is best of three.';
  }
  for (const [i, set] of sets.entries()) {
    if (!Number.isInteger(set.home) || !Number.isInteger(set.away)) {
      return `Set ${i + 1} needs whole numbers.`;
    }
    if (set.home < 0 || set.away < 0) return `Set ${i + 1} cannot have negative points.`;
    if (set.home === set.away) return `Set ${i + 1} is level — a set has a winner.`;
  }

  if (kind === 'playoff') {
    let home = 0;
    let away = 0;
    for (const set of sets) {
      if (set.home > set.away) home += 1;
      else away += 1;
    }
    // `advanceBracket` refuses an elimination match that ends level in sets,
    // correctly — there is no such thing. Refuse it at entry instead of at
    // render.
    if (home === away) return 'An elimination match must be decided in sets — add the decider.';
    if (Math.max(home, away) < 2) return 'Best of three: someone has to take two sets.';
  }

  return null;
}

/**
 * A stored result for this match, given the sets as entered.
 *
 * `recordedAt` is passed in rather than read from a clock here — the caller
 * (an event handler) owns the timestamp; this transform stays pure.
 */
export function buildResult(
  match: Match,
  sets: StoredSetScore[],
  recordedAt: string,
): StoredResult {
  if (!match.homeParticipantId || !match.awayParticipantId) {
    throw new Error(`Match ${match.id} has no participants to record a result for.`);
  }
  return {
    matchId: match.id,
    homeParticipantId: match.homeParticipantId,
    awayParticipantId: match.awayParticipantId,
    sets: sets.map((set) => ({ home: set.home, away: set.away })),
    recordedAt,
  };
}

/** Whether this stored result still describes this match. */
export function resultApplies(result: StoredResult, match: Match): boolean {
  return (
    result.homeParticipantId === match.homeParticipantId &&
    result.awayParticipantId === match.awayParticipantId
  );
}

function toMatchSets(matchId: string, sets: readonly StoredSetScore[]): MatchSet[] {
  return sets.map((set, i) => ({
    id: `${matchId}-set-${i + 1}`,
    matchId,
    setNumber: i + 1,
    homePoints: set.home,
    awayPoints: set.away,
  }));
}

/**
 * The match with its recorded result applied, or the match untouched when no
 * applicable result exists. Never mutates its input (rule 10).
 */
export function applyResult(match: Match, results: StoredResults): Match {
  const result = results[match.id];
  if (!result || !resultApplies(result, match)) return match;
  return { ...match, status: 'final', sets: toMatchSets(match.id, result.sets) };
}

/**
 * Who a screen should show as having won this match.
 *
 * A 1–1 pool match has no winner on sets but does have one in the table when
 * splits are decided on total points. A board bolding on sets alone would
 * leave those matches looking undecided while the standings had already
 * awarded the win — pass the rule the standings are computed under.
 */
export function winnerSide(match: Match, splitByTotalPoints: boolean): 'home' | 'away' | null {
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
 * The subset of `results` that still attaches to a match in `matches`.
 * Run after a setup edit to drop scores whose games no longer exist.
 */
export function reconcileResults(results: StoredResults, matches: readonly Match[]): StoredResults {
  const byId = new Map(matches.map((match) => [match.id, match]));
  const kept: StoredResults = {};
  for (const [matchId, result] of Object.entries(results)) {
    const match = byId.get(matchId);
    if (match && resultApplies(result, match)) kept[matchId] = result;
  }
  return kept;
}
