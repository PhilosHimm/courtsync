import type { Match, Standing, UUID } from '@/lib/core';
import { setsWon } from '@/lib/core';
import type { BracketSlot } from './match-ids';
import { BRACKET_SLOTS, playoffMatchId } from './match-ids';

/**
 * One side of a templated quarterfinal: a finishing position, not a team.
 *
 * "Third in pool A" rather than "the Spikers". Who finished third is still
 * computed from the matches on every read, which is what keeps a declared
 * bracket shape on the right side of H9 — the finding was a manually entered
 * rank overriding a record that had actually been played.
 */
export interface BracketTemplateRef {
  /** 1-based position in `SeedingInput.poolOrder`. */
  pool: number;
  /** 1-based finishing position within that pool's standings. */
  seed: number;
}

/**
 * The shape of a draw, as the organizer's rules sheet states it.
 *
 * Red Velvet runs Q1 = A-3rd v B-2nd, Q2 = A-2nd v B-3rd, Q3 = A-1st v B-4th,
 * Q4 = B-1st v A-4th. No automatic cross-seeding produces that pattern,
 * because it is a decision about the format rather than about the teams — and
 * an organizer who has published a bracket structure needs the app to run the
 * one they published.
 */
export interface BracketTemplate {
  /** For the organizer's own reference. Nothing keys on it. */
  name?: string;
  /** Quarterfinals in q1..q4 order. Fewer than four leaves the rest empty. */
  quarters: ReadonlyArray<readonly [BracketTemplateRef, BracketTemplateRef]>;
}

export interface SeedingInput {
  competitionSlug: string;
  sessionId: UUID;
  /** Standings per pool, keyed by pool id. */
  standingsByPool: Record<UUID, Standing[]>;
  /** e.g. `['gold']` or `['gold', 'silver']`. */
  tiers: string[];
  /**
   * A declared draw shape per tier. Omit for the automatic seeding that has
   * always been here.
   *
   * All or nothing across `tiers`: a half-declared draw would have the
   * templated tier and the automatic tier each allocating from the whole
   * field, and one team could land in two brackets.
   */
  templates?: Readonly<Record<string, BracketTemplate>>;
  /**
   * Pool ids in draw order — position 1 is what a template's `pool: 1` means.
   * Required whenever `templates` is given.
   *
   * Explicit rather than inferred from `standingsByPool`'s key order. Object
   * key order is insertion order, which is a property of how the caller built
   * a record, and a bracket must not depend on that.
   */
  poolOrder?: UUID[];
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

/** A bracket holds eight qualifiers. A shorter field leaves byes, never holes. */
const BRACKET_SIZE = 8;

/**
 * Standard seeding, one entry per quarterfinal in slot order: 1v8, 4v5, 3v6,
 * 2v7.
 *
 * Seeds 1 and 2 land in q1 and q4, which feed opposite semifinals, so they can
 * only meet in the final. When the field is short it is the tail indices that
 * go missing, which puts the byes on exactly those two seeds without any
 * special case for it.
 */
const STANDARD_PAIRS: ReadonlyArray<readonly [number, number]> = [
  [0, 7],
  [3, 4],
  [2, 5],
  [1, 6],
];

interface Seed {
  standing: Standing;
  poolId: UUID;
}

/** One quarterfinal. `away` is null when the seed on `home` has a bye. */
interface Pairing {
  home: UUID | null;
  away: UUID | null;
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
 * Split the field into tiers, taking the same number from every pool before
 * record decides the rest.
 *
 * Per-pool allocation rather than a straight cut down the overall ranking: a
 * pool that happened to draw the strong teams should not fill gold and leave
 * another pool's winner playing silver. Eight slots do not divide by three
 * pools, so the leftovers still go to the best remaining records — the part
 * that is not fixed by pool is settled by results and nothing else.
 */
function allocateTiers(
  ranked: readonly Seed[],
  standingsByPool: Record<UUID, Standing[]>,
  poolIds: readonly UUID[],
  tierCount: number,
): Seed[][] {
  const unallocated = new Set<UUID>(ranked.map((seed) => seed.standing.participantId));
  const perPool = poolIds.length === 0 ? 0 : Math.floor(BRACKET_SIZE / poolIds.length);
  const tiers: Seed[][] = [];

  for (let tier = 0; tier < tierCount; tier++) {
    const picked = new Set<UUID>();

    for (const poolId of poolIds) {
      let taken = 0;
      for (const participantId of orderedPool(standingsByPool, poolId)) {
        if (taken >= perPool) break;
        if (!unallocated.has(participantId) || picked.has(participantId)) continue;
        picked.add(participantId);
        taken += 1;
      }
    }

    // Leftover slots, and every slot when there are more pools than the
    // bracket can sample evenly, go to the best remaining records.
    for (const seed of ranked) {
      if (picked.size >= BRACKET_SIZE) break;
      const participantId = seed.standing.participantId;
      if (!unallocated.has(participantId) || picked.has(participantId)) continue;
      picked.add(participantId);
    }

    for (const participantId of picked) unallocated.delete(participantId);
    // `ranked` is already in seed order, so filtering preserves that order and
    // the tier is seeded the moment it is allocated.
    tiers.push(ranked.filter((seed) => picked.has(seed.standing.participantId)));
  }

  return tiers;
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

/**
 * Cross-seed two pools: each pool's nth seed meets the other pool's
 * (size-1-n)th. Nobody replays a pool opponent in the quarterfinals, and each
 * pool winner draws the other pool's weakest qualifier.
 *
 * Returns undefined when the two pools cannot fill the bracket between them —
 * an eight-team tier drawn six from one pool and two from the other has no
 * cross-seeding that places everybody, and silently dropping the four the
 * shorter pool cannot match is worse than seeding them straight.
 */
function crossSeedTwoPools(
  tierSeeds: readonly Seed[],
  poolIds: readonly UUID[],
  standingsByPool: Record<UUID, Standing[]>,
  overallRank: Map<UUID, number>,
): Pairing[] | undefined {
  const topPoolId = tierSeeds[0]?.poolId;
  const otherPoolId = poolIds.find((id) => id !== topPoolId);
  if (topPoolId === undefined || otherPoolId === undefined) return undefined;

  const lead = orderedPool(standingsByPool, topPoolId).filter((id) => overallRank.has(id));
  const other = orderedPool(standingsByPool, otherPoolId).filter((id) => overallRank.has(id));
  const size = Math.min(lead.length, other.length);
  if (size < 2) return undefined;

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
  if (unique.length < 2) return undefined;

  const ordered = orderPairingsIntoBracket(unique.slice(0, 4), overallRank);
  const placed = new Set(ordered.flatMap((pair) => (pair ? [pair[0], pair[1]] : [])));
  // Every qualifier in the tier must appear somewhere in the bracket.
  if (placed.size !== tierSeeds.length) return undefined;

  return ordered.map((pair) => ({ home: pair?.[0] ?? null, away: pair?.[1] ?? null }));
}

/** 1v8, 4v5, 3v6, 2v7 over whatever the tier actually has. */
function standardPairings(tierSeeds: readonly Seed[]): Pairing[] {
  const ids = tierSeeds.map((seed) => seed.standing.participantId);
  return STANDARD_PAIRS.map(([high, low]) => ({
    home: ids[high] ?? null,
    away: ids[low] ?? null,
  }));
}

/**
 * Break same-pool quarterfinals by swapping the lower halves of two pairings.
 *
 * The higher seed of every pairing keeps its bracket position, so no team
 * changes seed and no seed changes half — the swap costs nothing structurally
 * and only ever runs when it strictly reduces the number of pool rematches.
 * A pairing holding a bye is never touched: the bye belongs to a top seed and
 * moving it would put a walkover somewhere it was not earned.
 *
 * Best effort by design. Cross-seeding guarantees no rematch for two even
 * pools; at other pool counts a field can be shaped so no swap helps, and
 * then a rematch stands rather than the seeding being bent to hide it.
 */
function avoidPoolRematches(pairings: readonly Pairing[], poolOf: Map<UUID, UUID>): Pairing[] {
  const result = [...pairings];
  const isRematch = (pairing: Pairing | undefined): boolean =>
    !!pairing?.home && !!pairing?.away && poolOf.get(pairing.home) === poolOf.get(pairing.away);
  const rematchCount = (list: readonly Pairing[]): number => list.filter(isRematch).length;

  // Each pass makes at most one swap, and a swap strictly reduces the count,
  // so four passes is more than the four pairings can ever need.
  for (let pass = 0; pass < QUARTERS.length; pass++) {
    const before = rematchCount(result);
    if (before === 0) break;
    let swapped = false;

    for (let i = 0; i < result.length && !swapped; i++) {
      for (let j = i + 1; j < result.length && !swapped; j++) {
        const a = result[i];
        const b = result[j];
        if (!a?.home || !a.away || !b?.home || !b.away) continue;

        const candidate = [...result];
        candidate[i] = { home: a.home, away: b.away };
        candidate[j] = { home: b.home, away: a.away };
        if (rematchCount(candidate) < before) {
          result[i] = candidate[i] as Pairing;
          result[j] = candidate[j] as Pairing;
          swapped = true;
        }
      }
    }

    if (!swapped) break;
  }

  return result;
}

/** Four quarterfinals, better overall seed at home, byes on the home side. */
function buildQuarterPairings(
  tierSeeds: readonly Seed[],
  poolIds: readonly UUID[],
  standingsByPool: Record<UUID, Standing[]>,
): Pairing[] {
  const overallRank = new Map<UUID, number>();
  for (const [i, seed] of tierSeeds.entries()) {
    overallRank.set(seed.standing.participantId, i);
  }

  const poolOf = new Map<UUID, UUID>();
  for (const seed of tierSeeds) poolOf.set(seed.standing.participantId, seed.poolId);

  const crossSeeded =
    poolIds.length === 2 && tierSeeds.length === BRACKET_SIZE
      ? crossSeedTwoPools(tierSeeds, poolIds, standingsByPool, overallRank)
      : undefined;

  return avoidPoolRematches(crossSeeded ?? standardPairings(tierSeeds), poolOf);
}

/**
 * Resolve one side of a templated quarterfinal to an actual participant.
 *
 * Every failure here raises. A template that cannot be honoured is a
 * configuration the organizer has to fix before the day, and quietly leaving
 * a side empty would hand somebody a bye nobody drew — which is worse than
 * not starting, because it looks like a bracket.
 */
function resolveTemplateRef(args: {
  ref: BracketTemplateRef;
  tier: string;
  poolOrder: readonly UUID[];
  standingsByPool: Record<UUID, Standing[]>;
}): UUID {
  const { ref, tier, poolOrder, standingsByPool } = args;

  const poolId = poolOrder[ref.pool - 1];
  if (poolId === undefined) {
    throw new Error(
      `Bracket template for tier ${tier} references pool ${ref.pool}, but the draw has ${poolOrder.length} pool(s).`,
    );
  }

  // Position in the table as given, deliberately — NOT re-derived here.
  // `computeStandings` applies head-to-head before the differentials, so a
  // team can finish above one it trails on points. "Second in pool A" means
  // the second row of the table the organizer is reading, and a second
  // ordering in this file would quietly disagree with it (H8).
  const table = standingsByPool[poolId] ?? [];
  const standing = table[ref.seed - 1];
  if (!standing) {
    throw new Error(
      `Bracket template for tier ${tier} references finishing position ${ref.seed} in pool ${poolId}, which has ${table.length} team(s).`,
    );
  }

  return standing.participantId;
}

/**
 * Turn the declared templates into pairings, or return null when none were
 * declared and the automatic seeder should run.
 *
 * Validation is all up front. Every check here is a bracket that would
 * otherwise be discovered wrong on the morning of the event, in front of the
 * teams it is wrong about.
 */
function resolveTemplates(input: SeedingInput): Map<string, Pairing[]> | null {
  const { templates, tiers, standingsByPool } = input;
  if (!templates || Object.keys(templates).length === 0) return null;

  const untemplated = tiers.filter((tier) => !templates[tier]);
  if (untemplated.length > 0) {
    throw new Error(
      `Bracket template missing for tier(s) ${untemplated.join(', ')}. Declare the whole draw or none of it — a templated tier and an automatic tier both allocate from the full field, and a team could land in two brackets.`,
    );
  }

  const poolOrder = input.poolOrder;
  if (!poolOrder || poolOrder.length === 0) {
    throw new Error(
      'poolOrder is required when bracket templates are given: a template says "pool 1", and without a declared order that would resolve off object key order.',
    );
  }
  for (const poolId of poolOrder) {
    if (!standingsByPool[poolId]) {
      throw new Error(`poolOrder names pool ${poolId}, which has no standings in this draw.`);
    }
  }

  /** participantId -> the tier that already drew them. */
  const drawnIn = new Map<UUID, string>();
  const byTier = new Map<string, Pairing[]>();

  for (const tier of tiers) {
    const template = templates[tier];
    if (!template) continue; // unreachable: `untemplated` is empty by here.

    if (template.quarters.length === 0) {
      throw new Error(`Bracket template for tier ${tier} declares at least one quarterfinal.`);
    }
    if (template.quarters.length > QUARTERS.length) {
      throw new Error(
        `Bracket template for tier ${tier} declares ${template.quarters.length} quarterfinals; a bracket has four.`,
      );
    }

    /** participantId -> the 1-based quarterfinal that already drew them. */
    const drawnAt = new Map<UUID, number>();
    const pairings: Pairing[] = [];

    for (const [index, [homeRef, awayRef]] of template.quarters.entries()) {
      const sides = [homeRef, awayRef].map((ref) =>
        resolveTemplateRef({ ref, tier, poolOrder, standingsByPool }),
      );

      for (const participantId of sides) {
        const alreadyAt = drawnAt.get(participantId);
        if (alreadyAt !== undefined) {
          throw new Error(
            `Bracket template for tier ${tier} draws ${participantId} into two quarterfinals (q${alreadyAt} and q${index + 1}). Each team plays one.`,
          );
        }
        const alreadyIn = drawnIn.get(participantId);
        if (alreadyIn !== undefined) {
          throw new Error(
            `Bracket templates draw ${participantId} into two tiers (${alreadyIn} and ${tier}). Each team plays one bracket.`,
          );
        }
        drawnAt.set(participantId, index + 1);
      }

      pairings.push({ home: sides[0] ?? null, away: sides[1] ?? null });
    }

    for (const participantId of drawnAt.keys()) drawnIn.set(participantId, tier);

    // A template shorter than four quarterfinals leaves the rest empty rather
    // than inventing pairings for a field that has run out. The q1..q4 slot
    // set stays fixed either way — every consumer counts on that.
    while (pairings.length < QUARTERS.length) pairings.push({ home: null, away: null });

    byTier.set(tier, pairings);
  }

  return byTier;
}

/**
 * Seed playoff brackets from pool standings.
 *
 * There is exactly one implementation of this. Audit finding H8 was two
 * different seeders producing two different brackets from identical
 * standings, which is why nothing else in this package may derive a bracket.
 *
 * A `templates` entry changes the SHAPE of the draw — which finishing
 * position meets which — and never who is in it. Positions are still read off
 * standings that were computed from matches on this call, so correcting a
 * pool score still moves the bracket. That is the line H9 draws, and a
 * declared shape stays on the right side of it.
 */
export function seedBrackets(input: SeedingInput): SeededMatch[] {
  const { competitionSlug, standingsByPool, tiers } = input;

  const templated = resolveTemplates(input);

  const poolIds = Object.keys(standingsByPool);
  const ranked: Seed[] = poolIds
    .flatMap((poolId) => (standingsByPool[poolId] ?? []).map((standing) => ({ standing, poolId })))
    .sort(compareSeeds);

  const tierSeedsByTier = templated
    ? []
    : allocateTiers(ranked, standingsByPool, poolIds, tiers.length);
  const seeded: SeededMatch[] = [];

  for (const [tierIndex, tier] of tiers.entries()) {
    let pairings: Pairing[];

    if (templated) {
      // The organizer named the pairings. Rematch avoidance and cross-seeding
      // do not run over them: a swap nobody asked for is a second seeder
      // disagreeing with the first, which is H8.
      pairings = templated.get(tier) ?? [];
    } else {
      const tierSeeds = tierSeedsByTier[tierIndex] ?? [];
      if (tierSeeds.length === 0) continue;
      pairings = buildQuarterPairings(tierSeeds, poolIds, standingsByPool);
    }

    for (const [i, slot] of QUARTERS.entries()) {
      const pairing = pairings[i];
      seeded.push({
        matchId: playoffMatchId(competitionSlug, tier, slot),
        tier,
        slot,
        homeParticipantId: pairing?.home ?? null,
        awayParticipantId: pairing?.away ?? null,
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

/** One quarterfinal whose two sides are no longer what was seeded. */
export interface DriftedSlot {
  matchId: string;
  tier: string;
  slot: BracketSlot;
  /** What the bracket was set to. */
  seededHome: UUID | null;
  seededAway: UUID | null;
  /** What today's standings produce. */
  currentHome: UUID | null;
  currentAway: UUID | null;
}

export interface DriftInput {
  /** The draw as it was written when the bracket was set. */
  seeded: readonly SeededMatch[];
  /** The seeding today's standings produce. */
  current: SeedingInput;
}

/**
 * Whether the bracket on the wall still matches the standings underneath it.
 *
 * Pool scores get corrected after the bracket has gone up — a set entered on
 * the wrong row, a forfeit recorded late — and the organizer is allowed to do
 * that. Refusing the edit would be worse: it would leave the standings
 * knowingly wrong, which is where denormalized results start drifting from
 * the matches they summarize (H9).
 *
 * So the edit stands and this reports the consequence. Two teams discovering
 * at 3:50pm that they were told the wrong court is the failure mode; a banner
 * at 3:20 saying which quarterfinals moved is the fix.
 *
 * Only quarterfinals are compared. Everything downstream is seeded empty and
 * filled by `advanceBracket` from whatever the quarterfinals resolve to, so
 * reporting those slots would make every correction look like it moved the
 * final.
 */
export function bracketDrift(input: DriftInput): DriftedSlot[] {
  const quarterSlots = new Set<string>(QUARTERS);
  const now = seedBrackets(input.current).filter((match) => quarterSlots.has(match.slot));
  const seededQuarters = input.seeded.filter((match) => quarterSlots.has(match.slot));

  const seededById = new Map(seededQuarters.map((match) => [match.matchId, match]));
  const nowById = new Map(now.map((match) => [match.matchId, match]));

  const drifted: DriftedSlot[] = [];

  const compare = (matchId: string, tier: string, slot: BracketSlot): void => {
    const was = seededById.get(matchId);
    const is = nowById.get(matchId);
    const seededHome = was?.homeParticipantId ?? null;
    const seededAway = was?.awayParticipantId ?? null;
    const currentHome = is?.homeParticipantId ?? null;
    const currentAway = is?.awayParticipantId ?? null;

    // Sides are compared position by position. The same two teams with the
    // home side swapped is a different match card, a different scoresheet and
    // usually a different court, so it is drift rather than cosmetic.
    if (seededHome === currentHome && seededAway === currentAway) return;
    drifted.push({ matchId, tier, slot, seededHome, seededAway, currentHome, currentAway });
  };

  // Walk today's draw first so the report reads in bracket order, then pick
  // up anything that has stopped being drawn at all — a tier the field no
  // longer fills still has to be reported, not silently dropped.
  for (const match of now) compare(match.matchId, match.tier, match.slot);
  for (const match of seededQuarters) {
    if (nowById.has(match.matchId)) continue;
    compare(match.matchId, match.tier, match.slot);
  }

  return drifted;
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

/** How a slot stands: decided, waiting on a match, or nobody there at all. */
interface SlotResult {
  winner: UUID | null;
  loser: UUID | null;
  /** A match still has to be played before this slot can be known. */
  pending: boolean;
}

const UNPLAYED: SlotResult = { winner: null, loser: null, pending: true };
const EMPTY: SlotResult = { winner: null, loser: null, pending: false };

/**
 * Advance winners from completed bracket matches into the next round.
 *
 * Recomputed from the quarterfinals every time rather than filled in once.
 * Audit finding H14: advancement was one-way, so correcting a quarterfinal
 * score left the semifinal showing whoever had been written into it first —
 * and scores get corrected constantly during a real event.
 *
 * A slot with one side and no opponent is a bye and resolves without a result
 * being recorded, which is what lets a field of five, six or seven reach a
 * champion. "No opponent" and "opponent not yet known" are different states
 * and the difference is load-bearing: a semifinal waiting on an unplayed
 * quarterfinal also has one side, and walking that team into the final would
 * hand somebody a title they had not played for.
 */
export function advanceBracket(input: AdvanceInput): Match[] {
  const { competitionSlug, tier, matches } = input;

  const slotOf = new Map<string, BracketSlot>();
  for (const slot of BRACKET_SLOTS) {
    slotOf.set(playoffMatchId(competitionSlug, tier, slot), slot);
  }

  const bySlot = new Map<BracketSlot, Match>();
  for (const match of matches) {
    const slot = slotOf.get(match.id);
    if (slot) bySlot.set(slot, { ...match });
  }

  /** The two slots feeding a downstream slot, if it has any. */
  const feedsOf = (slot: BracketSlot): readonly [BracketSlot, BracketSlot] | undefined =>
    FEEDS.find(([target]) => target === slot)?.[1];

  const resolved = new Map<BracketSlot, SlotResult>();

  /** Who a slot's two sides are, and whether they are settled yet. */
  const sidesOf = (slot: BracketSlot): { sides: [UUID | null, UUID | null]; pending: boolean } => {
    const feeds = feedsOf(slot);
    if (!feeds) {
      // A quarterfinal is seeded directly rather than fed from anywhere.
      const match = bySlot.get(slot);
      return {
        sides: [match?.homeParticipantId ?? null, match?.awayParticipantId ?? null],
        pending: false,
      };
    }
    const [fromHome, fromAway] = feeds;
    const home = resolve(fromHome);
    const away = resolve(fromAway);
    return { sides: [home.winner, away.winner], pending: home.pending || away.pending };
  };

  function resolve(slot: BracketSlot): SlotResult {
    const cached = resolved.get(slot);
    if (cached) return cached;
    // FEEDS is a shallow DAG (final <- s1, s2 <- q1..q4), so this terminates.
    resolved.set(slot, UNPLAYED);

    const { sides, pending } = sidesOf(slot);
    const result = ((): SlotResult => {
      if (pending) return UNPLAYED;

      const [home, away] = sides;
      // Nobody on either side: the slot does not exist in this bracket.
      if (!home && !away) return EMPTY;
      // One side and no opponent coming: a bye, which needs no result.
      if (!home || !away) return { winner: home ?? away ?? null, loser: null, pending: false };

      const match = bySlot.get(slot);
      if (!match) return UNPLAYED;
      if (match.status !== 'final' && match.status !== 'forfeit') return UNPLAYED;

      const sets = setsWon({ ...match, homeParticipantId: home, awayParticipantId: away });
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
        winner: homeWon ? home : away,
        loser: homeWon ? away : home,
        pending: false,
      };
    })();

    resolved.set(slot, result);
    return result;
  }

  const working = new Map<BracketSlot, Match>(bySlot);

  for (const [target] of FEEDS) {
    const match = working.get(target);
    if (!match) continue;
    const { sides } = sidesOf(target);
    working.set(target, { ...match, homeParticipantId: sides[0], awayParticipantId: sides[1] });
  }

  const consolation = working.get('consolation');
  if (consolation) {
    working.set('consolation', {
      ...consolation,
      homeParticipantId: resolve('s1').loser,
      awayParticipantId: resolve('s2').loser,
    });
  }

  return matches.map((match) => {
    const slot = slotOf.get(match.id);
    if (!slot) return match;
    return working.get(slot) ?? match;
  });
}
