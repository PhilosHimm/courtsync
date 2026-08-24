import type { Match, UUID } from '@courtsync/core';
import type { PoolInput } from './pool-play';

export interface RefereeInput {
  matches: Match[];
  pools: PoolInput[];
  /** Every participant in the competition, for cross-pool fallback. */
  allParticipantIds: UUID[];
}

export interface RefereeOutput {
  matches: Match[];
  /** Matches left without a referee, flagged for manual assignment. */
  unassigned: UUID[];
  /** poolId -> participantId -> number of matches refereed. */
  refCounts: Record<UUID, Record<UUID, number>>;
}

/**
 * Assign a refereeing participant to every scheduled match.
 *
 * Selection is least-loaded-first, not first-available. That distinction is
 * the whole of audit finding H7: scoop took the first eligible team each
 * time, which in a 4-team pool meant the same teams kept coming up and `a4`
 * refereed nothing all day. Organizers hear about that immediately.
 *
 * Preference order: an idle participant from the match's own pool, then any
 * idle participant from another pool. Within either group the least-loaded
 * wins, ties broken by the caller's own ordering so the result is stable.
 */
export function assignReferees(input: RefereeInput): RefereeOutput {
  const { matches, pools, allParticipantIds } = input;

  // Every pool participant starts at zero, so a participant who never
  // referees is visible in the output rather than simply absent from it.
  const refCounts: Record<UUID, Record<UUID, number>> = {};
  const poolOfParticipant = new Map<UUID, UUID>();
  for (const pool of pools) {
    const counts: Record<UUID, number> = {};
    for (const participantId of pool.participantIds) {
      counts[participantId] = 0;
      poolOfParticipant.set(participantId, pool.id);
    }
    refCounts[pool.id] = counts;
  }

  const participantsByPool = new Map<UUID, UUID[]>();
  for (const pool of pools) participantsByPool.set(pool.id, pool.participantIds);

  // Who is on court in each timeslot — a referee cannot also be playing.
  const playingAt = new Map<UUID, Set<UUID>>();
  for (const match of matches) {
    if (!match.timeslotId) continue;
    const playing = playingAt.get(match.timeslotId) ?? new Set<UUID>();
    if (match.homeParticipantId) playing.add(match.homeParticipantId);
    if (match.awayParticipantId) playing.add(match.awayParticipantId);
    playingAt.set(match.timeslotId, playing);
  }

  // Nobody referees two matches running at the same time either.
  const refereeingAt = new Map<UUID, Set<UUID>>();

  const countOf = (participantId: UUID): number => {
    const poolId = poolOfParticipant.get(participantId);
    if (poolId === undefined) return 0;
    return refCounts[poolId]?.[participantId] ?? 0;
  };

  const isAvailable = (participantId: UUID, match: Match): boolean => {
    if (participantId === match.homeParticipantId) return false;
    if (participantId === match.awayParticipantId) return false;
    if (!match.timeslotId) return true;
    if (playingAt.get(match.timeslotId)?.has(participantId)) return false;
    if (refereeingAt.get(match.timeslotId)?.has(participantId)) return false;
    return true;
  };

  /** Least-loaded candidate; ties fall to the caller's ordering. */
  const pickLeastLoaded = (candidates: readonly UUID[]): UUID | undefined => {
    let best: UUID | undefined;
    let bestCount = Number.POSITIVE_INFINITY;
    for (const candidate of candidates) {
      const count = countOf(candidate);
      if (count < bestCount) {
        best = candidate;
        bestCount = count;
      }
    }
    return best;
  };

  const assigned: Match[] = [];
  const unassigned: UUID[] = [];

  for (const match of matches) {
    const samePool = match.poolId ? (participantsByPool.get(match.poolId) ?? []) : [];
    const inPool = samePool.filter((id) => isAvailable(id, match));
    const pick =
      pickLeastLoaded(inPool) ??
      pickLeastLoaded(allParticipantIds.filter((id) => isAvailable(id, match)));

    if (pick === undefined) {
      unassigned.push(match.id);
      assigned.push({ ...match, refParticipantId: null });
      continue;
    }

    // Load is counted against the referee's own pool, which is where the
    // balance actually has to hold.
    const poolId = poolOfParticipant.get(pick);
    if (poolId !== undefined) {
      const counts = refCounts[poolId];
      if (counts) counts[pick] = (counts[pick] ?? 0) + 1;
    }
    if (match.timeslotId) {
      const busy = refereeingAt.get(match.timeslotId) ?? new Set<UUID>();
      busy.add(pick);
      refereeingAt.set(match.timeslotId, busy);
    }

    assigned.push({ ...match, refParticipantId: pick });
  }

  return { matches: assigned, unassigned, refCounts };
}
