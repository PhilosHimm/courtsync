import type { Match, UUID } from '@/lib/core';
import { POOL_PLAY_ROUND_LABEL } from '@/lib/core';
import type { CourtCell } from './court-availability';
import { blockedSet, cellKey } from './court-availability';
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
  /**
   * Court-and-slot cells that may not be used — a court outside its
   * availability window. Build it with `unavailableCells`. Omitted or empty,
   * every court is free in every slot and the schedule is exactly what it was
   * before windows existed.
   */
  unavailable?: readonly CourtCell[];
}

export interface PoolPlayOutput {
  matches: Match[];
  /** Match ids that could not be placed on any court/timeslot. */
  unassigned: UUID[];
}

/**
 * Empty slots to leave after each round.
 *
 * A participant plays once per round, so the gap between rounds *is* their
 * rest: `minRestSlots` empty slots between two rounds means sitting out that
 * many before playing again.
 *
 * Two things this gets right that a single uniform gap did not.
 *
 * It aims for exactly `minRestSlots` rather than spreading rounds as far
 * apart as the day allows. Teams want to go home, not linger for six hours
 * because the venue was booked for six hours — and before this the parameter
 * was accepted, documented, and then completely ignored.
 *
 * And when the day is too tight to honour that, the slack that does exist is
 * shared out a slot at a time instead of being floor-divided away. With three
 * rounds in four slots, a uniform gap floors to zero and everybody plays three
 * in a row; handing the one spare slot to the first boundary makes it two.
 * That is audit finding H6, which the original spec only exercised on a day
 * with plenty of room.
 */
function restGaps(args: {
  roundCount: number;
  slotsNeeded: number;
  slotCount: number;
  minRestSlots: number;
}): number[] {
  const { roundCount, slotsNeeded, slotCount, minRestSlots } = args;
  const boundaries = roundCount - 1;
  if (boundaries <= 0) return new Array(Math.max(0, roundCount)).fill(0);

  const spare = Math.max(0, slotCount - slotsNeeded);

  // Enough room to give every boundary the rest it asked for.
  if (spare >= minRestSlots * boundaries) {
    const gaps = new Array(roundCount).fill(minRestSlots);
    gaps[roundCount - 1] = 0; // nothing follows the last round
    return gaps;
  }

  // Not enough. Share what there is, earliest boundaries first, so no
  // boundary is starved to zero while another gets more than it needs.
  const base = Math.floor(spare / boundaries);
  const remainder = spare % boundaries;
  const gaps = new Array(roundCount).fill(0);
  for (let i = 0; i < boundaries; i++) gaps[i] = base + (i < remainder ? 1 : 0);
  return gaps;
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

  // Placement leans on pools being disjoint: it packs a whole global round
  // into consecutive slots on the strength of nobody appearing twice in it.
  // A participant entered in two pools quietly breaks that and produces a
  // schedule with them on two courts at once, so it is refused here rather
  // than discovered on the day.
  const poolOfParticipant = new Map<UUID, string>();
  for (const pool of pools) {
    for (const participantId of pool.participantIds) {
      const existing = poolOfParticipant.get(participantId);
      if (existing !== undefined && existing !== pool.name) {
        throw new Error(
          `Cannot build pool play: participant ${participantId} is in both pool ${existing} and pool ${pool.name}. Each participant belongs to exactly one pool.`,
        );
      }
      poolOfParticipant.set(participantId, pool.name);
    }
  }

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
          roundLabel: POOL_PLAY_ROUND_LABEL,
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

  const blocked = blockedSet(input.unavailable);

  /**
   * Where each match of each round lands, given how many slots are skipped
   * before each round starts. A round fills its slots court by court, in
   * court order, skipping closed cells, and spills into the next slot when
   * the current one is full — so with nothing closed it is exactly the old
   * `slot = cursor + floor(i / courtCount)`, `court = i % courtCount`.
   *
   * A slot where every court is closed (lunch) is passed over rather than
   * ending the day. A round never shares a slot with the one before it:
   * each participant plays once per round, and that is what keeps them off
   * two courts at once.
   */
  const place = (gaps: readonly number[]) => {
    const cells: Array<Array<{ courtId: UUID; timeslotId: UUID } | null>> = [];
    const slotsUsed: number[] = [];
    let cursor = 0;
    for (let r = 0; r < globalRounds.length; r++) {
      const round = globalRounds[r] ?? [];
      const placed: Array<{ courtId: UUID; timeslotId: UUID } | null> = [];
      let slot = cursor;
      let lastUsed = cursor - 1;
      let remaining = round.length;
      while (remaining > 0 && slot < slotCount) {
        const timeslotId = timeslotIds[slot];
        let usedHere = false;
        for (const courtId of courtIds) {
          if (remaining === 0 || timeslotId === undefined) break;
          if (blocked.has(cellKey(courtId, timeslotId))) continue;
          placed.push({ courtId, timeslotId });
          remaining -= 1;
          usedHere = true;
        }
        if (usedHere) lastUsed = slot;
        slot += 1;
      }
      while (placed.length < round.length) placed.push(null);
      cells.push(placed);
      const used = Math.max(0, lastUsed - cursor + 1);
      slotsUsed.push(used);
      cursor += used + (gaps[r] ?? 0);
    }
    return { cells, slotsUsed };
  };

  // First pass without rest, to learn how many slots the rounds need on this
  // grid; then share the spare slots out as rest and place for real.
  const packed = place([]);
  const gaps = restGaps({
    roundCount: globalRounds.length,
    slotsNeeded: packed.slotsUsed.reduce((sum, n) => sum + n, 0),
    slotCount,
    minRestSlots: Math.max(0, Math.trunc(input.minRestSlots ?? 0)),
  });
  const { cells } = place(gaps);

  for (let r = 0; r < globalRounds.length; r++) {
    const roundMatches = globalRounds[r] ?? [];
    for (let i = 0; i < roundMatches.length; i++) {
      const match = roundMatches[i];
      if (!match) continue;
      const cell = cells[r]?.[i];
      if (cell) {
        match.timeslotId = cell.timeslotId;
        match.courtId = cell.courtId;
      } else {
        unassigned.push(match.id);
      }
      matches.push(match);
    }
  }

  return { matches, unassigned };
}
