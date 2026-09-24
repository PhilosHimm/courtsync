import type {
  CompetitionFormat,
  ForfeitPolicy,
  ParticipantKind,
  Tiebreaker,
  UUID,
} from '@/lib/core';
import { COMPETITION_FORMATS, isTimeZone, slotsThatFit, timeslotGrid } from '@/lib/core';
import { uniqueSlug } from '@/lib/event/slug';
import type { EventSnapshot, EventSummary } from '@/lib/event/snapshot';
import { assertRowsAffected, resolveTiebreakerOrder } from '@/lib/scheduling';
import type { Actor } from './authz';
import { requireOrganizer, requireOwner } from './authz';
import { ConflictError, InvalidInputError, NotFoundError } from './errors';
import { iso } from './rows';
import { readSnapshot } from './snapshot';
import { withTransaction } from './tx';
import type { Db, Queryable } from './types';
import { findUserByEmail } from './users';

/**
 * Events: create, list, load, change, publish, archive, delete (#19).
 *
 * Every function that writes takes the acting user and checks it against the
 * row itself (rule 6), inside the same transaction as the write (rule 5).
 */

export interface NewSession {
  name?: string;
  /** YYYY-MM-DD, at the venue. */
  playDate: string;
  /** HH:mm, at the venue. */
  startTime: string;
  endTime: string;
}

export interface NewParticipant {
  name: string;
  kind?: ParticipantKind;
  seed?: number;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  /** Roster names, for a team. A name on a sheet, not an account. */
  players?: string[];
}

export interface NewEventInput {
  name: string;
  format: CompetitionFormat;
  description?: string;
  timeZone: string;
  venue?: { name: string; address?: string };
  registrationFee?: number;
  gameDurationMin: number;
  bufferMin: number;
  poolCount?: number;
  bracketTiers?: string[];
  minRestMin?: number;
  playersPerSide?: number;
  capacity?: number;
  skillLabel?: string;
  forfeitPolicy?: ForfeitPolicy;
  tiebreakerOrder?: Tiebreaker[];
  courts: string[];
  sessions: NewSession[];
  participants: NewParticipant[];
}

const clockPattern = /^([01]\d|2[0-3]):[0-5]\d$/;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

/** Everything wrong with a new event, in words the organizer can act on. */
export function newEventProblems(input: NewEventInput): string[] {
  const problems: string[] = [];
  if (!input.name.trim()) problems.push('Give the event a name.');
  if (input.name.length > 120) problems.push('Keep the name under 120 characters.');
  if (!COMPETITION_FORMATS.includes(input.format)) problems.push('Choose a format.');
  if (!isTimeZone(input.timeZone)) problems.push(`"${input.timeZone}" is not a time zone.`);
  if (
    !Number.isInteger(input.gameDurationMin) ||
    input.gameDurationMin < 5 ||
    input.gameDurationMin > 240
  ) {
    problems.push('Match length must be between 5 and 240 minutes.');
  }
  if (!Number.isInteger(input.bufferMin) || input.bufferMin < 0 || input.bufferMin > 120) {
    problems.push('Time between matches must be between 0 and 120 minutes.');
  }
  if (input.registrationFee !== undefined && !(input.registrationFee >= 0)) {
    problems.push('The fee cannot be negative.');
  }
  if (input.courts.length > 50) problems.push('Fifty courts is the most one event can use.');
  if (input.courts.some((c) => !c.trim())) problems.push('Every court needs a name.');
  if (new Set(input.courts.map((c) => c.trim().toLowerCase())).size !== input.courts.length) {
    problems.push('Two courts have the same name.');
  }
  if (input.sessions.length > 60) problems.push('Sixty sessions is the most one event can hold.');
  if (input.format === 'tournament' && input.sessions.length > 7) {
    problems.push('A tournament runs over a week at most.');
  }
  for (const [i, s] of input.sessions.entries()) {
    const n = `Session ${i + 1}`;
    if (!datePattern.test(s.playDate)) problems.push(`${n} needs a date.`);
    if (!clockPattern.test(s.startTime) || !clockPattern.test(s.endTime)) {
      problems.push(`${n} needs a start and end time.`);
    } else if (s.endTime <= s.startTime) {
      problems.push(`${n} ends before it starts.`);
    }
  }
  if (input.participants.length > 500)
    problems.push('Five hundred entries is the most one event can hold.');
  if (input.participants.some((p) => !p.name.trim())) problems.push('Every entry needs a name.');
  if (input.tiebreakerOrder) {
    try {
      resolveTiebreakerOrder(input.tiebreakerOrder);
    } catch (error) {
      problems.push((error as Error).message);
    }
  }
  if (input.capacity !== undefined && !(Number.isInteger(input.capacity) && input.capacity > 0)) {
    problems.push('Capacity must be a whole number above zero.');
  }
  if (
    input.playersPerSide !== undefined &&
    !(
      Number.isInteger(input.playersPerSide) &&
      input.playersPerSide > 0 &&
      input.playersPerSide <= 12
    )
  ) {
    problems.push('Players per side must be between 1 and 12.');
  }
  return problems;
}

/** Create an event with its venue, courts, sessions, timeslots and entries. */
export async function createEvent(db: Db, actor: Actor, input: NewEventInput): Promise<UUID> {
  const problems = newEventProblems(input);
  if (problems.length > 0) throw new InvalidInputError(problems.join(' '));

  return withTransaction(db, async (tx) => {
    const taken = await tx.query<{ slug: string }>(
      'select slug from competition where created_by = $1',
      [actor.userId],
    );
    const slug = uniqueSlug(input.name, new Set(taken.rows.map((r) => r.slug)));

    // Courts belong to a venue (sql/0002). An event typed in without one
    // still has a gym; it gets a venue named after the event, which the
    // organizer can rename.
    const venue = await tx.query<{ id: string }>(
      'insert into venue (name, address, created_by) values ($1, $2, $3) returning id',
      [
        input.venue?.name.trim() || `${input.name.trim()} venue`,
        input.venue?.address ?? null,
        actor.userId,
      ],
    );
    const venueId = venue.rows[0]?.id;
    if (!venueId) throw new Error('Creating a venue returned no row.');

    const created = await tx.query<{ id: string }>(
      `insert into competition (
         name, slug, format, created_by, venue_id, registration_fee, game_duration_min, buffer_min,
         forfeit_policy, tiebreaker_order, description, pool_count, bracket_tiers, min_rest_min,
         players_per_side, capacity, skill_label, time_zone)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
       returning id`,
      [
        input.name.trim(),
        slug,
        input.format,
        actor.userId,
        venueId,
        input.registrationFee ?? null,
        input.gameDurationMin,
        input.bufferMin,
        input.forfeitPolicy ?? 'setsOnly',
        input.tiebreakerOrder ?? null,
        input.description?.trim() || null,
        input.poolCount ?? null,
        input.bracketTiers ?? null,
        input.minRestMin ?? 0,
        input.playersPerSide ?? null,
        input.capacity ?? null,
        input.skillLabel?.trim() || null,
        input.timeZone,
      ],
    );
    const competitionId = created.rows[0]?.id;
    if (!competitionId) throw new Error('Creating an event returned no row.');

    await insertCourts(tx, competitionId, venueId, input.courts);
    await insertSessions(tx, competitionId, input);
    await insertParticipants(tx, competitionId, input.participants);
    return competitionId;
  });
}

export async function insertCourts(
  tx: Queryable,
  competitionId: UUID,
  venueId: UUID,
  names: readonly string[],
): Promise<void> {
  if (names.length === 0) return;
  const courts = await tx.query<{ id: string }>(
    `insert into court (venue_id, name)
     select $1, name from unnest($2::text[]) with ordinality as t(name, n) order by n
     returning id`,
    [venueId, names.map((n) => n.trim())],
  );
  assertRowsAffected(names.length, courts.rowCount ?? 0, 'Inserting courts');
  const linked = await tx.query(
    'insert into competition_court (competition_id, court_id) select $1, unnest($2::uuid[])',
    [competitionId, courts.rows.map((r) => r.id)],
  );
  assertRowsAffected(names.length, linked.rowCount ?? 0, 'Linking courts to the event');
}

/** Sessions, each with the timeslot grid its hours hold. */
async function insertSessions(
  tx: Queryable,
  competitionId: UUID,
  input: Pick<NewEventInput, 'sessions' | 'gameDurationMin' | 'bufferMin' | 'timeZone'>,
): Promise<void> {
  if (input.sessions.length === 0) return;
  const sessions = await tx.query<{ id: string; sequence: number }>(
    `insert into session (competition_id, name, play_date, start_time, end_time, sequence)
     select $1, nullif(name, ''), play_date::date, start_time::time, end_time::time, n
       from unnest($2::text[], $3::text[], $4::text[], $5::text[]) with ordinality
            as t(name, play_date, start_time, end_time, n)
     returning id, sequence`,
    [
      competitionId,
      input.sessions.map((s) => s.name?.trim() ?? ''),
      input.sessions.map((s) => s.playDate),
      input.sessions.map((s) => s.startTime),
      input.sessions.map((s) => s.endTime),
    ],
  );
  assertRowsAffected(input.sessions.length, sessions.rowCount ?? 0, 'Inserting sessions');

  const starts: string[] = [];
  const ends: string[] = [];
  const sessionIds: string[] = [];
  for (const row of sessions.rows) {
    const session = input.sessions[row.sequence - 1];
    if (!session) continue;
    const grid = timeslotGrid({
      sessionId: row.id,
      playDate: session.playDate,
      startTime: session.startTime,
      count: slotsThatFit({
        startTime: session.startTime,
        endTime: session.endTime,
        durationMin: input.gameDurationMin,
        bufferMin: input.bufferMin,
      }),
      durationMin: input.gameDurationMin,
      bufferMin: input.bufferMin,
      timeZone: input.timeZone,
    });
    for (const slot of grid) {
      sessionIds.push(row.id);
      starts.push(slot.startAt);
      ends.push(slot.endAt);
    }
  }
  if (sessionIds.length === 0) return;
  const slots = await tx.query(
    `insert into timeslot (session_id, start_at, end_at)
     select * from unnest($1::uuid[], $2::timestamptz[], $3::timestamptz[])`,
    [sessionIds, starts, ends],
  );
  assertRowsAffected(sessionIds.length, slots.rowCount ?? 0, 'Inserting timeslots');
}

export async function insertParticipants(
  tx: Queryable,
  competitionId: UUID,
  participants: readonly NewParticipant[],
): Promise<string[]> {
  if (participants.length === 0) return [];
  const inserted = await tx.query<{ id: string; n: string }>(
    `insert into participant (competition_id, kind, name, seed, contact_name, contact_email, contact_phone)
     select $1, kind::participant_kind, name, seed, nullif(cn, ''), nullif(ce, ''), nullif(cp, '')
       from unnest($2::text[], $3::text[], $4::int[], $5::text[], $6::text[], $7::text[])
            as t(kind, name, seed, cn, ce, cp)
     returning id`,
    [
      competitionId,
      participants.map((p) => p.kind ?? 'team'),
      participants.map((p) => p.name.trim()),
      participants.map((p) => p.seed ?? null),
      participants.map((p) => p.contactName?.trim() ?? ''),
      participants.map((p) => p.contactEmail?.trim() ?? ''),
      participants.map((p) => p.contactPhone?.trim() ?? ''),
    ],
  );
  assertRowsAffected(participants.length, inserted.rowCount ?? 0, 'Inserting participants');
  const ids = inserted.rows.map((r) => r.id);

  const playerParticipant: string[] = [];
  const playerName: string[] = [];
  participants.forEach((p, i) => {
    for (const name of p.players ?? []) {
      if (!name.trim()) continue;
      const id = ids[i];
      if (!id) continue;
      playerParticipant.push(id);
      playerName.push(name.trim());
    }
  });
  if (playerParticipant.length > 0) {
    const players = await tx.query(
      'insert into team_player (participant_id, name) select * from unnest($1::uuid[], $2::text[])',
      [playerParticipant, playerName],
    );
    assertRowsAffected(playerParticipant.length, players.rowCount ?? 0, 'Inserting rosters');
  }
  return ids;
}

/** Events this person owns or co-organizes, newest first. Archived ones included. */
export async function listEvents(db: Queryable, actor: Actor): Promise<EventSummary[]> {
  const { rows } = await db.query<{
    id: string;
    name: string;
    slug: string;
    format: CompetitionFormat;
    status: EventSummary['status'];
    role: EventSummary['role'];
    first_play_date: string | null;
    created_at: unknown;
  }>(
    `select c.id, c.name, c.slug, c.format, c.status,
            case when c.created_by = $1 then 'owner' else 'co_organizer' end as role,
            (select min(play_date)::text from session s where s.competition_id = c.id) as first_play_date,
            c.created_at
       from competition c
      where c.created_by = $1
         or exists (select 1 from competition_member m where m.competition_id = c.id and m.user_id = $1)
      order by c.created_at desc, c.id`,
    [actor.userId],
  );
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    slug: r.slug,
    format: r.format,
    status: r.status,
    role: r.role,
    firstPlayDate: r.first_play_date,
    createdAt: iso(r.created_at),
  }));
}

/** The whole event, for somebody who runs it. */
export async function loadEvent(
  db: Queryable,
  actor: Actor,
  competitionId: UUID,
): Promise<EventSnapshot> {
  await requireOrganizer(db, actor, competitionId);
  return readSnapshot(db, competitionId);
}

export interface EventBasics {
  name: string;
  description?: string;
  venueName?: string;
  venueAddress?: string;
  registrationFee?: number | null;
  timeZone: string;
}

/**
 * Change what the first wizard step asks. The slug is NOT changed with the
 * name: it is baked into every match id already minted (C3), and a rename
 * must never orphan a recorded result.
 */
export async function updateBasics(
  db: Db,
  actor: Actor,
  competitionId: UUID,
  basics: EventBasics,
): Promise<void> {
  if (!basics.name.trim()) throw new InvalidInputError('Give the event a name.');
  if (!isTimeZone(basics.timeZone))
    throw new InvalidInputError(`"${basics.timeZone}" is not a time zone.`);
  if (basics.registrationFee != null && !(basics.registrationFee >= 0)) {
    throw new InvalidInputError('The fee cannot be negative.');
  }
  await withTransaction(db, async (tx) => {
    await requireOrganizer(tx, actor, competitionId);
    const updated = await tx.query(
      `update competition
          set name = $2, description = $3, registration_fee = $4, time_zone = $5
        where id = $1`,
      [
        competitionId,
        basics.name.trim(),
        basics.description?.trim() || null,
        basics.registrationFee ?? null,
        basics.timeZone,
      ],
    );
    assertRowsAffected(1, updated.rowCount ?? 0, 'Updating the event');
    if (basics.venueName !== undefined) {
      const venue = await tx.query(
        `update venue set name = $2, address = $3
          where id = (select venue_id from competition where id = $1)`,
        [competitionId, basics.venueName.trim() || 'Venue', basics.venueAddress?.trim() || null],
      );
      assertRowsAffected(1, venue.rowCount ?? 0, 'Updating the venue');
    }
  });
}

export interface FormatSettings {
  gameDurationMin: number;
  bufferMin: number;
  poolCount?: number | null;
  bracketTiers?: string[] | null;
  minRestMin: number;
  playersPerSide?: number | null;
  capacity?: number | null;
  skillLabel?: string | null;
  forfeitPolicy: ForfeitPolicy;
  tiebreakerOrder?: Tiebreaker[] | null;
  /** Per phase; an empty list means the engine's default for that phase. */
  setFormats?: { pool: SetRuleInput[]; playoff: SetRuleInput[] };
}

export interface SetRuleInput {
  target: number;
  winBy: number;
  cap: number | null;
}

export async function updateFormatSettings(
  db: Db,
  actor: Actor,
  competitionId: UUID,
  settings: FormatSettings,
): Promise<void> {
  if (settings.tiebreakerOrder) {
    try {
      resolveTiebreakerOrder(settings.tiebreakerOrder);
    } catch (error) {
      throw new InvalidInputError((error as Error).message);
    }
  }
  const tiers = settings.bracketTiers?.map((t) => t.trim().toLowerCase()).filter(Boolean) ?? null;
  if (tiers && new Set(tiers).size !== tiers.length) {
    throw new InvalidInputError('Two bracket tiers have the same name.');
  }
  for (const [phase, rules] of Object.entries(settings.setFormats ?? {})) {
    for (const [i, rule] of rules.entries()) {
      const where = `${phase} set ${i + 1}`;
      if (!(Number.isInteger(rule.target) && rule.target > 0)) {
        throw new InvalidInputError(`${where}: the target must be a whole number above zero.`);
      }
      if (!(Number.isInteger(rule.winBy) && rule.winBy >= 1)) {
        throw new InvalidInputError(`${where}: sets are won by at least one point.`);
      }
      if (rule.cap !== null && rule.cap < rule.target) {
        throw new InvalidInputError(`${where}: the cap is below the target.`);
      }
    }
  }

  await withTransaction(db, async (tx) => {
    await requireOrganizer(tx, actor, competitionId);
    const updated = await tx.query(
      `update competition set
         game_duration_min = $2, buffer_min = $3, pool_count = $4, bracket_tiers = $5,
         min_rest_min = $6, players_per_side = $7, capacity = $8, skill_label = $9,
         forfeit_policy = $10, tiebreaker_order = $11
       where id = $1`,
      [
        competitionId,
        settings.gameDurationMin,
        settings.bufferMin,
        settings.poolCount ?? null,
        tiers,
        settings.minRestMin,
        settings.playersPerSide ?? null,
        settings.capacity ?? null,
        settings.skillLabel?.trim() || null,
        settings.forfeitPolicy,
        settings.tiebreakerOrder ?? null,
      ],
    );
    assertRowsAffected(1, updated.rowCount ?? 0, 'Updating format settings');

    if (settings.setFormats) {
      await tx.query('delete from competition_set_format where competition_id = $1', [
        competitionId,
      ]);
      const phase: string[] = [];
      const setNumber: number[] = [];
      const target: number[] = [];
      const winBy: number[] = [];
      const cap: Array<number | null> = [];
      for (const key of ['pool', 'playoff'] as const) {
        settings.setFormats[key].forEach((rule, i) => {
          phase.push(key);
          setNumber.push(i + 1);
          target.push(rule.target);
          winBy.push(rule.winBy);
          cap.push(rule.cap);
        });
      }
      if (phase.length > 0) {
        const inserted = await tx.query(
          `insert into competition_set_format (competition_id, phase, set_number, target, win_by, cap)
           select $1, phase::match_phase, n, target, win_by, cap
             from unnest($2::text[], $3::int[], $4::int[], $5::int[], $6::int[])
                  as t(phase, n, target, win_by, cap)`,
          [competitionId, phase, setNumber, target, winBy, cap],
        );
        assertRowsAffected(phase.length, inserted.rowCount ?? 0, 'Saving set formats');
      }
    }
  });
}

/**
 * Publishing is visibility only (#19): the event appears on its public page
 * and the organizer keeps editing everything. Archiving hides it from the
 * public and from the organizer's active list; restoring brings it back as
 * a draft, so nothing becomes public again without somebody deciding it.
 */
export type EventTransition = 'publish' | 'unpublish' | 'archive' | 'restore';

export async function transitionEvent(
  db: Db,
  actor: Actor,
  competitionId: UUID,
  transition: EventTransition,
  now: string,
): Promise<void> {
  await withTransaction(db, async (tx) => {
    await requireOrganizer(tx, actor, competitionId);
    const statements: Record<EventTransition, [string, unknown[]]> = {
      publish: [
        `update competition set status = 'published', published_at = coalesce(published_at, $2)
          where id = $1 and status = 'draft'`,
        [competitionId, now],
      ],
      unpublish: [
        `update competition set status = 'draft' where id = $1 and status = 'published'`,
        [competitionId],
      ],
      archive: [
        `update competition set status = 'archived', archived_at = $2
          where id = $1 and status <> 'archived'`,
        [competitionId, now],
      ],
      restore: [
        `update competition set status = 'draft', archived_at = null
          where id = $1 and status = 'archived'`,
        [competitionId],
      ],
    };
    const [sql, params] = statements[transition];
    const result = await tx.query(sql, params);
    if ((result.rowCount ?? 0) !== 1) {
      throw new ConflictError(
        `This event cannot be ${transition === 'publish' ? 'published' : `${transition}d`} from its current state.`,
      );
    }
  });
}

/**
 * Delete an event for good. Owner only, and only with the event's name typed
 * back as confirmation.
 *
 * The fee ledger is append-only (rule 8) — while the event exists. Deleting
 * the event deletes its ledger with it, all of it at once; nothing is
 * rewritten or selectively removed. docs/DECISIONS.md records the rule:
 * archive is the default, and a hard delete of an event that recorded
 * payments tells the organizer so and requires the JSON backup to have been
 * offered first (the confirmation screen links it).
 */
export async function deleteEvent(
  db: Db,
  actor: Actor,
  competitionId: UUID,
  typedName: string,
): Promise<void> {
  await withTransaction(db, async (tx) => {
    await requireOwner(tx, actor, competitionId);
    const { rows } = await tx.query<{ name: string }>(
      'select name from competition where id = $1',
      [competitionId],
    );
    const name = rows[0]?.name;
    if (name === undefined) throw new NotFoundError('Event');
    if (typedName.trim() !== name) {
      throw new InvalidInputError('Type the event’s name exactly to delete it.');
    }
    const deleted = await tx.query('delete from competition where id = $1', [competitionId]);
    assertRowsAffected(1, deleted.rowCount ?? 0, 'Deleting the event');
  });
}

/** How much money a delete would take with it — shown on the confirmation. */
export async function ledgerSummary(
  db: Queryable,
  actor: Actor,
  competitionId: UUID,
): Promise<{ entries: number; collected: number }> {
  await requireOrganizer(db, actor, competitionId);
  const { rows } = await db.query<{ entries: string; collected: string | null }>(
    `select count(*)::text as entries,
            sum(case t.type when 'payment' then t.amount when 'refund' then -t.amount else 0 end)::text as collected
       from transaction t join participant p on p.id = t.participant_id
      where p.competition_id = $1`,
    [competitionId],
  );
  return { entries: Number(rows[0]?.entries ?? 0), collected: Number(rows[0]?.collected ?? 0) };
}

/** Add a co-organizer by the email they signed up with. Owner only. */
export async function addCoOrganizer(
  db: Db,
  actor: Actor,
  competitionId: UUID,
  email: string,
): Promise<void> {
  await withTransaction(db, async (tx) => {
    await requireOwner(tx, actor, competitionId);
    const user = await findUserByEmail(tx, email);
    // Deliberately the same message either way: this form must not become a
    // way to find out who has an account.
    if (!user || user.id === actor.userId) {
      throw new InvalidInputError(
        'No account to add with that email. They need to sign up first, with that address.',
      );
    }
    await tx.query(
      `insert into competition_member (competition_id, user_id) values ($1, $2)
       on conflict do nothing`,
      [competitionId, user.id],
    );
  });
}

export async function removeCoOrganizer(
  db: Db,
  actor: Actor,
  competitionId: UUID,
  userId: UUID,
): Promise<void> {
  await withTransaction(db, async (tx) => {
    await requireOwner(tx, actor, competitionId);
    await tx.query('delete from competition_member where competition_id = $1 and user_id = $2', [
      competitionId,
      userId,
    ]);
  });
}

export async function listCoOrganizers(
  db: Queryable,
  actor: Actor,
  competitionId: UUID,
): Promise<Array<{ userId: UUID; email: string | null; displayName: string | null }>> {
  await requireOrganizer(db, actor, competitionId);
  const { rows } = await db.query<{
    id: string;
    email: string | null;
    display_name: string | null;
  }>(
    `select u.id, u.email, u.display_name
       from competition_member m join app_user u on u.id = m.user_id
      where m.competition_id = $1
      order by m.added_at, u.id`,
    [competitionId],
  );
  return rows.map((r) => ({ userId: r.id, email: r.email, displayName: r.display_name }));
}
