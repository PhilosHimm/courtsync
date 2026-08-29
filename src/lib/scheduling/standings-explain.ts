import type { Match, Standing, Tiebreaker, UUID } from '@/lib/core';
import { setsWon, totalPoints } from '@/lib/core';

/**
 * Why one team is above another.
 *
 * A standings table asserts an order and never justifies it. That is fine
 * until two teams are 3-1 and one of them is going to the gold bracket, at
 * which point the only question anyone at the scorer's table is asking is
 * "why them?" — and the honest answer lives in a comparator nobody reading
 * the table can see.
 *
 * `computeStandings` applies win percentage, then head-to-head, then set
 * differential, then point differential, then a stable key. This reports
 * which of those actually settled each adjacent pair, so the table can say
 * it out loud.
 *
 * Deliberately a separate function rather than a field on `Standing`.
 * Standings are computed on read and never stored (rule 1), and a reason is
 * a property of a *pair* of rows rather than of a row — the same team is
 * ahead of the one below it on head-to-head and behind the one above it on
 * points. Folding that into `Standing` would put two different claims in one
 * field.
 */

/**
 * The stable last resort. `computeStandings` falls back to participant id
 * when every real tiebreaker ties, precisely so a re-seed produces the same
 * bracket (H9). It is not a sporting reason and must never be presented as
 * one.
 */
export type SettledBy = Tiebreaker | 'participantId';

export interface StandingsExplainInput {
  /** The table exactly as `computeStandings` returned it. Order is read, never re-derived. */
  standings: readonly Standing[];
  /** The same matches the standings were computed from — head-to-head is re-derived from these. */
  matches: readonly Match[];
  /** Must match what `computeStandings` was given, or head-to-head will disagree with it. */
  splitSetsDecidedByTotalPoints?: boolean;
}

export interface StandingExplanation {
  participantId: UUID;
  rank: number;
  /** The row immediately below this one. Null for the last row, which is ahead of nobody. */
  aheadOf: UUID | null;
  /** Which tiebreaker separated this row from the one below. Null for the last row. */
  settledBy: SettledBy | null;
  /**
   * One line an organizer can read out. Never invents a reason: a pair
   * separated only by the stable key says so rather than dressing it up as
   * a sporting result.
   */
  summary: string;
}

/**
 * Explain each row against the one below it.
 *
 * Returns one entry per standing, in the order given. The last row's
 * `settledBy` is null — there is nobody below it to be ahead of.
 */
export function explainStandings(input: StandingsExplainInput): StandingExplanation[] {
  const { standings, matches } = input;
  const splitByTotalPoints = input.splitSetsDecidedByTotalPoints ?? true;
  const headToHead = headToHeadWins(matches, splitByTotalPoints);

  return standings.map((row, index) => {
    const below = standings[index + 1];
    if (!below) {
      return {
        participantId: row.participantId,
        rank: row.rank,
        aheadOf: null,
        settledBy: null,
        summary: standings.length === 1 ? 'The only team in this table.' : 'Bottom of the table.',
      };
    }

    const settledBy = separates(row, below, headToHead);
    return {
      participantId: row.participantId,
      rank: row.rank,
      aheadOf: below.participantId,
      settledBy,
      summary: describe(row, below, settledBy, headToHead),
    };
  });
}

/** `wins.get(a)?.get(b)` — how many decided matches `a` took off `b`. */
function headToHeadWins(
  matches: readonly Match[],
  splitByTotalPoints: boolean,
): Map<UUID, Map<UUID, number>> {
  const wins = new Map<UUID, Map<UUID, number>>();
  for (const match of matches) {
    // The same filter computeStandings applies. Anything looser would count a
    // match it did not, and the explanation would stop matching the table.
    if (match.status !== 'final' && match.status !== 'forfeit') continue;
    const home = match.homeParticipantId;
    const away = match.awayParticipantId;
    if (!home || !away) continue;

    const sets = setsWon(match);
    let winner: UUID | null = null;
    if (sets.home > sets.away) winner = home;
    else if (sets.away > sets.home) winner = away;
    else if (splitByTotalPoints && match.sets.length > 0) {
      const points = totalPoints(match);
      if (points.home > points.away) winner = home;
      else if (points.away > points.home) winner = away;
    }
    if (!winner) continue;

    const loser = winner === home ? away : home;
    const row = wins.get(winner) ?? new Map<UUID, number>();
    row.set(loser, (row.get(loser) ?? 0) + 1);
    wins.set(winner, row);
  }
  return wins;
}

/**
 * The first criterion that actually differs, in the order `computeStandings`
 * applies them. Mirrors that comparator deliberately — the suite checks the
 * claim against the numbers on every pair, so a divergence fails there rather
 * than being believed on a screen.
 */
function separates(
  above: Standing,
  below: Standing,
  headToHead: Map<UUID, Map<UUID, number>>,
): SettledBy {
  if (above.winPercentage !== below.winPercentage) return 'winPercentage';

  const aboveOverBelow = headToHead.get(above.participantId)?.get(below.participantId) ?? 0;
  const belowOverAbove = headToHead.get(below.participantId)?.get(above.participantId) ?? 0;
  if (aboveOverBelow !== belowOverAbove) return 'headToHead';

  if (above.setDifferential !== below.setDifferential) return 'setDifferential';
  if (above.pointDifferential !== below.pointDifferential) return 'pointDifferential';
  return 'participantId';
}

/** Signed differentials read better with the sign shown: +3 rather than 3. */
const signed = (n: number): string => (n > 0 ? `+${n}` : String(n));

function describe(
  above: Standing,
  below: Standing,
  settledBy: SettledBy,
  headToHead: Map<UUID, Map<UUID, number>>,
): string {
  const them = below.participantName;
  switch (settledBy) {
    case 'winPercentage':
      return `Ahead of ${them} on record, ${above.wins}-${above.losses} to ${below.wins}-${below.losses}.`;
    case 'headToHead': {
      const won = headToHead.get(above.participantId)?.get(below.participantId) ?? 0;
      const lost = headToHead.get(below.participantId)?.get(above.participantId) ?? 0;
      return `Level with ${them} on record; ahead on head-to-head, ${won}-${lost}.`;
    }
    case 'setDifferential':
      return `Level with ${them} on record; ahead on set differential, ${signed(above.setDifferential)} to ${signed(below.setDifferential)}.`;
    case 'pointDifferential':
      return `Level with ${them} on record and sets; ahead on point differential, ${signed(above.pointDifferential)} to ${signed(below.pointDifferential)}.`;
    case 'participantId':
      // No sporting reason exists. Saying so is the point: dressing the
      // stable key up as a result would be inventing one.
      return `Tied with ${them} on every tiebreaker. Ordered by a stable key so the table does not shuffle between refreshes.`;
  }
}

/** One row's movement between two computations of the same table. */
export interface StandingMovement {
  participantId: UUID;
  /** Rank in the earlier table, or null if the participant was not in it. */
  previousRank: number | null;
  currentRank: number;
  /** Negative means it climbed — rank 4 to rank 2 is -2. Null for a new entry. */
  change: number | null;
}

/**
 * Which rows moved between two standings tables.
 *
 * "Did that put us through?" is the question actually being asked courtside
 * after a result lands, and a table that silently reorders itself does not
 * answer it. The caller holds the previous table; this compares them.
 */
export function standingsMovement(
  previous: readonly Standing[],
  current: readonly Standing[],
): StandingMovement[] {
  const previousRanks = new Map<UUID, number>(previous.map((row) => [row.participantId, row.rank]));

  return current.map((row) => {
    const previousRank = previousRanks.get(row.participantId);
    // A participant who was not in the earlier table did not climb from
    // anywhere. Reporting that as a jump of several places would be
    // inventing a result.
    if (previousRank === undefined) {
      return {
        participantId: row.participantId,
        previousRank: null,
        currentRank: row.rank,
        change: null,
      };
    }
    return {
      participantId: row.participantId,
      previousRank,
      currentRank: row.rank,
      change: row.rank - previousRank,
    };
  });
}
