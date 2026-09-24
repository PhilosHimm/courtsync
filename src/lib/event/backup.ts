import type { UUID } from '@/lib/core';
import { carryForwardParticipants } from '@/lib/core';
import { rekeyMatchId } from '@/lib/scheduling';
import type { EventSnapshot } from './snapshot';

/**
 * Whole-event JSON backup and restore (#19) — insurance against data loss,
 * and an honest way to take your event somewhere else.
 *
 * Pure: serializing, checking and re-identifying a snapshot. The data layer
 * writes the result in one transaction.
 */

export const BACKUP_FORMAT = 'courtsync-event';
export const BACKUP_VERSION = 1;

export interface EventBackup {
  format: typeof BACKUP_FORMAT;
  version: typeof BACKUP_VERSION;
  exportedAt: string;
  event: EventSnapshot;
}

export function toBackup(snapshot: EventSnapshot, exportedAt: string): EventBackup {
  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt, event: snapshot };
}

export class BackupError extends Error {
  constructor(message: string) {
    super(`This file is not a CourtSync backup we can restore: ${message}`);
    this.name = 'BackupError';
  }
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Read a backup file. Checks the shape rather than trusting it: the file came
 * from a user's disk, and a restore writes every row in it.
 */
export function parseBackup(text: string): EventSnapshot {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new BackupError('it is not valid JSON.');
  }
  if (!isObject(data) || data.format !== BACKUP_FORMAT)
    throw new BackupError('it is not marked as one.');
  if (data.version !== BACKUP_VERSION)
    throw new BackupError(`version ${String(data.version)} is not supported.`);
  const event = data.event;
  if (!isObject(event) || !isObject(event.competition))
    throw new BackupError('it has no event in it.');
  const competition = event.competition;
  for (const key of ['id', 'name', 'slug', 'format'] as const) {
    if (typeof competition[key] !== 'string') throw new BackupError(`the event has no ${key}.`);
  }
  if (!['tournament', 'league', 'dropin'].includes(competition.format as string)) {
    throw new BackupError('the event format is unknown.');
  }
  const lists = [
    'courts',
    'courtWindows',
    'sessions',
    'timeslots',
    'pools',
    'participants',
    'teamPlayers',
    'matches',
    'attendance',
    'transactions',
    'setFormats',
    'scoreEdits',
    'announcements',
  ] as const;
  for (const key of lists) {
    if (!Array.isArray(event[key])) throw new BackupError(`"${key}" is missing.`);
    for (const [i, row] of (event[key] as unknown[]).entries()) {
      if (!isObject(row)) throw new BackupError(`${key}[${i}] is not a record.`);
      if (key !== 'pools' && key !== 'matches' && typeof row.id !== 'string') {
        throw new BackupError(`${key}[${i}] has no id.`);
      }
    }
  }
  for (const [i, m] of (event.matches as Array<Record<string, unknown>>).entries()) {
    if (typeof m.id !== 'string' || !m.id.startsWith(`${competition.slug}-`)) {
      throw new BackupError(`matches[${i}] does not belong to this event.`);
    }
    if (!Array.isArray(m.sets)) throw new BackupError(`matches[${i}] has no sets list.`);
  }
  return event as unknown as EventSnapshot;
}

/**
 * The same event under fresh ids, ready to insert as a new, private draft.
 *
 * Every internal reference is rewritten to the new ids, match keys move to
 * the new slug through `rekeyMatchId` (C3), and anything pointing at a person
 * in the database it came from — who created it, who processed a payment,
 * which score link was used — is dropped: those people do not exist here.
 */
export function reidentify(
  snapshot: EventSnapshot,
  options: { slug: string; newId: () => UUID },
): EventSnapshot {
  const ids = new Map<string, UUID>();
  const map = (old: string): UUID => {
    let next = ids.get(old);
    if (!next) {
      next = options.newId();
      ids.set(old, next);
    }
    return next;
  };
  const mapOpt = (old: string | null | undefined): UUID | null => (old ? map(old) : null);
  const key = (k: string) => rekeyMatchId(k, snapshot.competition.slug, options.slug);

  const {
    createdBy: _c,
    publishedAt: _p,
    archivedAt: _a,
    venueId,
    ...competition
  } = snapshot.competition;
  const competitionId = map(snapshot.competition.id);
  const venue = snapshot.venue
    ? (() => {
        const { createdBy: _v, ...rest } = snapshot.venue;
        return { ...rest, id: map(snapshot.venue.id) };
      })()
    : null;

  return {
    competition: {
      ...competition,
      id: competitionId,
      slug: options.slug,
      status: 'draft',
      ...(venueId ? { venueId: map(venueId) } : {}),
    },
    venue,
    courts: snapshot.courts.map((c) => ({ ...c, id: map(c.id), venueId: map(c.venueId) })),
    courtWindows: snapshot.courtWindows.map((w) => ({
      ...w,
      id: map(w.id),
      courtId: map(w.courtId),
      sessionId: map(w.sessionId),
    })),
    sessions: snapshot.sessions.map((s) => ({ ...s, id: map(s.id), competitionId })),
    timeslots: snapshot.timeslots.map((t) => ({
      ...t,
      id: map(t.id),
      sessionId: map(t.sessionId),
    })),
    pools: snapshot.pools.map((p) => ({
      ...p,
      id: map(p.id),
      participantIds: p.participantIds.map(map),
    })),
    participants: snapshot.participants.map((p) => ({ ...p, id: map(p.id), competitionId })),
    teamPlayers: snapshot.teamPlayers.map((tp) => ({
      ...tp,
      id: map(tp.id),
      participantId: map(tp.participantId),
    })),
    matches: snapshot.matches.map((m) => ({
      ...m,
      id: key(m.id),
      competitionId,
      sessionId: map(m.sessionId),
      poolId: mapOpt(m.poolId),
      courtId: mapOpt(m.courtId),
      timeslotId: mapOpt(m.timeslotId),
      homeParticipantId: mapOpt(m.homeParticipantId),
      awayParticipantId: mapOpt(m.awayParticipantId),
      refParticipantId: mapOpt(m.refParticipantId),
      sets: m.sets.map((s) => ({ ...s, id: `${key(m.id)}-s${s.setNumber}`, matchId: key(m.id) })),
    })),
    attendance: snapshot.attendance.map((a) => ({
      ...a,
      id: map(a.id),
      sessionId: map(a.sessionId),
      participantId: map(a.participantId),
    })),
    transactions: snapshot.transactions.map((t) => {
      const { processedBy: _pb, ...rest } = t;
      return { ...rest, id: map(t.id), participantId: map(t.participantId) };
    }),
    setFormats: snapshot.setFormats.map((f) => ({ ...f, id: map(f.id), competitionId })),
    scoreEdits: snapshot.scoreEdits.map((e) => {
      const { editedBy: _eb, viaLinkId: _vl, ...rest } = e;
      return { ...rest, id: map(e.id), matchId: key(e.matchId) };
    }),
    announcements: snapshot.announcements.map((a) => {
      const { createdBy: _cb, ...rest } = a;
      return { ...rest, id: map(a.id), competitionId, sessionId: mapOpt(a.sessionId) };
    }),
  };
}

/**
 * What a duplicate carries (#19): teams, courts and timeslots, rosters, and
 * format settings. Not results, attendance, payments, history or
 * announcements — a duplicate is next season's event, not a copy of this
 * one's.
 *
 * Teams go through `carryForwardParticipants`, which drops `seed`: last
 * season's ranking must not shape this season's pool draw with a number
 * nobody re-entered.
 */
export function duplicateSource(snapshot: EventSnapshot, name: string): EventSnapshot {
  const carried = carryForwardParticipants(snapshot.participants, snapshot.competition.id);
  return {
    ...snapshot,
    competition: {
      ...snapshot.competition,
      name: name.trim() || `${snapshot.competition.name} (copy)`,
    },
    participants: snapshot.participants.map((p, i) => {
      const c = carried[i];
      return {
        id: p.id,
        registeredAt: p.registeredAt,
        ...(c ?? { competitionId: p.competitionId, kind: p.kind, name: p.name }),
      };
    }),
    sessions: snapshot.sessions.map((s) => {
      const { cancelledAt: _c, cancelReason: _r, ...rest } = s;
      return rest;
    }),
    pools: [],
    matches: [],
    attendance: [],
    transactions: [],
    scoreEdits: [],
    announcements: [],
  };
}
