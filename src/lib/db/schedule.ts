import type { Match, MatchStatus, UUID } from '@/lib/core';
import {
  advanceAll,
  auditOf,
  formatOf,
  planLeague,
  planPlayoffs,
  planPoolDraw,
  planPoolPlay,
  playoffMatchesOf,
  poolMatchesOf,
  restSlotsOf,
} from '@/lib/event/engine';
import { scoreEdits } from '@/lib/event/score-history';
import type { EventSnapshot } from '@/lib/event/snapshot';
import { regenerateKeepingPlayed, withdrawParticipant } from '@/lib/event/withdraw';
import type { ScheduleConflict, SlotSuggestion } from '@/lib/scheduling';
import { assertRowsAffected, suggestSlots } from '@/lib/scheduling';
import type { Actor } from './authz';
import { requireOrganizer } from './authz';
import { ConflictError, InvalidInputError, NotFoundError } from './errors';
import { readSnapshot } from './snapshot';
import { withTransaction } from './tx';
import type { Db, Queryable } from './types';

/**
 * The schedule: generate it, move a match, withdraw a team, seed the
 * playoffs (#20, #21). Every decision is made by `src/lib/event/engine`; this
 * module authorizes, loads, and writes what it decided — in one transaction
 * per operation, with row counts asserted.
 */

const LOCKED = (m: Match) =>
  m.sets.length > 0 || m.status === 'live' || m.status === 'final' || m.status === 'forfeit';

export interface ScheduleReport {
  /** Matches the grid had no room for. */
  unplaced: UUID[];
  /** Pool matches nobody could referee. */
  unrefereed: UUID[];
  /** New matches moved off the grid because a played match holds their cell. */
  displaced: UUID[];
  /** Played or live matches kept exactly as they were. */
  kept: UUID[];
  /** The audit of the whole grid after the change. */
  conflicts: ScheduleConflict[];
}

/**
 * Generate (or regenerate) the schedule. Tournament: draw the pools if they
 * are not drawn yet, then pool play. League: the whole season. Played and
 * live matches are never touched (#21), so this is safe to press mid-event.
 */
export async function generateSchedule(
  db: Db,
  actor: Actor,
  competitionId: UUID,
): Promise<ScheduleReport> {
  return withTransaction(db, async (tx) => {
    await requireOrganizer(tx, actor, competitionId);
    await lockEvent(tx, competitionId);
    let snapshot = await readSnapshot(tx, competitionId);

    if (snapshot.competition.format === 'dropin') {
      throw new InvalidInputError(
        'A drop-in has no fixed schedule: the rotation is built at the door from who checked in.',
      );
    }
    if (snapshot.courts.filter((c) => c.isActive).length === 0) {
      throw new InvalidInputError('Add at least one court first.');
    }

    let plan: ReturnType<typeof planPoolPlay>;
    let scope: Match[];
    if (snapshot.competition.format === 'tournament') {
      if (snapshot.pools.length === 0) {
        let draw: ReturnType<typeof planPoolDraw>;
        try {
          draw = planPoolDraw(snapshot);
        } catch (error) {
          throw new InvalidInputError((error as Error).message);
        }
        await insertPools(tx, competitionId, draw.pools);
        snapshot = await readSnapshot(tx, competitionId);
      }
      plan = planPoolPlay(snapshot);
      scope = poolMatchesOf(snapshot);
    } else {
      if (snapshot.participants.length < 2)
        throw new InvalidInputError('A league needs at least two teams.');
      plan = planLeague(snapshot);
      scope = snapshot.matches.filter((m) => m.bracket == null);
    }

    const merged = regenerateKeepingPlayed({ existing: scope, generated: plan.matches });
    await writeMatches(tx, competitionId, merged.matches, scope);
    const after = await readSnapshot(tx, competitionId);
    return {
      unplaced: plan.unplaced,
      unrefereed: plan.unrefereed,
      displaced: merged.displaced,
      kept: merged.kept,
      conflicts: auditOf(after),
    };
  });
}

/**
 * Throw the pools away and draw again. Only before anything is played: a
 * redraw after a result would be a different tournament with a result
 * carried into it.
 */
export async function redrawPools(db: Db, actor: Actor, competitionId: UUID): Promise<void> {
  await withTransaction(db, async (tx) => {
    await requireOrganizer(tx, actor, competitionId);
    await lockEvent(tx, competitionId);
    const snapshot = await readSnapshot(tx, competitionId);
    if (snapshot.matches.some(LOCKED)) {
      throw new ConflictError(
        'Pool play has started. Pools cannot be redrawn once a match is played.',
      );
    }
    await tx.query('delete from match where competition_id = $1', [competitionId]);
    await tx.query('delete from pool where competition_id = $1', [competitionId]);
  });
}

async function insertPools(
  tx: Queryable,
  competitionId: UUID,
  pools: ReadonlyArray<{ name: string; participantIds: readonly UUID[] }>,
): Promise<void> {
  const inserted = await tx.query<{ id: string; name: string }>(
    `insert into pool (competition_id, name) select $1, unnest($2::text[]) returning id, name`,
    [competitionId, pools.map((p) => p.name)],
  );
  assertRowsAffected(pools.length, inserted.rowCount ?? 0, 'Inserting pools');
  const idOf = new Map(inserted.rows.map((r) => [r.name, r.id]));
  const poolIds: string[] = [];
  const participantIds: string[] = [];
  for (const pool of pools) {
    for (const participantId of pool.participantIds) {
      poolIds.push(idOf.get(pool.name) ?? '');
      participantIds.push(participantId);
    }
  }
  const members = await tx.query(
    'insert into pool_participant (pool_id, participant_id) select * from unnest($1::uuid[], $2::uuid[])',
    [poolIds, participantIds],
  );
  assertRowsAffected(poolIds.length, members.rowCount ?? 0, 'Filling pools');
}

/**
 * Serialize schedule edits to one event. Two organizers pressing "generate"
 * at once would otherwise each compute from a snapshot the other is about to
 * change.
 */
async function lockEvent(tx: Queryable, competitionId: UUID): Promise<void> {
  await tx.query('select id from competition where id = $1 for update', [competitionId]);
}

/**
 * Make the stored matches in `scope` equal `desired`: upsert every desired
 * match by its engine key, delete what is no longer wanted. Locked matches
 * (played, live) are never deleted — the caller's merge keeps them, and this
 * refuses to be the place a result disappears.
 */
export async function writeMatches(
  tx: Queryable,
  competitionId: UUID,
  desired: readonly Match[],
  scope: readonly Match[],
): Promise<void> {
  const keep = new Set(desired.map((m) => m.id));
  const doomed = scope.filter((m) => !keep.has(m.id));
  if (doomed.some(LOCKED)) {
    throw new ConflictError('That change would delete a played match. Nothing was saved.');
  }
  if (doomed.length > 0) {
    const deleted = await tx.query(
      'delete from match where competition_id = $1 and match_key = any($2::text[])',
      [competitionId, doomed.map((m) => m.id)],
    );
    assertRowsAffected(doomed.length, deleted.rowCount ?? 0, 'Removing matches');
  }
  if (desired.length === 0) return;

  const col = <T>(f: (m: Match) => T) => desired.map(f);
  const written = await tx.query(
    `insert into match (competition_id, match_key, session_id, pool_id, court_id, timeslot_id,
                        home_participant_id, away_participant_id, ref_participant_id,
                        bracket, round_label, status)
     select $1, t.* from unnest($2::text[], $3::uuid[], $4::uuid[], $5::uuid[], $6::uuid[],
                                $7::uuid[], $8::uuid[], $9::uuid[], $10::text[], $11::text[],
                                $12::match_status[]) as t
     on conflict (competition_id, match_key) do update set
       session_id = excluded.session_id, pool_id = excluded.pool_id,
       court_id = excluded.court_id, timeslot_id = excluded.timeslot_id,
       home_participant_id = excluded.home_participant_id,
       away_participant_id = excluded.away_participant_id,
       ref_participant_id = excluded.ref_participant_id,
       bracket = excluded.bracket, round_label = excluded.round_label, status = excluded.status`,
    [
      competitionId,
      col((m) => m.id),
      col((m) => m.sessionId),
      col((m) => m.poolId ?? null),
      col((m) => m.courtId ?? null),
      col((m) => m.timeslotId ?? null),
      col((m) => m.homeParticipantId ?? null),
      col((m) => m.awayParticipantId ?? null),
      col((m) => m.refParticipantId ?? null),
      col((m) => m.bracket ?? null),
      col((m) => m.roundLabel ?? null),
      col((m) => m.status),
    ],
  );
  assertRowsAffected(desired.length, written.rowCount ?? 0, 'Writing matches');
}

/** Replace a match's sets. Used by score entry and forfeits; history is the caller's. */
export async function writeSets(
  tx: Queryable,
  competitionId: UUID,
  matchKey: string,
  sets: ReadonlyArray<{ home: number; away: number }>,
): Promise<void> {
  const rowId = await matchRowId(tx, competitionId, matchKey);
  await tx.query('delete from match_set where match_id = $1', [rowId]);
  if (sets.length === 0) return;
  const inserted = await tx.query(
    `insert into match_set (match_id, set_number, home_points, away_points)
     select $1, n, h, a from unnest($2::int[], $3::int[]) with ordinality as t(h, a, n)`,
    [rowId, sets.map((s) => s.home), sets.map((s) => s.away)],
  );
  assertRowsAffected(sets.length, inserted.rowCount ?? 0, 'Writing sets');
}

export async function matchRowId(
  tx: Queryable,
  competitionId: UUID,
  matchKey: string,
): Promise<UUID> {
  const { rows } = await tx.query<{ id: string }>(
    'select id from match where competition_id = $1 and match_key = $2',
    [competitionId, matchKey],
  );
  const id = rows[0]?.id;
  if (!id) throw new NotFoundError('Match');
  return id;
}

/** Append score history rows (rule 8: never updated, never deleted). */
export async function appendEdits(
  tx: Queryable,
  competitionId: UUID,
  edits: ReturnType<typeof scoreEdits>,
): Promise<void> {
  if (edits.length === 0) return;
  const rowIds = new Map<string, UUID>();
  for (const key of new Set(edits.map((e) => e.matchId))) {
    rowIds.set(key, await matchRowId(tx, competitionId, key));
  }
  const col = <T>(f: (e: (typeof edits)[number]) => T) => edits.map(f);
  const inserted = await tx.query(
    `insert into match_set_edit (match_id, set_number, previous_home, previous_away, next_home,
                                 next_away, reason, edited_by, via_link_id, edited_at)
     select * from unnest($1::uuid[], $2::int[], $3::int[], $4::int[], $5::int[], $6::int[],
                          $7::text[], $8::uuid[], $9::uuid[], $10::timestamptz[])`,
    [
      col((e) => rowIds.get(e.matchId)),
      col((e) => e.setNumber),
      col((e) => e.previousHome),
      col((e) => e.previousAway),
      col((e) => e.nextHome),
      col((e) => e.nextAway),
      col((e) => e.reason ?? null),
      col((e) => e.editedBy ?? null),
      col((e) => e.viaLinkId ?? null),
      col((e) => e.editedAt),
    ],
  );
  assertRowsAffected(edits.length, inserted.rowCount ?? 0, 'Recording score history');
}

/**
 * Tap the match, pick a slot (#21). The move is saved even if it creates a
 * conflict — the organizer knows things the model does not — and the audit
 * of the grid after it comes back so the screen can say so.
 */
export async function moveMatch(
  db: Db,
  actor: Actor,
  competitionId: UUID,
  matchKey: string,
  to: { courtId: UUID | null; timeslotId: UUID | null },
): Promise<ScheduleConflict[]> {
  if ((to.courtId === null) !== (to.timeslotId === null)) {
    throw new InvalidInputError('A match is placed on a court and a time together, or not at all.');
  }
  return withTransaction(db, async (tx) => {
    await requireOrganizer(tx, actor, competitionId);
    await lockEvent(tx, competitionId);
    const snapshot = await readSnapshot(tx, competitionId);
    const match = snapshot.matches.find((m) => m.id === matchKey);
    if (!match) throw new NotFoundError('Match');
    if (to.courtId !== null && !snapshot.courts.some((c) => c.id === to.courtId)) {
      throw new InvalidInputError('That court is not one this event uses.');
    }
    let sessionId = match.sessionId;
    if (to.timeslotId !== null) {
      const slot = snapshot.timeslots.find((t) => t.id === to.timeslotId);
      if (!slot) throw new InvalidInputError('That time slot is not part of this event.');
      // A tournament's playoff may move to another day; a league fixture
      // moving weeks is a reschedule of the week (postponeSession), not a
      // tap-to-move.
      if (snapshot.competition.format === 'league' && slot.sessionId !== match.sessionId) {
        throw new InvalidInputError(
          'Moving a fixture to another week is done by rescheduling the week.',
        );
      }
      sessionId = slot.sessionId;
    }
    const updated = await tx.query(
      `update match set court_id = $3, timeslot_id = $4, session_id = $5
        where competition_id = $1 and match_key = $2`,
      [competitionId, matchKey, to.courtId, to.timeslotId, sessionId],
    );
    assertRowsAffected(1, updated.rowCount ?? 0, 'Moving the match');
    return auditOf(await readSnapshot(tx, competitionId));
  });
}

/** Where a match could legally go, with this event's windows and rest. */
export async function slotSuggestions(
  db: Queryable,
  actor: Actor,
  competitionId: UUID,
  matchKey: string,
): Promise<SlotSuggestion[]> {
  await requireOrganizer(db, actor, competitionId);
  const snapshot = await readSnapshot(db, competitionId);
  return suggestionsIn(snapshot, matchKey);
}

export function suggestionsIn(snapshot: EventSnapshot, matchKey: string): SlotSuggestion[] {
  const session = snapshot.matches.find((m) => m.id === matchKey)?.sessionId;
  const sessionSlots = snapshot.timeslots.filter((t) => t.sessionId === session);
  return suggestSlots({
    matchId: matchKey,
    matches: snapshot.matches,
    timeslots: snapshot.timeslots,
    courts: snapshot.courts,
    courtWindows: snapshot.courtWindows,
    minRestSlots: restSlotsOf(snapshot, sessionSlots),
  });
}

/** Mark a match delayed, cancelled, live, or back to scheduled. Results are score entry's job. */
export async function setMatchStatus(
  db: Db,
  actor: Actor,
  competitionId: UUID,
  matchKey: string,
  status: Extract<MatchStatus, 'scheduled' | 'live' | 'delayed' | 'cancelled'>,
): Promise<void> {
  await withTransaction(db, async (tx) => {
    await requireOrganizer(tx, actor, competitionId);
    const updated = await tx.query(
      `update match set status = $3
        where competition_id = $1 and match_key = $2 and status not in ('final', 'forfeit')`,
      [competitionId, matchKey, status],
    );
    if ((updated.rowCount ?? 0) !== 1) {
      throw new ConflictError('That match has a result. Change the score instead.');
    }
  });
}

/**
 * Withdraw a team (#21): its unplayed matches become forfeits to the
 * opponent, recorded as real sets with history, and nothing else moves. A
 * playoff forfeit advances the bracket like any other result.
 */
export async function withdrawTeam(
  db: Db,
  actor: Actor,
  competitionId: UUID,
  participantId: UUID,
  now: string,
): Promise<{ forfeited: string[]; refereeCleared: string[]; unresolved: string[] }> {
  return withTransaction(db, async (tx) => {
    await requireOrganizer(tx, actor, competitionId);
    await lockEvent(tx, competitionId);
    const snapshot = await readSnapshot(tx, competitionId);
    if (!snapshot.participants.some((p) => p.id === participantId)) throw new NotFoundError('Team');

    const result = withdrawParticipant({
      matches: snapshot.matches,
      participantId,
      format: (match) => formatOf(snapshot, match),
    });
    const changedIds = new Set([...result.forfeited, ...result.refereeCleared]);
    const changed = result.matches.filter((m) => changedIds.has(m.id));
    await writeMatches(tx, competitionId, changed, []);
    for (const id of result.forfeited) {
      const before = snapshot.matches.find((m) => m.id === id);
      const after = result.matches.find((m) => m.id === id);
      if (!before || !after) continue;
      const sets = after.sets.map((s) => ({ home: s.homePoints, away: s.awayPoints }));
      await writeSets(tx, competitionId, id, sets);
      await appendEdits(
        tx,
        competitionId,
        scoreEdits({
          matchId: id,
          previous: before.sets,
          next: sets,
          editedAt: now,
          editedBy: actor.userId,
          reason: 'Team withdrawn — forfeit',
        }),
      );
    }
    await advanceStoredBrackets(tx, competitionId);
    return {
      forfeited: result.forfeited,
      refereeCleared: result.refereeCleared,
      unresolved: result.unresolved,
    };
  });
}

/**
 * Seed the playoffs from the pool tables and place them (#20). Refused once a
 * playoff match has been played — reseeding then would rewrite a bracket
 * people are standing in; `bracketDrift` on the score confirmation is how a
 * late correction is surfaced instead.
 */
export async function seedPlayoffs(
  db: Db,
  actor: Actor,
  competitionId: UUID,
): Promise<ScheduleReport> {
  return withTransaction(db, async (tx) => {
    await requireOrganizer(tx, actor, competitionId);
    await lockEvent(tx, competitionId);
    const snapshot = await readSnapshot(tx, competitionId);
    if (snapshot.competition.format !== 'tournament') {
      throw new InvalidInputError('Only a tournament has playoffs.');
    }
    const existing = playoffMatchesOf(snapshot);
    if (existing.some(LOCKED)) {
      throw new ConflictError('The playoffs have started, so the bracket cannot be reseeded.');
    }
    let plan: ReturnType<typeof planPlayoffs>;
    try {
      plan = planPlayoffs(snapshot);
    } catch (error) {
      throw new InvalidInputError((error as Error).message);
    }
    await writeMatches(tx, competitionId, plan.matches, existing);
    const after = await readSnapshot(tx, competitionId);
    return {
      unplaced: plan.unplaced,
      unrefereed: [],
      displaced: [],
      kept: [],
      conflicts: auditOf(after),
    };
  });
}

/**
 * Re-run advancement on every tier and write any side that changed. Called
 * after every playoff result, so a corrected quarterfinal reshapes the rounds
 * after it (H14). A tied elimination match leaves its tier as it is and the
 * caller reports it (H15).
 */
export async function advanceStoredBrackets(
  tx: Queryable,
  competitionId: UUID,
): Promise<Array<{ tier: string; reason: string }>> {
  const snapshot = await readSnapshot(tx, competitionId);
  const playoff = playoffMatchesOf(snapshot);
  if (playoff.length === 0) return [];
  const { matches, stalled } = advanceAll(snapshot, playoff);
  const changed = matches.filter((m) => {
    const before = playoff.find((p) => p.id === m.id);
    return (
      before &&
      ((before.homeParticipantId ?? null) !== (m.homeParticipantId ?? null) ||
        (before.awayParticipantId ?? null) !== (m.awayParticipantId ?? null))
    );
  });
  for (const m of changed) {
    const updated = await tx.query(
      `update match set home_participant_id = $3, away_participant_id = $4
        where competition_id = $1 and match_key = $2`,
      [competitionId, m.id, m.homeParticipantId ?? null, m.awayParticipantId ?? null],
    );
    assertRowsAffected(1, updated.rowCount ?? 0, 'Advancing the bracket');
  }
  return stalled;
}
