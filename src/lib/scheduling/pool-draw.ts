import type { Participant, UUID } from '@/lib/core';
import { MAX_TEAMS_PER_POOL, MIN_TEAMS_PER_POOL, PREFERRED_POOL_SIZES } from '@/lib/core';
import type { PoolInput } from './pool-play';

export interface EmptyPool {
  id: UUID;
  name: string;
}

export interface DrawPoolsInput {
  /** Everyone entered. `seed` is optional and often set on only a few. */
  participants: Participant[];
  /**
   * The pools to fill, already named and identified by the caller. Their
   * count is the organizer's decision — this function validates it rather
   * than choosing it.
   */
  pools: EmptyPool[];
}

/**
 * Draw order: seeded participants first in seed order, then everyone else by
 * name.
 *
 * A partially seeded field is the normal case — an organizer ranks the teams
 * they know and leaves the rest blank — so this cannot assume a total order
 * over seeds. Name breaks both a duplicated seed and the unseeded tail, which
 * keeps the draw reproducible (rule 9) and, unlike registration time, keeps it
 * predictable to somebody reading the entry list.
 */
function drawOrder(participants: readonly Participant[]): Participant[] {
  return [...participants].sort((a, b) => {
    const aSeeded = a.seed !== undefined;
    const bSeeded = b.seed !== undefined;
    if (aSeeded !== bSeeded) return aSeeded ? -1 : 1;
    if (aSeeded && bSeeded && a.seed !== b.seed) return (a.seed ?? 0) - (b.seed ?? 0);
    if (a.name !== b.name) return a.name < b.name ? -1 : 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

/**
 * Draw participants into pools by the snake method: across the pools and back
 * again, so the top seeds land in different pools and the seed totals come out
 * level when the field divides evenly.
 *
 * This is what `Participant.seed` is for. Bracket seeding is computed from
 * standings and always will be — that is audit finding H9, and a manually
 * entered rank must never override a record that was actually played. But
 * before anybody has played there is no record to read, and a pool draw that
 * ignores the organizer's ranking is how the two strongest teams end up in the
 * same pool and one of them goes home before the bracket.
 *
 * The pool count is the caller's decision. An organizer knows how many courts
 * they have and how long the day is; this function's job is to refuse a count
 * that cannot work rather than to quietly pick a different one.
 */
export function drawPools(input: DrawPoolsInput): PoolInput[] {
  const { participants, pools } = input;

  if (pools.length === 0) {
    throw new Error('Cannot draw pools: at least one pool is required.');
  }

  // A repeated entry silently produces a pool where somebody plays themselves.
  // roundRobinRounds catches it downstream, but by then the draw has already
  // happened and the error names a participant rather than a registration.
  const seen = new Set<UUID>();
  for (const participant of participants) {
    if (seen.has(participant.id)) {
      throw new Error(
        `Cannot draw pools: participant ${participant.id} appears more than once. Each participant may only be entered once.`,
      );
    }
    seen.add(participant.id);
  }

  // Sizes differ by at most one, so checking the two extremes checks them all.
  if (participants.length > 0) {
    const largest = Math.ceil(participants.length / pools.length);
    const smallest = Math.floor(participants.length / pools.length);
    if (smallest < MIN_TEAMS_PER_POOL || largest > MAX_TEAMS_PER_POOL) {
      throw new Error(
        `Cannot draw ${participants.length} participants into ${pools.length} pools: that gives pools of ${smallest}-${largest}, and a pool must hold ${MIN_TEAMS_PER_POOL}-${MAX_TEAMS_PER_POOL}. Change the pool count.`,
      );
    }
  }

  const drawn: UUID[][] = pools.map(() => []);

  // Snake: left to right, then right to left, so no pool keeps drawing early.
  for (const [position, participant] of drawOrder(participants).entries()) {
    const row = Math.floor(position / pools.length);
    const step = position % pools.length;
    const index = row % 2 === 0 ? step : pools.length - 1 - step;
    drawn[index]?.push(participant.id);
  }

  return pools.map((pool, index) => ({
    id: pool.id,
    name: pool.name,
    participantIds: drawn[index] ?? [],
  }));
}

/**
 * The pool count an organizer most likely wants for a field of this size, or
 * undefined when no count works.
 *
 * A suggestion, not a decision — `drawPools` takes the count it is given and
 * this exists so a form can pre-fill the field rather than leave the organizer
 * to work it out. It is what PREFERRED_POOL_SIZES is for.
 *
 * Counts whose pools are all a preferred size win, earliest preference first:
 * twelve teams becomes three pools of four rather than two of six. Where no
 * count manages that, the fewest pools that stay inside the bounds wins, since
 * fewer pools means a longer round-robin and more play for everybody.
 */
export function suggestPoolCount(participantCount: number): number | undefined {
  const rankOfSize = new Map<number, number>(
    PREFERRED_POOL_SIZES.map((size, index) => [size, index]),
  );
  let allPreferred: { count: number; rank: number } | undefined;
  let anyValid: number | undefined;

  for (let count = 1; count <= participantCount; count++) {
    const largest = Math.ceil(participantCount / count);
    const smallest = Math.floor(participantCount / count);
    if (smallest < MIN_TEAMS_PER_POOL || largest > MAX_TEAMS_PER_POOL) continue;

    anyValid ??= count;

    const smallestRank = rankOfSize.get(smallest);
    const largestRank = rankOfSize.get(largest);
    if (smallestRank === undefined || largestRank === undefined) continue;

    // Rank by the strongest preference this count achieves.
    const rank = Math.min(smallestRank, largestRank);
    if (!allPreferred || rank < allPreferred.rank) allPreferred = { count, rank };
  }

  return allPreferred?.count ?? anyValid;
}
