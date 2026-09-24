import { randomUUID } from 'node:crypto';
import type { UUID } from '@/lib/core';
import type { EventBackup } from '@/lib/event/backup';
import { duplicateSource, parseBackup, reidentify, toBackup } from '@/lib/event/backup';
import { uniqueSlug } from '@/lib/event/slug';
import type { EventSnapshot } from '@/lib/event/snapshot';
import { assertRowsAffected } from '@/lib/scheduling';
import type { Actor } from './authz';
import { requireOrganizer } from './authz';
import { InvalidInputError } from './errors';
import { readSnapshot } from './snapshot';
import { withTransaction } from './tx';
import type { Db, Queryable } from './types';

/**
 * Export, restore and duplicate (#19). A restore and a duplicate both become
 * a new private draft owned by whoever did it, written in one transaction —
 * a half-restored event is worse than none.
 */

export async function exportEvent(
  db: Queryable,
  actor: Actor,
  competitionId: UUID,
  now: string,
): Promise<EventBackup> {
  await requireOrganizer(db, actor, competitionId);
  return toBackup(await readSnapshot(db, competitionId), now);
}

export async function restoreBackup(db: Db, actor: Actor, text: string): Promise<UUID> {
  let snapshot: EventSnapshot;
  try {
    snapshot = parseBackup(text);
  } catch (error) {
    throw new InvalidInputError((error as Error).message);
  }
  return withTransaction(db, (tx) => insertSnapshot(tx, actor, snapshot));
}

export async function duplicateEvent(
  db: Db,
  actor: Actor,
  competitionId: UUID,
  name: string,
): Promise<UUID> {
  return withTransaction(db, async (tx) => {
    await requireOrganizer(tx, actor, competitionId);
    return insertSnapshot(tx, actor, duplicateSource(await readSnapshot(tx, competitionId), name));
  });
}

async function insertSnapshot(tx: Queryable, actor: Actor, source: EventSnapshot): Promise<UUID> {
  const taken = await tx.query<{ slug: string }>(
    'select slug from competition where created_by = $1',
    [actor.userId],
  );
  const slug = uniqueSlug(source.competition.slug, new Set(taken.rows.map((r) => r.slug)));
  const s = reidentify(source, { slug, newId: randomUUID });
  const c = s.competition;

  const venueId = s.venue?.id ?? randomUUID();
  await tx.query('insert into venue (id, name, address, created_by) values ($1, $2, $3, $4)', [
    venueId,
    s.venue?.name ?? `${c.name} venue`,
    s.venue?.address ?? null,
    actor.userId,
  ]);
  await tx.query(
    `insert into competition (id, name, slug, format, created_by, venue_id, registration_fee, game_duration_min,
       buffer_min, forfeit_policy, tiebreaker_order, status, description, pool_count, bracket_tiers, min_rest_min,
       league_legs, players_per_side, capacity, skill_label, time_zone)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'draft',$12,$13,$14,$15,$16,$17,$18,$19,$20)`,
    [
      c.id,
      c.name,
      c.slug,
      c.format,
      actor.userId,
      venueId,
      c.registrationFee ?? null,
      c.gameDurationMin,
      c.bufferMin,
      c.forfeitPolicy ?? 'setsOnly',
      c.tiebreakerOrder ?? null,
      c.description ?? null,
      c.poolCount ?? null,
      c.bracketTiers ?? null,
      c.minRestMin ?? 0,
      c.leagueLegs ?? 1,
      c.playersPerSide ?? null,
      c.capacity ?? null,
      c.skillLabel ?? null,
      c.timeZone ?? 'UTC',
    ],
  );

  const bulk = async (label: string, sql: string, params: unknown[], count: number) => {
    if (count === 0) return;
    const result = await tx.query(sql, params);
    assertRowsAffected(count, result.rowCount ?? 0, label);
  };

  await bulk(
    'Restoring courts',
    `insert into court (id, venue_id, name, is_active) select id, $2, name, active
       from unnest($1::uuid[], $3::text[], $4::bool[]) as t(id, name, active)`,
    [
      s.courts.map((x) => x.id),
      venueId,
      s.courts.map((x) => x.name),
      s.courts.map((x) => x.isActive),
    ],
    s.courts.length,
  );
  await bulk(
    'Linking courts',
    'insert into competition_court (competition_id, court_id) select $1, unnest($2::uuid[])',
    [c.id, s.courts.map((x) => x.id)],
    s.courts.length,
  );
  await bulk(
    'Restoring sessions',
    `insert into session (id, competition_id, name, play_date, start_time, end_time, sequence, cancelled_at, cancel_reason)
     select id, $2, name, d::date, st::time, et::time, seq, ca, cr
       from unnest($1::uuid[], $3::text[], $4::text[], $5::text[], $6::text[], $7::int[], $8::timestamptz[], $9::text[])
         as t(id, name, d, st, et, seq, ca, cr)`,
    [
      s.sessions.map((x) => x.id),
      c.id,
      s.sessions.map((x) => x.name ?? null),
      s.sessions.map((x) => x.playDate),
      s.sessions.map((x) => x.startTime),
      s.sessions.map((x) => x.endTime),
      s.sessions.map((x) => x.sequence ?? null),
      s.sessions.map((x) => x.cancelledAt ?? null),
      s.sessions.map((x) => x.cancelReason ?? null),
    ],
    s.sessions.length,
  );
  await bulk(
    'Restoring timeslots',
    'insert into timeslot (id, session_id, start_at, end_at) select * from unnest($1::uuid[], $2::uuid[], $3::timestamptz[], $4::timestamptz[])',
    [
      s.timeslots.map((x) => x.id),
      s.timeslots.map((x) => x.sessionId),
      s.timeslots.map((x) => x.startAt),
      s.timeslots.map((x) => x.endAt),
    ],
    s.timeslots.length,
  );
  await bulk(
    'Restoring court windows',
    'insert into court_window (id, court_id, session_id, start_at, end_at) select * from unnest($1::uuid[], $2::uuid[], $3::uuid[], $4::timestamptz[], $5::timestamptz[])',
    [
      s.courtWindows.map((x) => x.id),
      s.courtWindows.map((x) => x.courtId),
      s.courtWindows.map((x) => x.sessionId),
      s.courtWindows.map((x) => x.startAt),
      s.courtWindows.map((x) => x.endAt),
    ],
    s.courtWindows.length,
  );
  await bulk(
    'Restoring entries',
    `insert into participant (id, competition_id, kind, name, seed, contact_name, contact_email, contact_phone, registered_at, notes)
     select id, $2, k::participant_kind, n, sd, cn, ce, cp, ra, nt
       from unnest($1::uuid[], $3::text[], $4::text[], $5::int[], $6::text[], $7::text[], $8::text[], $9::timestamptz[], $10::text[])
         as t(id, k, n, sd, cn, ce, cp, ra, nt)`,
    [
      s.participants.map((x) => x.id),
      c.id,
      s.participants.map((x) => x.kind),
      s.participants.map((x) => x.name),
      s.participants.map((x) => x.seed ?? null),
      s.participants.map((x) => x.contactName ?? null),
      s.participants.map((x) => x.contactEmail ?? null),
      s.participants.map((x) => x.contactPhone ?? null),
      s.participants.map((x) => x.registeredAt),
      s.participants.map((x) => x.notes ?? null),
    ],
    s.participants.length,
  );
  await bulk(
    'Restoring rosters',
    'insert into team_player (id, participant_id, name, jersey_number) select * from unnest($1::uuid[], $2::uuid[], $3::text[], $4::int[])',
    [
      s.teamPlayers.map((x) => x.id),
      s.teamPlayers.map((x) => x.participantId),
      s.teamPlayers.map((x) => x.name),
      s.teamPlayers.map((x) => x.jerseyNumber ?? null),
    ],
    s.teamPlayers.length,
  );
  await bulk(
    'Restoring pools',
    'insert into pool (id, competition_id, name) select id, $2, name from unnest($1::uuid[], $3::text[]) as t(id, name)',
    [s.pools.map((x) => x.id), c.id, s.pools.map((x) => x.name)],
    s.pools.length,
  );
  const members = s.pools.flatMap((p) => p.participantIds.map((pid) => [p.id, pid] as const));
  await bulk(
    'Restoring pool members',
    'insert into pool_participant (pool_id, participant_id) select * from unnest($1::uuid[], $2::uuid[])',
    [members.map((m) => m[0]), members.map((m) => m[1])],
    members.length,
  );

  const matchRow = new Map(s.matches.map((m) => [m.id, randomUUID()]));
  await bulk(
    'Restoring matches',
    `insert into match (id, competition_id, match_key, session_id, pool_id, court_id, timeslot_id, home_participant_id,
                        away_participant_id, ref_participant_id, bracket, round_label, status)
     select id, $2, k, se, po, co, ts, h, a, r, b, rl, st::match_status
       from unnest($1::uuid[], $3::text[], $4::uuid[], $5::uuid[], $6::uuid[], $7::uuid[], $8::uuid[], $9::uuid[],
                   $10::uuid[], $11::text[], $12::text[], $13::text[])
         as t(id, k, se, po, co, ts, h, a, r, b, rl, st)`,
    [
      s.matches.map((m) => matchRow.get(m.id)),
      c.id,
      s.matches.map((m) => m.id),
      s.matches.map((m) => m.sessionId),
      s.matches.map((m) => m.poolId ?? null),
      s.matches.map((m) => m.courtId ?? null),
      s.matches.map((m) => m.timeslotId ?? null),
      s.matches.map((m) => m.homeParticipantId ?? null),
      s.matches.map((m) => m.awayParticipantId ?? null),
      s.matches.map((m) => m.refParticipantId ?? null),
      s.matches.map((m) => m.bracket ?? null),
      s.matches.map((m) => m.roundLabel ?? null),
      s.matches.map((m) => m.status),
    ],
    s.matches.length,
  );
  const sets = s.matches.flatMap((m) => m.sets.map((set) => ({ row: matchRow.get(m.id), set })));
  await bulk(
    'Restoring sets',
    'insert into match_set (match_id, set_number, home_points, away_points) select * from unnest($1::uuid[], $2::int[], $3::int[], $4::int[])',
    [
      sets.map((x) => x.row),
      sets.map((x) => x.set.setNumber),
      sets.map((x) => x.set.homePoints),
      sets.map((x) => x.set.awayPoints),
    ],
    sets.length,
  );
  await bulk(
    'Restoring attendance',
    `insert into attendance (id, session_id, participant_id, status, waitlist_pos, recorded_at)
     select * from unnest($1::uuid[], $2::uuid[], $3::uuid[], $4::attendance_status[], $5::int[], $6::timestamptz[])`,
    [
      s.attendance.map((x) => x.id),
      s.attendance.map((x) => x.sessionId),
      s.attendance.map((x) => x.participantId),
      s.attendance.map((x) => x.status),
      s.attendance.map((x) => x.waitlistPos ?? null),
      s.attendance.map((x) => x.recordedAt),
    ],
    s.attendance.length,
  );
  await bulk(
    'Restoring the fee ledger',
    `insert into transaction (id, participant_id, type, amount, payment_method, reference_number, processed_at, receipt_url, notes)
     select * from unnest($1::uuid[], $2::uuid[], $3::transaction_type[], $4::numeric[], $5::payment_method[], $6::text[],
                          $7::timestamptz[], $8::text[], $9::text[])`,
    [
      s.transactions.map((x) => x.id),
      s.transactions.map((x) => x.participantId),
      s.transactions.map((x) => x.type),
      s.transactions.map((x) => x.amount),
      s.transactions.map((x) => x.paymentMethod ?? null),
      s.transactions.map((x) => x.referenceNumber ?? null),
      s.transactions.map((x) => x.processedAt),
      s.transactions.map((x) => x.receiptUrl ?? null),
      s.transactions.map((x) => x.notes ?? null),
    ],
    s.transactions.length,
  );
  await bulk(
    'Restoring set formats',
    `insert into competition_set_format (id, competition_id, phase, set_number, target, win_by, cap)
     select id, $2, ph::match_phase, n, tg, wb, cp from unnest($1::uuid[], $3::text[], $4::int[], $5::int[], $6::int[], $7::int[])
       as t(id, ph, n, tg, wb, cp)`,
    [
      s.setFormats.map((x) => x.id),
      c.id,
      s.setFormats.map((x) => x.phase),
      s.setFormats.map((x) => x.setNumber),
      s.setFormats.map((x) => x.target),
      s.setFormats.map((x) => x.winBy),
      s.setFormats.map((x) => x.cap),
    ],
    s.setFormats.length,
  );
  await bulk(
    'Restoring score history',
    `insert into match_set_edit (id, match_id, set_number, previous_home, previous_away, next_home, next_away, reason, edited_at)
     select * from unnest($1::uuid[], $2::uuid[], $3::int[], $4::int[], $5::int[], $6::int[], $7::int[], $8::text[], $9::timestamptz[])`,
    [
      s.scoreEdits.map((x) => x.id),
      s.scoreEdits.map((x) => matchRow.get(x.matchId)),
      s.scoreEdits.map((x) => x.setNumber),
      s.scoreEdits.map((x) => x.previousHome),
      s.scoreEdits.map((x) => x.previousAway),
      s.scoreEdits.map((x) => x.nextHome),
      s.scoreEdits.map((x) => x.nextAway),
      s.scoreEdits.map((x) => x.reason ?? null),
      s.scoreEdits.map((x) => x.editedAt),
    ],
    s.scoreEdits.length,
  );
  await bulk(
    'Restoring announcements',
    `insert into announcement (id, competition_id, session_id, body, created_at)
     select id, $2, se, b, ca from unnest($1::uuid[], $3::uuid[], $4::text[], $5::timestamptz[]) as t(id, se, b, ca)`,
    [
      s.announcements.map((x) => x.id),
      c.id,
      s.announcements.map((x) => x.sessionId),
      s.announcements.map((x) => x.body),
      s.announcements.map((x) => x.createdAt),
    ],
    s.announcements.length,
  );
  return c.id;
}
