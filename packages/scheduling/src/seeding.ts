import type { Match, Standing, UUID } from '@courtsync/core';
import { setsWon } from '@courtsync/core';
import type { BracketSlot } from './match-ids';
import { playoffMatchId } from './match-ids';

export interface SeedingInput {
  competitionSlug: string;
  sessionId: UUID;
  /** Standings per pool, keyed by pool id. */
  standingsByPool: Record<UUID, Standing[]>;
  /** e.g. `['gold']` or `['gold', 'silver']`. */
  tiers: string[];
}

export interface SeededMatch {
  matchId: string;
  tier: string;
  slot: BracketSlot;
  homeParticipantId: UUID | null;
  awayParticipantId: UUID | null;
}

/** Quarterfinal slots in bracket order; s1 feeds from q1+q2, s2 from q3+q4. */
const QUARTERS: readonly BracketSlot[] = ['q1', 'q2', 'q3', 'q4'];

interface Seed {
  standing: Standing;
  poolId: UUID;
}

/**
 * Order across pools by actual record. Pool label carries no weight — that
 * is audit finding H9, where the pool-A winner was assumed to be the overall
 * top seed regardless of how the two pools' records actually compared.
 *
 * No head-to-head term: teams in different pools never played each other.
 */
function compareSeeds(a: Seed, b: Seed): number {
  const x = a.standing;
  const y = b.standing;
  if (x.winPercentage !== y.winPercentage) return y.winPercentage - x.winPercentage;
  if (x.setDifferential !== y.setDifferential) return y.setDifferential - x.setDifferential;
  if (x.pointDifferential !== y.pointDifferential) {
    return y.pointDifferential - x.pointDifferential;
  }
  return x.participantId < y.participantId ? -1 : x.participantId > y.participantId ? 1 : 0;
}

function orderedPool(standingsByPool: Record<UUID, Standing[]>, poolId: UUID): UUID[] {
  return [...(standingsByPool[poolId] ?? [])]
    .map((standing) => ({ standing, poolId }))
    .sort(compareSeeds)
    .map((seed) => seed.standing.participantId);
}

/**
 * Place pairings into q1..q4 so the top two overall seeds sit in opposite
 * halves and can only meet in the final: q1 and q2 feed s1, q3 and q4 feed s2.
 */
function orderPairingsIntoBracket(
  pairs: ReadonlyArray<[UUID, UUID]>,
  overallRank: Map<UUID, number>,
): Array<[UUID, UUID] | undefined> {
  const rankOf = (id: UUID): number => overallRank.get(id) ?? Number.MAX_SAFE_INTEGER;
  const bestRank = (pair: [UUID, UUID]): number => Math.min(rankOf(pair[0]), rankOf(pair[1]));

  const byStrength = [...pairs].sort((a, b) => bestRank(a) - bestRank(b));
  const first = byStrength[0];
  const second = byStrength[1];
  const third = byStrength[2];
  const fourth = byStrength[3];

  // Seeds 1 and 4 share the top half; seeds 2 and 3 share the bottom, so the
  // two strongest teams can only meet in the final.
  return [first, fourth, third, second];
}

/** Four [home, away] pairs, better overall seed at home. */
function buildQuarterPairings(
  tierSeeds: readonly Seed[],
  poolIds: readonly UUID[],
  standingsByPool: Record<UUID, Standing[]>,
): Array<[UUID, UUID] | undefined> {
  const overallRank = new Map<UUID, number>();
  for (const [i, seed] of tierSeeds.entries()) {
    overallRank.set(seed.standing.participantId, i);
  }

  const topPoolId = tierSeeds[0]?.poolId;
  const otherPoolId = poolIds.find((id) => id !== topPoolId);

  if (poolIds.length === 2 && topPoolId !== undefined && otherPoolId !== undefined) {
    // Cross-seed: each pool's nth seed meets the other pool's (size-1-n)th.
    // Nobody replays a pool opponent in the quarterfinals, and each pool
    // winner draws the other pool's weakest qualifier.
    const lead = orderedPool(standingsByPool, topPoolId).filter((id) => overallRank.has(id));
    const other = orderedPool(standingsByPool, otherPoolId).filter((id) => overallRank.has(id));
    const size = Math.min(lead.length, other.length);

    if (size >= 2) {
      const pairs: Array<[UUID, UUID]> = [];
      for (let i = 0; i < size; i++) {
        const leadTeam = lead[i];
        const otherTail = other[size - 1 - i];
        if (leadTeam !== undefined && otherTail !== undefined) {
          pairs.push([leadTeam, otherTail]);
        }
        const otherTeam = other[i];
        const leadTail = lead[size - 1 - i];
        if (otherTeam !== undefined && leadTail !== undefined) {
          pairs.push([otherTeam, leadTail]);
        }
      }

      // Drop mirror duplicates, keeping the first occurrence of each pair.
      const seen = new Set<string>();
      const unique: Array<[UUID, UUID]> = [];
      for (const pair of pairs) {
        const key = [...pair].sort().join('|');
        if (seen.has(key)) continue;
        seen.add(key);
        unique.push(pair);
      }

      if (unique.length >= 2) {
        return orderPairingsIntoBracket(unique.slice(0, 4), overallRank);
      }
    }
  }

  // Any other pool count: standard 1v8, 4v5, 3v6, 2v7.
  const ids = tierSeeds.map((seed) => seed.standing.participantId);
  const standard: Array<[number, number]> = [
    [0, 7],
    [3, 4],
    [2, 5],
    [1, 6],
  ];
  return standard.map(([hi, lo]) => {
    const home = ids[hi];
    const away = ids[lo];
    return home !== undefined && away !== undefined ? ([home, away] as [UUID, UUID]) : undefined;
  });
}

/**
 * Seed playoff brackets from pool standings.
 *
 * There is exactly one implementation of this. Audit finding H8 was two
 * different seeders producing two different brackets from identical
 * standings, which is why nothing else in this package may derive a bracket.
 */
export function seedBrackets(input: SeedingInput): SeededMatch[] {
  const { competitionSlug, standingsByPool, tiers } = input;

  const poolIds = Object.keys(standingsByPool);
  const ranked: Seed[] = poolIds
    .flatMap((poolId) => (standingsByPool[poolId] ?? []).map((standing) => ({ standing, poolId })))
    .sort(compareSeeds);

  const seeded: SeededMatch[] = [];

  for (const [tierIndex, tier] of tiers.entries()) {
    const tierSeeds = ranked.slice(tierIndex * 8, tierIndex * 8 + 8);
    if (tierSeeds.length === 0) continue;

    const pairings = buildQuarterPairings(tierSeeds, poolIds, standingsByPool);

    for (const [i, slot] of QUARTERS.entries()) {
      const pairing = pairings[i];
      seeded.push({
        matchId: playoffMatchId(competitionSlug, tier, slot),
        tier,
        slot,
        homeParticipantId: pairing?.[0] ?? null,
        awayParticipantId: pairing?.[1] ?? null,
      });
    }

    // Downstream slots stay empty until the round feeding them resolves.
    for (const slot of ['s1', 's2', 'final', 'consolation'] as const) {
      seeded.push({
        matchId: playoffMatchId(competitionSlug, tier, slot),
        tier,
        slot,
        homeParticipantId: null,
        awayParticipantId: null,
      });
    }
  }

  return seeded;
}

export interface AdvanceInput {
  competitionSlug: string;
  tier: string;
  matches: Match[];
}

/** The two slots feeding each downstream slot. */
const FEEDS: ReadonlyArray<readonly [BracketSlot, readonly [BracketSlot, BracketSlot]]> = [
  ['s1', ['q1', 'q2']],
  ['s2', ['q3', 'q4']],
  ['final', ['s1', 's2']],
];

/**
 * Advance winners from completed bracket matches into the next round.
 *
 * Recomputed from the quarterfinals every time rather than filled in once.
 * Audit finding H14: advancement was one-way, so correcting a quarterfinal
 * score left the semifinal showing whoever had been written into it first —
 * and scores get corrected constantly during a real event.
 */
export function advanceBracket(input: AdvanceInput): Match[] {
  const { competitionSlug, tier, matches } = input;

  const slotOf = new Map<string, BracketSlot>();
  for (const slot of ['q1', 'q2', 'q3', 'q4', 's1', 's2', 'final', 'consolation'] as const) {
    slotOf.set(playoffMatchId(competitionSlug, tier, slot), slot);
  }

  const working = new Map<BracketSlot, Match>();
  for (const match of matches) {
    const slot = slotOf.get(match.id);
    if (slot) working.set(slot, { ...match });
  }

  /** Winner and loser of a slot, or nulls when it has not been decided. */
  const resultOf = (slot: BracketSlot): { winner: UUID | null; loser: UUID | null } => {
    const match = working.get(slot);
    if (!match) return { winner: null, loser: null };
    if (match.status !== 'final' && match.status !== 'forfeit') {
      return { winner: null, loser: null };
    }

    const sets = setsWon(match);
    if (sets.home === sets.away) {
      // Audit finding H15: a tied elimination match used to stall the whole
      // bracket with nothing reported. There is no such thing as a drawn
      // knockout match, so this is invalid input and says so.
      throw new Error(
        `Cannot advance ${match.id}: the match is a tie, and an elimination match cannot end tied. Record a decisive result first.`,
      );
    }

    const homeWon = sets.home > sets.away;
    return {
      winner: (homeWon ? match.homeParticipantId : match.awayParticipantId) ?? null,
      loser: (homeWon ? match.awayParticipantId : match.homeParticipantId) ?? null,
    };
  };

  for (const [target, [fromHome, fromAway]] of FEEDS) {
    const match = working.get(target);
    if (!match) continue;
    working.set(target, {
      ...match,
      homeParticipantId: resultOf(fromHome).winner,
      awayParticipantId: resultOf(fromAway).winner,
    });
  }

  const consolation = working.get('consolation');
  if (consolation) {
    working.set('consolation', {
      ...consolation,
      homeParticipantId: resultOf('s1').loser,
      awayParticipantId: resultOf('s2').loser,
    });
  }

  return matches.map((match) => {
    const slot = slotOf.get(match.id);
    if (!slot) return match;
    return working.get(slot) ?? match;
  });
}
