import type { AttendanceStatus, UUID } from '@/lib/core';
import { publicName } from '@/lib/event/names';
import type { EventSnapshot } from '@/lib/event/snapshot';
import { NotFoundError } from './errors';
import { readSnapshot } from './snapshot';
import type { Queryable } from './types';

/**
 * What a public event page may carry (#23), and nothing more.
 *
 * A separate type from `EventSnapshot` on purpose: a page built from this
 * cannot leak a contact email or a full name by rendering a field it forgot
 * to hide, because the field is not here. The reduction happens in this
 * function, on the server, so the full name never reaches the page's HTML or
 * its JSON payload.
 *
 * People are reduced to first name and last initial — drop-in players, and
 * every name on a roster. Team names are not personal data and are shown as
 * entered. Contact details, fees, the ledger, the score history and anything
 * identifying an account are not included at all.
 */
export interface PublicEvent {
  id: UUID;
  name: string;
  slug: string;
  format: EventSnapshot['competition']['format'];
  description: string | null;
  timeZone: string;
  venue: { name: string; address: string | null } | null;
  skillLabel: string | null;
  capacity: number | null;
  bracketTiers: string[];
  courts: EventSnapshot['courts'];
  sessions: EventSnapshot['sessions'];
  timeslots: EventSnapshot['timeslots'];
  pools: EventSnapshot['pools'];
  participants: Array<{ id: UUID; kind: 'team' | 'individual'; name: string; roster: string[] }>;
  matches: EventSnapshot['matches'];
  /** Per session: who is in, in reduced names, and how long the waitlist is. */
  attendance: Array<{
    sessionId: UUID;
    going: Array<{ name: string; status: Exclude<AttendanceStatus, 'waitlist'> }>;
    waitlist: number;
  }>;
  announcements: Array<{ id: UUID; sessionId: UUID | null; body: string; createdAt: string }>;
  setFormats: EventSnapshot['setFormats'];
  forfeitPolicy: NonNullable<EventSnapshot['competition']['forfeitPolicy']> | null;
  tiebreakerOrder: EventSnapshot['competition']['tiebreakerOrder'] | null;
}

/** A published event, reduced for the public. Anything else is not found. */
export async function loadPublicEvent(q: Queryable, competitionId: UUID): Promise<PublicEvent> {
  if (!/^[0-9a-f-]{36}$/i.test(competitionId)) throw new NotFoundError('Event');
  const { rows } = await q.query<{ status: string }>(
    'select status from competition where id = $1',
    [competitionId],
  );
  if (rows[0]?.status !== 'published') throw new NotFoundError('Event');
  return toPublic(await readSnapshot(q, competitionId));
}

/** Exported for the test that proves nothing private survives. */
export function toPublic(s: EventSnapshot): PublicEvent {
  const kindOf = new Map(s.participants.map((p) => [p.id, p.kind]));
  const displayName = (id: UUID, name: string) =>
    kindOf.get(id) === 'individual' ? publicName(name) : name;
  const nameOf = new Map(s.participants.map((p) => [p.id, displayName(p.id, p.name)]));

  return {
    id: s.competition.id,
    name: s.competition.name,
    slug: s.competition.slug,
    format: s.competition.format,
    description: s.competition.description ?? null,
    timeZone: s.competition.timeZone ?? 'UTC',
    venue: s.venue ? { name: s.venue.name, address: s.venue.address ?? null } : null,
    skillLabel: s.competition.skillLabel ?? null,
    capacity: s.competition.capacity ?? null,
    bracketTiers: [...(s.competition.bracketTiers ?? [])],
    courts: s.courts,
    sessions: s.sessions,
    timeslots: s.timeslots,
    pools: s.pools,
    participants: s.participants.map((p) => ({
      id: p.id,
      kind: p.kind,
      name: nameOf.get(p.id) ?? '',
      roster: s.teamPlayers
        .filter((tp) => tp.participantId === p.id)
        .map((tp) => publicName(tp.name)),
    })),
    matches: s.matches,
    attendance: s.sessions.map((session) => {
      const here = s.attendance.filter((a) => a.sessionId === session.id);
      return {
        sessionId: session.id,
        going: here
          .filter((a) => a.status !== 'waitlist')
          .map((a) => ({
            name: nameOf.get(a.participantId) ?? '',
            status: a.status as Exclude<AttendanceStatus, 'waitlist'>,
          })),
        waitlist: here.filter((a) => a.status === 'waitlist').length,
      };
    }),
    announcements: s.announcements.map((a) => ({
      id: a.id,
      sessionId: a.sessionId,
      body: a.body,
      createdAt: a.createdAt,
    })),
    setFormats: s.setFormats,
    forfeitPolicy: s.competition.forfeitPolicy ?? null,
    tiebreakerOrder: s.competition.tiebreakerOrder ?? null,
  };
}

/** Published events, newest first — the index a search engine can crawl. */
export async function listPublicEvents(
  q: Queryable,
): Promise<
  Array<{ id: UUID; name: string; slug: string; format: string; firstPlayDate: string | null }>
> {
  const { rows } = await q.query<{
    id: string;
    name: string;
    slug: string;
    format: string;
    first_play_date: string | null;
  }>(
    `select c.id, c.name, c.slug, c.format,
            (select min(play_date)::text from session s where s.competition_id = c.id) as first_play_date
       from competition c where c.status = 'published'
      order by c.published_at desc nulls last, c.id
      limit 200`,
  );
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    slug: r.slug,
    format: r.format,
    firstPlayDate: r.first_play_date,
  }));
}
