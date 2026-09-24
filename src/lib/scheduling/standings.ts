import type { ForfeitPolicy, Match, Participant, Standing, Tiebreaker, UUID } from '@/lib/core';
import { setsWon, TIEBREAKER_ORDER, totalPoints } from '@/lib/core';

export interface StandingsInput {
  participants: Participant[];
  matches: Match[];
  /**
   * Pool play scores a 1-1 set split by total points. Playoffs do not.
   * Defaults to true.
   */
  splitSetsDecidedByTotalPoints?: boolean;
  /**
   * Signed point adjustments the organizer has ruled, by participant id.
   *
   * A tournament's rules sheet carries penalties the scores do not — the one
   * this exists for is "a reffing team that does not start or end its match
   * on time loses five points off its differential". Applying that by hand to
   * a printed table is how a bracket gets seeded off a number nobody can
   * reproduce.
   *
   * It is an input, not a column: standings are computed on read and never
   * stored (rule 1), so clearing a penalty is deleting a key and leaves no
   * trace anywhere. That is deliberate — an organizer who penalizes the wrong
   * team at 11am has to be able to take it back at 11:01.
   *
   * Only `pointDifferential` moves. Wins, sets, `pointsFor` and
   * `pointsAgainst` stay as what was actually played, so every number on the
   * table can still be checked against a scoresheet.
   */
  pointAdjustments?: Readonly<Record<UUID, number>>;
  /**
   * What a forfeit contributes beyond the win and the loss.
   *
   * Tournaments genuinely differ here and it is usually written on the rules
   * sheet, so it is the organizer's call rather than the engine's:
   *
   * - `setsOnly` (default) — the sets recorded on the match count, the points
   *   do not. Audit finding M5: a fabricated forfeit scoreline swung the only
   *   tiebreaker that mattered, so points from a match nobody played stay out.
   * - `winOnly` — neither sets nor points count. Nobody gains a differential
   *   edge from an opponent's no-show, which is what an organizer means when
   *   they say a forfeit "shouldn't help anyone".
   * - `asScored` — both count, for an organizer who records a real 25-0 and
   *   wants it to read like any other result.
   *
   * The default reproduces the behaviour every existing suite was written
   * against. Changing it is a decision an organizer makes per event, never a
   * silent upgrade.
   */
  forfeitPolicy?: ForfeitPolicy;
  /**
   * The organizer's tiebreaker order, most significant first. Defaults to
   * `TIEBREAKER_ORDER`, under which the table is exactly what it was before
   * the order was configurable.
   *
   * Leaving `headToHead` out skips it — some formats deliberately do. The
   * participant-id key is always applied last and cannot be configured away:
   * it is what keeps a full tie resolving the same way on every run (H9), not
   * a sporting criterion an organizer chooses.
   */
  tiebreakerOrder?: readonly Tiebreaker[];
}

/**
 * Check an organizer's tiebreaker order and return it, or throw.
 *
 * Exported because the explanation must apply exactly the order the table
 * did, and a second validator would be a second definition of "valid".
 * Unknown names, duplicates and an empty list all throw rather than being
 * repaired: each is a data-entry slip, and silently fixing it would rank a
 * table by an order nobody wrote down.
 */
export function resolveTiebreakerOrder(order?: readonly Tiebreaker[]): readonly Tiebreaker[] {
  if (order === undefined) return TIEBREAKER_ORDER;
  if (order.length === 0) {
    throw new Error('A tiebreaker order needs at least one tiebreaker.');
  }
  const known = new Set<string>(TIEBREAKER_ORDER);
  const seen = new Set<string>();
  for (const tiebreaker of order) {
    if (!known.has(tiebreaker)) {
      throw new Error(
        `Unknown tiebreaker "${String(tiebreaker)}". Known: ${TIEBREAKER_ORDER.join(', ')}.`,
      );
    }
    if (seen.has(tiebreaker)) {
      throw new Error(`Tiebreaker "${tiebreaker}" appears more than once in the order.`);
    }
    seen.add(tiebreaker);
  }
  return [...order];
}

/**
 * How much of a forfeit reaches the table. See `StandingsInput.forfeitPolicy`.
 *
 * Defined in core, because it is a stored per-competition setting as well as
 * an input here. Re-exported so callers of this module are unaffected.
 */
export type { ForfeitPolicy } from '@/lib/core';
export { FORFEIT_POLICIES } from '@/lib/core';

interface Tally {
  wins: number;
  losses: number;
  setsWon: number;
  setsLost: number;
  pointsFor: number;
  pointsAgainst: number;
}

const emptyTally = (): Tally => ({
  wins: 0,
  losses: 0,
  setsWon: 0,
  setsLost: 0,
  pointsFor: 0,
  pointsAgainst: 0,
});

/** Which side took the match, or null when it is not decided. */
function outcomeOf(match: Match, splitByTotalPoints: boolean): 'home' | 'away' | null {
  const sets = setsWon(match);
  if (sets.home > sets.away) return 'home';
  if (sets.away > sets.home) return 'away';
  if (!splitByTotalPoints || match.sets.length === 0) return null;

  // Pool play is two sets with no decider: a 1-1 split goes to whoever
  // scored more across both. Equal totals leave the match genuinely drawn.
  const points = totalPoints(match);
  if (points.home > points.away) return 'home';
  if (points.away > points.home) return 'away';
  return null;
}

/**
 * Compute a standings table from matches.
 *
 * Standings are ALWAYS derived, never stored. There is no standings table.
 * Audit finding H9 was two failures at once: denormalized win/loss columns
 * that drifted away from the matches they summarized, and a comparison that
 * resolved a full tie differently on every run, so re-seeding a bracket
 * produced a different bracket.
 *
 * Tiebreakers, by default: win percentage, head-to-head, set differential,
 * point differential — or the organizer's `tiebreakerOrder` — then always
 * participant id, a stable, arbitrary-but-reproducible last resort, never
 * `Math.random()` and never insertion order.
 */
export function computeStandings(input: StandingsInput): Standing[] {
  const { participants, matches } = input;
  const splitByTotalPoints = input.splitSetsDecidedByTotalPoints ?? true;
  const forfeitPolicy = input.forfeitPolicy ?? 'setsOnly';
  const tiebreakers = resolveTiebreakerOrder(input.tiebreakerOrder);

  // Validated up front rather than where it is read. A NaN reaching the
  // comparator poisons every tiebreak it touches and sorts the table into an
  // order nothing can explain — the same class of failure as H9's
  // nondeterministic tie, and just as hard to see afterwards.
  const adjustments = input.pointAdjustments ?? {};
  for (const [participantId, value] of Object.entries(adjustments)) {
    if (!Number.isFinite(value)) {
      throw new Error(
        `Point adjustment for ${participantId} must be a finite number, got ${String(value)}.`,
      );
    }
  }

  const tallies = new Map<UUID, Tally>();
  for (const participant of participants) tallies.set(participant.id, emptyTally());

  // headToHead[a][b] = matches a won against b.
  const headToHead = new Map<UUID, Map<UUID, number>>();
  const recordWin = (winner: UUID, loser: UUID): void => {
    const row = headToHead.get(winner) ?? new Map<UUID, number>();
    row.set(loser, (row.get(loser) ?? 0) + 1);
    headToHead.set(winner, row);
  };

  for (const match of matches) {
    // Only decided matches count. A forfeit counts for the win and loss but
    // contributes no points: audit finding M5, where a fabricated forfeit
    // scoreline swung the only tiebreaker that mattered.
    if (match.status !== 'final' && match.status !== 'forfeit') continue;

    const home = match.homeParticipantId;
    const away = match.awayParticipantId;
    if (!home || !away) continue;

    const homeTally = tallies.get(home);
    const awayTally = tallies.get(away);
    if (!homeTally || !awayTally) continue;

    const forfeited = match.status === 'forfeit';
    const setsCount = !forfeited || forfeitPolicy !== 'winOnly';
    const pointsCount = !forfeited || forfeitPolicy === 'asScored';

    if (setsCount) {
      const sets = setsWon(match);
      homeTally.setsWon += sets.home;
      homeTally.setsLost += sets.away;
      awayTally.setsWon += sets.away;
      awayTally.setsLost += sets.home;
    }

    if (pointsCount) {
      const points = totalPoints(match);
      homeTally.pointsFor += points.home;
      homeTally.pointsAgainst += points.away;
      awayTally.pointsFor += points.away;
      awayTally.pointsAgainst += points.home;
    }

    const outcome = outcomeOf(match, splitByTotalPoints);
    if (outcome === 'home') {
      homeTally.wins += 1;
      awayTally.losses += 1;
      recordWin(home, away);
    } else if (outcome === 'away') {
      awayTally.wins += 1;
      homeTally.losses += 1;
      recordWin(away, home);
    }
  }

  const rows = participants.map((participant) => {
    const tally = tallies.get(participant.id) ?? emptyTally();
    const played = tally.wins + tally.losses;
    const pointAdjustment = adjustments[participant.id] ?? 0;
    return {
      participantId: participant.id,
      participantName: participant.name,
      wins: tally.wins,
      losses: tally.losses,
      winPercentage: played === 0 ? 0 : tally.wins / played,
      setsWon: tally.setsWon,
      setsLost: tally.setsLost,
      setDifferential: tally.setsWon - tally.setsLost,
      pointsFor: tally.pointsFor,
      pointsAgainst: tally.pointsAgainst,
      pointDifferential: tally.pointsFor - tally.pointsAgainst + pointAdjustment,
      pointAdjustment,
      rank: 0,
    } satisfies Standing;
  });

  /** Negative when `a` outranks `b` on this one criterion, zero when it ties. */
  const by = (tiebreaker: Tiebreaker, a: Standing, b: Standing): number => {
    switch (tiebreaker) {
      case 'winPercentage':
        return b.winPercentage - a.winPercentage;
      case 'headToHead': {
        // Pairwise, and in the default order deliberately above the
        // differentials: beating someone directly counts for more than a fat
        // margin elsewhere.
        const aOverB = headToHead.get(a.participantId)?.get(b.participantId) ?? 0;
        const bOverA = headToHead.get(b.participantId)?.get(a.participantId) ?? 0;
        return bOverA - aOverB;
      }
      case 'setDifferential':
        return b.setDifferential - a.setDifferential;
      case 'pointDifferential':
        return b.pointDifferential - a.pointDifferential;
    }
  };

  /** Negative when `a` outranks `b`. */
  const compare = (a: Standing, b: Standing): number => {
    for (const tiebreaker of tiebreakers) {
      const result = by(tiebreaker, a, b);
      if (result !== 0) return result;
    }
    return a.participantId < b.participantId ? -1 : a.participantId > b.participantId ? 1 : 0;
  };

  // Insertion sort rather than Array.prototype.sort. Pairwise head-to-head is
  // not transitive — three teams can beat each other in a cycle — and a
  // non-transitive comparator makes the built-in sort's output depend on its
  // internal algorithm. Sorting by hand keeps the result defined by this
  // code and identical on every engine and every run, which is the whole
  // point of H9.
  //
  // The rows start in participant-id order, not in the order they were
  // passed. When head-to-head forms a cycle the comparator cannot order the
  // cycle on its own, and the insertion sort's answer then depends on where
  // it started. Starting from input order meant the same results could seed
  // a different bracket depending on how a query happened to return the
  // participants — H9 by way of a missing ORDER BY.
  const sorted = [...rows].sort((a, b) =>
    a.participantId < b.participantId ? -1 : a.participantId > b.participantId ? 1 : 0,
  );
  for (let i = 1; i < sorted.length; i++) {
    const key = sorted[i];
    if (!key) continue;
    let j = i - 1;
    while (j >= 0) {
      const current = sorted[j];
      if (!current || compare(current, key) <= 0) break;
      sorted[j + 1] = current;
      j -= 1;
    }
    sorted[j + 1] = key;
  }

  return sorted.map((row, index) => ({ ...row, rank: index + 1 }));
}
