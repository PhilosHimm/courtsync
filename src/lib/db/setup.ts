import type { Match, UUID } from '@/lib/core';
import { slotsThatFit, timeslotGrid, wallClockToInstant } from '@/lib/core';
import { assertRowsAffected } from '@/lib/scheduling';
import type { Actor } from './authz';
import { requireOrganizer } from './authz';
import { ConflictError, InvalidInputError } from './errors';
import type { NewParticipant, NewSession } from './events';
import { insertCourts, insertParticipants } from './events';
import { readSnapshot } from './snapshot';
import { withTransaction } from './tx';
import type { Db, Queryable } from './types';

/**
 * The setup wizard's saves (#20): one per step, each a whole-list replace of
 * what the step edits. "Saves on step change" — one step of work at risk,
 * never one keystroke of it.
 *
 * Every replace refuses to delete anything a played match depends on: a team
 * with a result is withdrawn, not deleted; a court or day with a result keeps
 * existing. Losing a recorded result to a setup edit is the failure this
 * product exists to prevent.
 */

const LOCKED = (m: Match) =>
  m.sets.length > 0 || m.status === 'live' || m.status === 'final' || m.status === 'forfeit';

export interface ParticipantEdit extends NewParticipant {
  /** Present for an entry that already exists; absent for a new one. */
  id?: UUID;
}

export async function saveParticipants(
  db: Db,
  actor: Actor,
  competitionId: UUID,
  entries: readonly ParticipantEdit[],
): Promise<void> {
  if (entries.some((e) => !e.name.trim())) throw new InvalidInputError('Every entry needs a name.');
  if (entries.length > 500)
    throw new InvalidInputError('Five hundred entries is the most one event can hold.');
  await withTransaction(db, async (tx) => {
    await requireOrganizer(tx, actor, competitionId);
    const snapshot = await readSnapshot(tx, competitionId);
    const existing = new Set(snapshot.participants.map((p) => p.id));
    for (const entry of entries) {
      if (entry.id && !existing.has(entry.id)) {
        throw new InvalidInputError('An entry in that list belongs to a different event.');
      }
    }

    const kept = new Set(entries.map((e) => e.id).filter(Boolean));
    const removed = snapshot.participants.filter((p) => !kept.has(p.id));
    const inPlayed = removed.filter((p) =>
      snapshot.matches.some(
        (m) => LOCKED(m) && (m.homeParticipantId === p.id || m.awayParticipantId === p.id),
      ),
    );
    if (inPlayed.length > 0) {
      throw new ConflictError(
        `${inPlayed.map((p) => p.name).join(', ')} already played. Withdraw a team instead of deleting it, so its results stay.`,
      );
    }
    if (removed.length > 0) {
      const deleted = await tx.query('delete from participant where id = any($1::uuid[])', [
        removed.map((p) => p.id),
      ]);
      assertRowsAffected(removed.length, deleted.rowCount ?? 0, 'Removing entries');
    }

    const updates = entries.filter((e) => e.id);
    for (const e of updates) {
      const updated = await tx.query(
        `update participant set name = $2, seed = $3, contact_name = $4, contact_email = $5,
                contact_phone = $6
          where id = $1 and competition_id = $7`,
        [
          e.id,
          e.name.trim(),
          e.seed ?? null,
          e.contactName?.trim() || null,
          e.contactEmail?.trim() || null,
          e.contactPhone?.trim() || null,
          competitionId,
        ],
      );
      assertRowsAffected(1, updated.rowCount ?? 0, 'Updating an entry');
      if (e.players) {
        await tx.query('delete from team_player where participant_id = $1', [e.id]);
        const names = e.players.map((n) => n.trim()).filter(Boolean);
        if (names.length > 0) {
          const inserted = await tx.query(
            'insert into team_player (participant_id, name) select $1, unnest($2::text[])',
            [e.id, names],
          );
          assertRowsAffected(names.length, inserted.rowCount ?? 0, 'Saving a roster');
        }
      }
    }
    await insertParticipants(
      tx,
      competitionId,
      entries.filter((e) => !e.id),
    );
  });
}

export interface CourtEdit {
  id?: UUID;
  name: string;
  isActive?: boolean;
}

/** The courts this event uses. A removed court is unlinked from the event, not deleted from the venue. */
export async function saveCourts(
  db: Db,
  actor: Actor,
  competitionId: UUID,
  courts: readonly CourtEdit[],
): Promise<void> {
  if (courts.some((c) => !c.name.trim())) throw new InvalidInputError('Every court needs a name.');
  if (new Set(courts.map((c) => c.name.trim().toLowerCase())).size !== courts.length) {
    throw new InvalidInputError('Two courts have the same name.');
  }
  await withTransaction(db, async (tx) => {
    await requireOrganizer(tx, actor, competitionId);
    const snapshot = await readSnapshot(tx, competitionId);
    const existing = new Set(snapshot.courts.map((c) => c.id));
    for (const court of courts) {
      if (court.id && !existing.has(court.id)) {
        throw new InvalidInputError('A court in that list belongs to a different event.');
      }
    }
    const kept = new Set(courts.map((c) => c.id).filter(Boolean));
    const removed = snapshot.courts.filter((c) => !kept.has(c.id));
    if (removed.some((c) => snapshot.matches.some((m) => LOCKED(m) && m.courtId === c.id))) {
      throw new ConflictError(
        'A match was played on a court you removed. Mark it out of service instead.',
      );
    }
    if (removed.length > 0) {
      const ids = removed.map((c) => c.id);
      // Matches on a removed court lose their place, not their existence.
      await tx.query(
        `update match set court_id = null, timeslot_id = null
          where competition_id = $1 and court_id = any($2::uuid[])`,
        [competitionId, ids],
      );
      const unlinked = await tx.query(
        'delete from competition_court where competition_id = $1 and court_id = any($2::uuid[])',
        [competitionId, ids],
      );
      assertRowsAffected(ids.length, unlinked.rowCount ?? 0, 'Removing courts from the event');
    }
    for (const court of courts.filter((c) => c.id)) {
      const updated = await tx.query('update court set name = $2, is_active = $3 where id = $1', [
        court.id,
        court.name.trim(),
        court.isActive ?? true,
      ]);
      assertRowsAffected(1, updated.rowCount ?? 0, 'Updating a court');
    }
    const fresh = courts.filter((c) => !c.id).map((c) => c.name);
    if (fresh.length > 0) {
      const venueId = snapshot.competition.venueId;
      if (!venueId) throw new Error('An event without a venue cannot hold courts.');
      await insertCourts(tx, competitionId, venueId, fresh);
    }
  });
}

export interface SessionEdit extends NewSession {
  id?: UUID;
}

/**
 * The days (tournament), weeks (league) or nights (drop-in) of the event.
 * A session whose date or hours change gets a new timeslot grid; matches on
 * the old grid lose their place and the report says how many. A session with
 * a played match cannot be moved or removed here — a league week that has to
 * move is postponed, which carries its fixtures with it.
 */
export async function saveSessions(
  db: Db,
  actor: Actor,
  competitionId: UUID,
  sessions: readonly SessionEdit[],
): Promise<{ unplaced: number }> {
  for (const [i, s] of sessions.entries()) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s.playDate))
      throw new InvalidInputError(`Session ${i + 1} needs a date.`);
    if (
      !/^\d{2}:\d{2}$/.test(s.startTime) ||
      !/^\d{2}:\d{2}$/.test(s.endTime) ||
      s.endTime <= s.startTime
    ) {
      throw new InvalidInputError(`Session ${i + 1} needs a start time before its end time.`);
    }
  }
  return withTransaction(db, async (tx) => {
    await requireOrganizer(tx, actor, competitionId);
    const snapshot = await readSnapshot(tx, competitionId);
    const byId = new Map(snapshot.sessions.map((s) => [s.id, s]));
    for (const s of sessions) {
      if (s.id && !byId.has(s.id))
        throw new InvalidInputError('A session in that list belongs to a different event.');
    }
    const played = (sessionId: UUID) =>
      snapshot.matches.some((m) => LOCKED(m) && m.sessionId === sessionId);
    const kept = new Set(sessions.map((s) => s.id).filter(Boolean));
    const removed = snapshot.sessions.filter((s) => !kept.has(s.id));
    if (removed.some((s) => played(s.id))) {
      throw new ConflictError(
        'A session you removed has results. Cancel it instead, so its results stay.',
      );
    }
    if (removed.length > 0) {
      await tx.query('delete from session where id = any($1::uuid[])', [removed.map((s) => s.id)]);
    }

    let unplaced = 0;
    const timeZone = snapshot.competition.timeZone ?? 'UTC';
    for (const [index, s] of sessions.entries()) {
      const sequence = index + 1;
      if (s.id) {
        const was = byId.get(s.id);
        if (!was) continue;
        const moved =
          was.playDate !== s.playDate || was.startTime !== s.startTime || was.endTime !== s.endTime;
        if (moved && played(s.id)) {
          throw new ConflictError(
            `Session ${sequence} has results, so its date and hours cannot change here.`,
          );
        }
        await tx.query(
          `update session set name = nullif($2, ''), play_date = $3::date, start_time = $4::time,
                  end_time = $5::time, sequence = $6 where id = $1`,
          [s.id, s.name?.trim() ?? '', s.playDate, s.startTime, s.endTime, sequence],
        );
        if (moved)
          unplaced += await rebuildGrid(tx, competitionId, s.id, s, snapshot.competition, timeZone);
      } else {
        const { rows } = await tx.query<{ id: string }>(
          `insert into session (competition_id, name, play_date, start_time, end_time, sequence)
           values ($1, nullif($2, ''), $3::date, $4::time, $5::time, $6) returning id`,
          [competitionId, s.name?.trim() ?? '', s.playDate, s.startTime, s.endTime, sequence],
        );
        const id = rows[0]?.id;
        if (!id) throw new Error('Inserting a session returned no row.');
        await rebuildGrid(tx, competitionId, id, s, snapshot.competition, timeZone);
      }
    }
    return { unplaced };
  });
}

/** Replace a session's slots with the grid its hours hold. Returns how many matches lost their place. */
async function rebuildGrid(
  tx: Queryable,
  competitionId: UUID,
  sessionId: UUID,
  session: NewSession,
  settings: { gameDurationMin: number; bufferMin: number },
  timeZone: string,
): Promise<number> {
  const displaced = await tx.query(
    `update match set court_id = null, timeslot_id = null
      where competition_id = $1 and timeslot_id in (select id from timeslot where session_id = $2)`,
    [competitionId, sessionId],
  );
  await tx.query('delete from timeslot where session_id = $1', [sessionId]);
  const grid = timeslotGrid({
    sessionId,
    playDate: session.playDate,
    startTime: session.startTime,
    count: slotsThatFit({
      ...session,
      durationMin: settings.gameDurationMin,
      bufferMin: settings.bufferMin,
    }),
    durationMin: settings.gameDurationMin,
    bufferMin: settings.bufferMin,
    timeZone,
  });
  if (grid.length > 0) {
    const inserted = await tx.query(
      `insert into timeslot (session_id, start_at, end_at)
       select $1, * from unnest($2::timestamptz[], $3::timestamptz[])`,
      [sessionId, grid.map((g) => g.startAt), grid.map((g) => g.endAt)],
    );
    assertRowsAffected(grid.length, inserted.rowCount ?? 0, 'Building timeslots');
  }
  return displaced.rowCount ?? 0;
}

/**
 * Stretch or move one slot — widening one into the lunch break that
 * `findBreaks` then reads back out of the timestamps (#20). Refused if it
 * would overlap its neighbour: two slots at once on one grid is a grid the
 * audit cannot reason about.
 */
export async function updateTimeslot(
  db: Db,
  actor: Actor,
  competitionId: UUID,
  timeslotId: UUID,
  wallClock: { startTime: string; endTime: string },
): Promise<void> {
  await withTransaction(db, async (tx) => {
    await requireOrganizer(tx, actor, competitionId);
    const snapshot = await readSnapshot(tx, competitionId);
    const slot = snapshot.timeslots.find((t) => t.id === timeslotId);
    if (!slot) throw new InvalidInputError('That time slot is not part of this event.');
    const session = snapshot.sessions.find((s) => s.id === slot.sessionId);
    if (!session) throw new InvalidInputError('That time slot has no session.');
    const zone = snapshot.competition.timeZone ?? 'UTC';
    const startAt = wallClockToInstant(session.playDate, wallClock.startTime, zone);
    const endAt = wallClockToInstant(session.playDate, wallClock.endTime, zone);
    if (Date.parse(endAt) <= Date.parse(startAt))
      throw new InvalidInputError('A slot has to end after it starts.');
    const clash = snapshot.timeslots.some(
      (t) =>
        t.sessionId === slot.sessionId &&
        t.id !== slot.id &&
        Date.parse(t.startAt) < Date.parse(endAt) &&
        Date.parse(startAt) < Date.parse(t.endAt),
    );
    if (clash) throw new InvalidInputError('That overlaps another slot on the same day.');
    const updated = await tx.query('update timeslot set start_at = $2, end_at = $3 where id = $1', [
      timeslotId,
      startAt,
      endAt,
    ]);
    assertRowsAffected(1, updated.rowCount ?? 0, 'Updating a time slot');
  });
}

export interface WindowEdit {
  courtId: UUID;
  sessionId: UUID;
  /** Wall-clock at the venue on that session's date. */
  startTime: string;
  endTime: string;
}

/** "Court 3 is only ours until noon." Replaces every window this event has. */
export async function saveCourtWindows(
  db: Db,
  actor: Actor,
  competitionId: UUID,
  windows: readonly WindowEdit[],
): Promise<void> {
  await withTransaction(db, async (tx) => {
    await requireOrganizer(tx, actor, competitionId);
    const snapshot = await readSnapshot(tx, competitionId);
    const zone = snapshot.competition.timeZone ?? 'UTC';
    const rows = windows.map((w, i) => {
      const session = snapshot.sessions.find((s) => s.id === w.sessionId);
      if (!session || !snapshot.courts.some((c) => c.id === w.courtId)) {
        throw new InvalidInputError(`Window ${i + 1} names a court or session outside this event.`);
      }
      const startAt = wallClockToInstant(session.playDate, w.startTime, zone);
      const endAt = wallClockToInstant(session.playDate, w.endTime, zone);
      if (Date.parse(endAt) <= Date.parse(startAt)) {
        throw new InvalidInputError(`Window ${i + 1} ends before it starts.`);
      }
      return { ...w, startAt, endAt };
    });
    await tx.query(
      `delete from court_window where session_id in (select id from session where competition_id = $1)`,
      [competitionId],
    );
    if (rows.length > 0) {
      const inserted = await tx.query(
        `insert into court_window (court_id, session_id, start_at, end_at)
         select * from unnest($1::uuid[], $2::uuid[], $3::timestamptz[], $4::timestamptz[])`,
        [
          rows.map((r) => r.courtId),
          rows.map((r) => r.sessionId),
          rows.map((r) => r.startAt),
          rows.map((r) => r.endAt),
        ],
      );
      assertRowsAffected(rows.length, inserted.rowCount ?? 0, 'Saving court windows');
    }
  });
}
