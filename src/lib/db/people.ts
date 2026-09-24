import { randomUUID } from 'node:crypto';
import type { AppUser, Attendance, AttendanceStatus, UUID } from '@/lib/core';
import { hostSet, join, leave, selfCheckIn, walkIn } from '@/lib/event/door';
import { planPostponement } from '@/lib/event/league';
import type { EventSnapshot } from '@/lib/event/snapshot';
import { assertRowsAffected } from '@/lib/scheduling';
import type { Actor } from './authz';
import { requireOrganizer } from './authz';
import { ConflictError, InvalidInputError, NotFoundError } from './errors';
import { enqueue } from './notify';
import { readSnapshot } from './snapshot';
import { withTransaction } from './tx';
import type { Db, Queryable } from './types';

/**
 * Players and hosts: joining and leaving a drop-in, checking in, walk-ins,
 * following a team, announcements, cancelling a night, moving a league week
 * (#25, #26, #28, and #27's triggers).
 */

const sessionLabel = (s: EventSnapshot['sessions'][number]) =>
  s.name ? `${s.name} (${s.playDate})` : s.playDate;

/** Replace one session's attendance with the list the door rules produced. */
async function writeAttendance(
  tx: Queryable,
  sessionId: UUID,
  list: readonly Attendance[],
): Promise<void> {
  await tx.query('delete from attendance where session_id = $1', [sessionId]);
  if (list.length === 0) return;
  const inserted = await tx.query(
    `insert into attendance (id, session_id, participant_id, status, waitlist_pos, recorded_at)
     select * from unnest($1::uuid[], $2::uuid[], $3::uuid[], $4::attendance_status[], $5::int[], $6::timestamptz[])`,
    [
      list.map((a) => a.id),
      list.map(() => sessionId),
      list.map((a) => a.participantId),
      list.map((a) => a.status),
      list.map((a) => a.waitlistPos ?? null),
      list.map((a) => a.recordedAt),
    ],
  );
  assertRowsAffected(list.length, inserted.rowCount ?? 0, 'Saving attendance');
}

async function dropInSession(tx: Queryable, competitionId: UUID, sessionId: UUID) {
  await tx.query('select id from session where id = $1 for update', [sessionId]);
  const snapshot = await readSnapshot(tx, competitionId);
  if (snapshot.competition.format !== 'dropin')
    throw new InvalidInputError('Only a drop-in has a door list.');
  const session = snapshot.sessions.find((s) => s.id === sessionId);
  if (!session) throw new NotFoundError('Session');
  return { snapshot, session, list: snapshot.attendance.filter((a) => a.sessionId === sessionId) };
}

async function notifyPromoted(
  tx: Queryable,
  snapshot: EventSnapshot,
  session: EventSnapshot['sessions'][number],
  promoted: readonly UUID[],
  now: string,
): Promise<void> {
  if (promoted.length === 0) return;
  const { rows } = await tx.query<{ user_id: string }>(
    'select user_id from participant where id = any($1::uuid[]) and user_id is not null',
    [promoted],
  );
  await enqueue(
    tx,
    rows.map((r) => r.user_id),
    {
      kind: 'promoted',
      eventName: snapshot.competition.name,
      eventId: snapshot.competition.id,
      sessionLabel: sessionLabel(session),
    },
    now,
  );
}

/** This person's participant row in a drop-in, created on first join. */
async function participantFor(tx: Queryable, competitionId: UUID, user: AppUser): Promise<UUID> {
  const existing = await tx.query<{ id: string }>(
    'select id from participant where competition_id = $1 and user_id = $2',
    [competitionId, user.id],
  );
  if (existing.rows[0]) return existing.rows[0].id;
  const name = user.displayName?.trim() || user.email?.split('@')[0] || 'Player';
  const { rows } = await tx.query<{ id: string }>(
    `insert into participant (competition_id, kind, name, user_id) values ($1, 'individual', $2, $3) returning id`,
    [competitionId, name, user.id],
  );
  const id = rows[0]?.id;
  if (!id) throw new Error('Creating a player returned no row.');
  return id;
}

/** A signed-in player joins a published drop-in session: in, or on the waitlist. */
export async function joinDropIn(
  db: Db,
  user: AppUser,
  competitionId: UUID,
  sessionId: UUID,
  now: string,
): Promise<{ status: AttendanceStatus; waitlistPos?: number }> {
  return withTransaction(db, async (tx) => {
    const { rows } = await tx.query<{ status: string }>(
      'select status from competition where id = $1',
      [competitionId],
    );
    if (rows[0]?.status !== 'published') throw new NotFoundError('Event');
    const { snapshot, session, list } = await dropInSession(tx, competitionId, sessionId);
    if (session.cancelledAt) throw new ConflictError('That session is cancelled.');
    const participantId = await participantFor(tx, competitionId, user);
    const result = join({
      attendance: list,
      capacity: snapshot.competition.capacity ?? null,
      participantId,
      sessionId,
      id: randomUUID(),
      now,
    });
    await writeAttendance(tx, sessionId, result.attendance);
    const mine = result.attendance.find((a) => a.participantId === participantId);
    return {
      status: mine?.status ?? 'registered',
      ...(mine?.waitlistPos ? { waitlistPos: mine.waitlistPos } : {}),
    };
  });
}

/** A player leaves; the first person waiting is promoted and told. */
export async function leaveDropIn(
  db: Db,
  user: AppUser,
  competitionId: UUID,
  sessionId: UUID,
  now: string,
): Promise<void> {
  await withTransaction(db, async (tx) => {
    const { snapshot, session, list } = await dropInSession(tx, competitionId, sessionId);
    const mine = await tx.query<{ id: string }>(
      'select id from participant where competition_id = $1 and user_id = $2',
      [competitionId, user.id],
    );
    const participantId = mine.rows[0]?.id;
    if (!participantId || !list.some((a) => a.participantId === participantId)) return;
    const result = leave({
      attendance: list,
      capacity: snapshot.competition.capacity ?? null,
      participantId,
    });
    await writeAttendance(tx, sessionId, result.attendance);
    await notifyPromoted(tx, snapshot, session, result.promoted, now);
  });
}

/** A registered player checks themselves in. */
export async function checkInSelf(
  db: Db,
  user: AppUser,
  competitionId: UUID,
  sessionId: UUID,
  now: string,
): Promise<void> {
  await withTransaction(db, async (tx) => {
    const { list } = await dropInSession(tx, competitionId, sessionId);
    const mine = await tx.query<{ id: string }>(
      'select id from participant where competition_id = $1 and user_id = $2',
      [competitionId, user.id],
    );
    const participantId = mine.rows[0]?.id;
    if (!participantId) throw new InvalidInputError('You are not signed up for this session.');
    try {
      await writeAttendance(tx, sessionId, selfCheckIn({ attendance: list, participantId, now }));
    } catch (error) {
      throw new InvalidInputError((error as Error).message);
    }
  });
}

/** The host sets anyone's status. Organizers only. */
export async function hostSetAttendance(
  db: Db,
  actor: Actor,
  competitionId: UUID,
  sessionId: UUID,
  participantId: UUID,
  status: AttendanceStatus,
  now: string,
): Promise<{ promoted: UUID[] }> {
  return withTransaction(db, async (tx) => {
    await requireOrganizer(tx, actor, competitionId);
    const { snapshot, session, list } = await dropInSession(tx, competitionId, sessionId);
    let result: ReturnType<typeof hostSet>;
    try {
      result = hostSet({
        attendance: list,
        capacity: snapshot.competition.capacity ?? null,
        participantId,
        status,
        now,
      });
    } catch (error) {
      throw new InvalidInputError((error as Error).message);
    }
    await writeAttendance(tx, sessionId, result.attendance);
    await notifyPromoted(tx, snapshot, session, result.promoted, now);
    return { promoted: result.promoted };
  });
}

/** Add a registered player (an existing participant) to a session as the host. */
export async function hostAddToSession(
  db: Db,
  actor: Actor,
  competitionId: UUID,
  sessionId: UUID,
  participantId: UUID,
  now: string,
): Promise<void> {
  await withTransaction(db, async (tx) => {
    await requireOrganizer(tx, actor, competitionId);
    const { snapshot, list } = await dropInSession(tx, competitionId, sessionId);
    if (!snapshot.participants.some((p) => p.id === participantId))
      throw new NotFoundError('Player');
    const result = join({
      attendance: list,
      capacity: snapshot.competition.capacity ?? null,
      participantId,
      sessionId,
      id: randomUUID(),
      now,
    });
    await writeAttendance(tx, sessionId, result.attendance);
  });
}

/** A walk-in, by name: a participant row and nothing more, checked in. */
export async function addWalkIn(
  db: Db,
  actor: Actor,
  competitionId: UUID,
  sessionId: UUID,
  name: string,
  now: string,
): Promise<UUID> {
  if (!name.trim()) throw new InvalidInputError('A walk-in needs a name.');
  return withTransaction(db, async (tx) => {
    await requireOrganizer(tx, actor, competitionId);
    const { list } = await dropInSession(tx, competitionId, sessionId);
    const { rows } = await tx.query<{ id: string }>(
      `insert into participant (competition_id, kind, name, notes) values ($1, 'individual', $2, 'Walk-in') returning id`,
      [competitionId, name.trim()],
    );
    const participantId = rows[0]?.id;
    if (!participantId) throw new Error('Adding a walk-in returned no row.');
    await writeAttendance(
      tx,
      sessionId,
      walkIn({ attendance: list, participantId, sessionId, id: randomUUID(), now }),
    );
    return participantId;
  });
}

/** Everyone who should hear about this event: players with accounts and people following a team. */
async function audienceOf(
  tx: Queryable,
  competitionId: UUID,
  sessionId: UUID | null,
): Promise<UUID[]> {
  const { rows } = await tx.query<{ user_id: string }>(
    `select distinct user_id from (
       select p.user_id from participant p
        where p.competition_id = $1 and p.user_id is not null
          and ($2::uuid is null or exists (select 1 from attendance a where a.participant_id = p.id and a.session_id = $2))
       union
       select f.user_id from participant_follow f join participant p on p.id = f.participant_id
        where p.competition_id = $1
     ) people`,
    [competitionId, sessionId],
  );
  return rows.map((r) => r.user_id);
}

/** Post an announcement and queue it to everyone following the event. */
export async function postAnnouncement(
  db: Db,
  actor: Actor,
  competitionId: UUID,
  input: { body: string; sessionId?: UUID | null },
  now: string,
): Promise<void> {
  const body = input.body.trim();
  if (!body) throw new InvalidInputError('Write something to announce.');
  if (body.length > 2000)
    throw new InvalidInputError('Keep an announcement under 2,000 characters.');
  await withTransaction(db, async (tx) => {
    await requireOrganizer(tx, actor, competitionId);
    const snapshot = await readSnapshot(tx, competitionId);
    if (input.sessionId && !snapshot.sessions.some((s) => s.id === input.sessionId)) {
      throw new NotFoundError('Session');
    }
    await tx.query(
      'insert into announcement (competition_id, session_id, body, created_by, created_at) values ($1, $2, $3, $4, $5)',
      [competitionId, input.sessionId ?? null, body, actor.userId, now],
    );
    await enqueue(
      tx,
      await audienceOf(tx, competitionId, input.sessionId ?? null),
      { kind: 'announcement', eventName: snapshot.competition.name, eventId: competitionId, body },
      now,
    );
  });
}

/**
 * Call a session off. Its results (if any) stay; the sessions after it are
 * untouched; everyone on its list and everyone following is told. A league
 * week that has to be played later is postponed instead.
 */
export async function cancelSession(
  db: Db,
  actor: Actor,
  competitionId: UUID,
  sessionId: UUID,
  reason: string | null,
  now: string,
): Promise<void> {
  await withTransaction(db, async (tx) => {
    await requireOrganizer(tx, actor, competitionId);
    const snapshot = await readSnapshot(tx, competitionId);
    const session = snapshot.sessions.find((s) => s.id === sessionId);
    if (!session) throw new NotFoundError('Session');
    if (session.cancelledAt) return;
    await tx.query('update session set cancelled_at = $2, cancel_reason = $3 where id = $1', [
      sessionId,
      now,
      reason?.trim() || null,
    ]);
    await tx.query(
      `update match set status = 'cancelled' where session_id = $1 and status in ('scheduled', 'delayed')`,
      [sessionId],
    );
    const label = sessionLabel(session);
    await tx.query(
      'insert into announcement (competition_id, session_id, body, created_by, created_at) values ($1, $2, $3, $4, $5)',
      [
        competitionId,
        sessionId,
        `${label} is cancelled.${reason?.trim() ? ` ${reason.trim()}` : ''}`,
        actor.userId,
        now,
      ],
    );
    await enqueue(
      tx,
      await audienceOf(tx, competitionId, null),
      {
        kind: 'session-cancelled',
        eventName: snapshot.competition.name,
        eventId: competitionId,
        sessionLabel: label,
        reason: reason?.trim() || null,
      },
      now,
    );
  });
}

/** Undo a cancellation. Matches it cancelled go back to scheduled. */
export async function reinstateSession(
  db: Db,
  actor: Actor,
  competitionId: UUID,
  sessionId: UUID,
): Promise<void> {
  await withTransaction(db, async (tx) => {
    await requireOrganizer(tx, actor, competitionId);
    const updated = await tx.query(
      'update session set cancelled_at = null, cancel_reason = null where id = $1 and competition_id = $2',
      [sessionId, competitionId],
    );
    assertRowsAffected(1, updated.rowCount ?? 0, 'Reinstating the session');
    await tx.query(
      `update match set status = 'scheduled' where session_id = $1 and status = 'cancelled'`,
      [sessionId],
    );
  });
}

/** Move a league week, alone or with every week after it (#28). */
export async function postponeSession(
  db: Db,
  actor: Actor,
  competitionId: UUID,
  sessionId: UUID,
  newDate: string,
  mode: 'only' | 'cascade',
  now: string,
): Promise<{ moved: UUID[] }> {
  return withTransaction(db, async (tx) => {
    await requireOrganizer(tx, actor, competitionId);
    await tx.query('select id from competition where id = $1 for update', [competitionId]);
    const snapshot = await readSnapshot(tx, competitionId);
    let plan: ReturnType<typeof planPostponement>;
    try {
      plan = planPostponement({
        sessions: snapshot.sessions,
        timeslots: snapshot.timeslots,
        matches: snapshot.matches,
        sessionId,
        newDate,
        mode,
        timeZone: snapshot.competition.timeZone ?? 'UTC',
      });
    } catch (error) {
      throw new InvalidInputError((error as Error).message);
    }
    const moved = new Set(plan.moved);
    for (const s of plan.sessions.filter((x) => moved.has(x.id))) {
      await tx.query('update session set play_date = $2::date where id = $1', [s.id, s.playDate]);
    }
    for (const t of plan.timeslots.filter((x) => moved.has(x.sessionId))) {
      await tx.query('update timeslot set start_at = $2, end_at = $3 where id = $1', [
        t.id,
        t.startAt,
        t.endAt,
      ]);
    }
    if (plan.moved.length > 0) {
      const lines = plan.sessions
        .filter((s) => moved.has(s.id))
        .map((s) => `${s.name ?? `Week ${s.sequence ?? ''}`.trim()} is now ${s.playDate}.`);
      await enqueue(
        tx,
        await audienceOf(tx, competitionId, null),
        {
          kind: 'schedule-changed',
          eventName: snapshot.competition.name,
          eventId: competitionId,
          line: lines.join(' '),
        },
        now,
      );
    }
    return { moved: plan.moved };
  });
}

/** Follow a team on a published event, for "my schedule". */
export async function follow(db: Queryable, user: AppUser, participantId: UUID): Promise<void> {
  const { rows } = await db.query<{ status: string }>(
    `select c.status from participant p join competition c on c.id = p.competition_id where p.id = $1`,
    [participantId],
  );
  if (rows[0]?.status !== 'published') throw new NotFoundError('Team');
  await db.query(
    'insert into participant_follow (user_id, participant_id) values ($1, $2) on conflict do nothing',
    [user.id, participantId],
  );
}

export async function unfollow(db: Queryable, user: AppUser, participantId: UUID): Promise<void> {
  await db.query('delete from participant_follow where user_id = $1 and participant_id = $2', [
    user.id,
    participantId,
  ]);
}

/** The participants this person plays as or follows, with their published events. */
export async function myParticipants(
  db: Queryable,
  user: AppUser,
): Promise<Array<{ participantId: UUID; competitionId: UUID; how: 'plays' | 'follows' }>> {
  const { rows } = await db.query<{
    participant_id: string;
    competition_id: string;
    how: 'plays' | 'follows';
  }>(
    `select p.id as participant_id, p.competition_id, 'plays' as how
       from participant p join competition c on c.id = p.competition_id
      where p.user_id = $1 and c.status = 'published'
     union
     select p.id, p.competition_id, 'follows'
       from participant_follow f join participant p on p.id = f.participant_id
       join competition c on c.id = p.competition_id
      where f.user_id = $1 and c.status = 'published'`,
    [user.id],
  );
  return rows.map((r) => ({
    participantId: r.participant_id,
    competitionId: r.competition_id,
    how: r.how,
  }));
}
