import type { Match, Participant, Standing, UUID } from '@/lib/core';
import { setsWon, totalPoints } from '@/lib/core';

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
}

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
 * Tiebreakers, in order: win percentage, head-to-head, set differential,
 * point differential, then participant id — a stable, arbitrary-but-
 * reproducible last resort, never `Math.random()` and never insertion order.
 */
export function computeStandings(input: StandingsInput): Standing[] {
  const { participants, matches } = input;
  const splitByTotalPoints = input.splitSetsDecidedByTotalPoints ?? true;

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

    const sets = setsWon(match);
    homeTally.setsWon += sets.home;
    homeTally.setsLost += sets.away;
    awayTally.setsWon += sets.away;
    awayTally.setsLost += sets.home;

    if (match.status !== 'forfeit') {
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

  /** Negative when `a` outranks `b`. */
  const compare = (a: Standing, b: Standing): number => {
    if (a.winPercentage !== b.winPercentage) return b.winPercentage - a.winPercentage;

    // Head-to-head is pairwise and deliberately outranks the differentials:
    // beating someone directly counts for more than a fat margin elsewhere.
    const aOverB = headToHead.get(a.participantId)?.get(b.participantId) ?? 0;
    const bOverA = headToHead.get(b.participantId)?.get(a.participantId) ?? 0;
    if (aOverB !== bOverA) return bOverA - aOverB;

    if (a.setDifferential !== b.setDifferential) return b.setDifferential - a.setDifferential;
    if (a.pointDifferential !== b.pointDifferential) {
      return b.pointDifferential - a.pointDifferential;
    }
    return a.participantId < b.participantId ? -1 : a.participantId > b.participantId ? 1 : 0;
  };

  // Insertion sort rather than Array.prototype.sort. Pairwise head-to-head is
  // not transitive — three teams can beat each other in a cycle — and a
  // non-transitive comparator makes the built-in sort's output depend on its
  // internal algorithm. Sorting by hand keeps the result defined by this
  // code and identical on every engine and every run, which is the whole
  // point of H9.
  const sorted = [...rows];
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
