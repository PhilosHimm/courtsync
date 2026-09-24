import type { Match, MatchSet, MatchStatus, UUID } from '@/lib/core';
import type { SetFormat } from '@/lib/scheduling';

/**
 * Two edits an organizer makes to a live schedule (#21), both chosen for
 * 8:52 on event day rather than for a demo.
 */

/**
 * Statuses that mean the match is over. A live match is not: a team walking
 * out mid-match forfeits it like any other.
 */
const SETTLED: ReadonlySet<MatchStatus> = new Set(['final', 'forfeit', 'cancelled']);

/** A match regeneration must not touch: anything scored, or anything started. */
const isLocked = (match: Match): boolean =>
  match.sets.length > 0 ||
  match.status === 'live' ||
  match.status === 'final' ||
  match.status === 'forfeit';

export interface WithdrawInput {
  matches: readonly Match[];
  participantId: UUID;
  /** The set format each match is played to. The forfeit is recorded to its targets. */
  format: (match: Match) => SetFormat;
}

export interface WithdrawResult {
  matches: Match[];
  /** Matches turned into forfeits, in the order given. */
  forfeited: UUID[];
  /** Matches this team was refereeing, now with nobody. The organizer reassigns. */
  refereeCleared: UUID[];
  /**
   * Matches of theirs with no opponent yet — a semifinal waiting on a
   * quarter. There is nobody to award a forfeit to, so they are left for the
   * bracket to resolve and reported rather than guessed at.
   */
  unresolved: UUID[];
}

/**
 * Withdraw a team: its unplayed matches become forfeits to the opponent, and
 * everything else stays exactly where it was.
 *
 * Chosen over regenerating, so nobody has to re-read a schedule they already
 * photographed. The forfeits keep their court and slot — the gap is left,
 * deliberately, rather than closed up by moving other people's matches.
 *
 * The forfeit is recorded as real sets, each to the set's target with the
 * withdrawn side on zero, and only as many as it takes to win: two in a
 * best-of-three, every set in a format with no decider. How much of that
 * reaches the table is the competition's forfeit policy, applied by
 * `computeStandings` — this records what happened and decides nothing else.
 */
export function withdrawParticipant(input: WithdrawInput): WithdrawResult {
  const { participantId } = input;
  const forfeited: UUID[] = [];
  const refereeCleared: UUID[] = [];
  const unresolved: UUID[] = [];

  const matches = input.matches.map((match): Match => {
    if (SETTLED.has(match.status)) return match;

    const home = match.homeParticipantId === participantId;
    const away = match.awayParticipantId === participantId;

    if (home || away) {
      const opponent = home ? match.awayParticipantId : match.homeParticipantId;
      if (!opponent) {
        unresolved.push(match.id);
        return match;
      }
      forfeited.push(match.id);
      const format = input.format(match);
      const toWin =
        format.deciderSetNumber === null
          ? format.rules.length
          : Math.floor(format.rules.length / 2) + 1;
      const sets: MatchSet[] = format.rules.slice(0, toWin).map((rule, index) => ({
        id: `${match.id}-forfeit-${index + 1}`,
        matchId: match.id,
        setNumber: index + 1,
        homePoints: home ? 0 : rule.target,
        awayPoints: home ? rule.target : 0,
      }));
      return { ...match, status: 'forfeit', sets };
    }

    if (match.refParticipantId === participantId) {
      refereeCleared.push(match.id);
      return { ...match, refParticipantId: null };
    }
    return match;
  });

  return { matches, forfeited, refereeCleared, unresolved };
}

export interface RegenerateResult {
  matches: Match[];
  /** Existing matches kept exactly as they were — scored or started. */
  kept: UUID[];
  /**
   * New matches taken off the grid because their cell, or one of their
   * teams, is held by a kept match at that time. Left for the organizer to
   * place (`suggestSlots` offers where).
   */
  displaced: UUID[];
}

/**
 * Take a freshly generated schedule, but never touch a match that has been
 * played or is being played.
 *
 * A match with a score, or marked live, is kept exactly as recorded —
 * including its court and slot, even if regeneration would have put it
 * elsewhere. A kept match that regeneration no longer produces at all is
 * kept too: deleting a recorded result because the field changed is
 * inventing history in the other direction. This is what makes the button
 * safe to press at 1pm.
 */
export function regenerateKeepingPlayed(input: {
  existing: readonly Match[];
  generated: readonly Match[];
}): RegenerateResult {
  const locked = input.existing.filter(isLocked);
  const lockedIds = new Set(locked.map((m) => m.id));
  const kept = locked.map((m) => m.id);

  const cells = new Set<string>();
  const busy = new Set<string>();
  const cell = (court: UUID, slot: UUID) => `${court}\u0000${slot}`;
  for (const match of locked) {
    if (match.courtId && match.timeslotId) cells.add(cell(match.courtId, match.timeslotId));
    if (match.timeslotId) {
      for (const id of [match.homeParticipantId, match.awayParticipantId, match.refParticipantId]) {
        if (id) busy.add(cell(id, match.timeslotId));
      }
    }
  }

  const displaced: UUID[] = [];
  const fresh = input.generated
    .filter((match) => !lockedIds.has(match.id))
    .map((match): Match => {
      const slot = match.timeslotId;
      if (!slot) return match;
      const clashes =
        (match.courtId != null && cells.has(cell(match.courtId, slot))) ||
        [match.homeParticipantId, match.awayParticipantId, match.refParticipantId].some(
          (id) => id != null && busy.has(cell(id, slot)),
        );
      if (!clashes) return match;
      displaced.push(match.id);
      return { ...match, courtId: null, timeslotId: null };
    });

  // Kept matches first in the order they existed, then the new schedule —
  // but a kept match that the generator also produced sits where the
  // generator put it in the list, so the order still reads as a schedule.
  const generatedOrder = new Map(input.generated.map((m, i) => [m.id, i]));
  const byId = new Map<UUID, Match>([...locked, ...fresh].map((m) => [m.id, m]));
  const orderedIds = [
    ...locked.filter((m) => !generatedOrder.has(m.id)).map((m) => m.id),
    ...input.generated.map((m) => m.id),
  ];
  const matches = orderedIds.map((id) => byId.get(id)).filter((m): m is Match => m !== undefined);

  return { matches, kept, displaced };
}
