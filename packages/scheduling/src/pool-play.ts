import type { Match, UUID } from '@courtsync/core';
import { poolMatchId } from './match-ids';
import { roundRobinRounds } from './round-robin';

export interface PoolInput {
  id: UUID;
  name: string;
  participantIds: UUID[];
}

export interface PoolPlayInput {
  competitionSlug: string;
  sessionId: UUID;
  pools: PoolInput[];
  courtIds: UUID[];
  timeslotIds: UUID[];
  /**
   * Minimum number of slots a participant should sit out between its own
   * matches. Soft constraint — the scheduler may violate it rather than
   * leave a match unassigned, but must minimise how often it does.
   */
  minRestSlots?: number;
  /**
   * The competition's real id. Scheduling is pure and never reads a database,
   * so callers that already know the persisted id pass it here; otherwise the
   * slug stands in and the persistence layer remaps.
   */
  competitionId?: UUID;
}

export interface PoolPlayOutput {
  matches: Match[];
  /** Match ids that could not be placed on any court/timeslot. */
  unassigned: UUID[];
}

/**
 * Generate round-robin pool play and place it on the court x timeslot grid.
 *
 * Placement works in whole rounds rather than match by match. Every pool's
 * round r runs as one block, and blocks are spread evenly across the day
 * rather than packed against the start — a greedy earliest-free-slot placer
 * satisfies every hard constraint and still produces a schedule where
 * everyone plays in the morning and nobody plays after lunch.
 */
export function generatePoolPlay(input: PoolPlayInput): PoolPlayOutput {
  const { competitionSlug, sessionId, pools, courtIds, timeslotIds } = input;
  const competitionId = input.competitionId ?? competitionSlug;
  const courtCount = courtIds.length;
  const slotCount = timeslotIds.length;

  // Build every match first, grouped into global rounds. Matches from
  // different pools never share a participant, so a global round still has
  // the once-per-participant property that makes spacing work.
  const perPoolRounds = pools.map((pool) => roundRobinRounds(pool.participantIds));
  const roundCount = perPoolRounds.reduce((max, rounds) => Math.max(max, rounds.length), 0);
  const perPoolMatchNumber = pools.map(() => 0);

  const globalRounds: Match[][] = [];
  for (let r = 0; r < roundCount; r++) {
    const roundMatches: Match[] = [];
    for (let p = 0; p < pools.length; p++) {
      const pool = pools[p];
      if (!pool) continue;
      const pairs = perPoolRounds[p]?.[r] ?? [];
      for (const [home, away] of pairs) {
        const nextNumber = (perPoolMatchNumber[p] ?? 0) + 1;
        perPoolMatchNumber[p] = nextNumber;
        roundMatches.push({
          id: poolMatchId(competitionSlug, pool.name, nextNumber),
          competitionId,
          sessionId,
          poolId: pool.id,
          courtId: null,
          timeslotId: null,
          homeParticipantId: home,
          awayParticipantId: away,
          refParticipantId: null,
          bracket: null,
          roundLabel: 'Pool Play',
          status: 'scheduled',
          sets: [],
        });
      }
    }
    globalRounds.push(roundMatches);
  }

  const matches: Match[] = [];
  const unassigned: UUID[] = [];

  if (courtCount === 0 || slotCount === 0) {
    for (const round of globalRounds) {
      for (const match of round) {
        matches.push(match);
        unassigned.push(match.id);
      }
    }
    return { matches, unassigned };
  }

  // Slots each round occupies, then the largest even gap between rounds that
  // still fits the day. When the day is tight this collapses to 0 and rounds
  // run back to back — minRestSlots is explicitly a soft constraint, and
  // leaving matches unplaced to honour it would be the worse failure.
  const slotsPerRound = globalRounds.map((round) => Math.ceil(round.length / courtCount));
  const slotsNeeded = slotsPerRound.reduce((sum, n) => sum + n, 0);
  const gap =
    globalRounds.length > 1
      ? Math.max(0, Math.floor((slotCount - slotsNeeded) / (globalRounds.length - 1)))
      : 0;

  let cursor = 0;
  for (let r = 0; r < globalRounds.length; r++) {
    const roundMatches = globalRounds[r] ?? [];
    for (let i = 0; i < roundMatches.length; i++) {
      const match = roundMatches[i];
      if (!match) continue;
      const slotIndex = cursor + Math.floor(i / courtCount);
      const court = courtIds[i % courtCount];
      const timeslot = timeslotIds[slotIndex];

      if (timeslot !== undefined && court !== undefined) {
        match.timeslotId = timeslot;
        match.courtId = court;
      } else {
        unassigned.push(match.id);
      }
      matches.push(match);
    }
    cursor += (slotsPerRound[r] ?? 0) + gap;
  }

  return { matches, unassigned };
}
