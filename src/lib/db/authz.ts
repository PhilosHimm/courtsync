import type { UUID } from '@/lib/core';
import { ForbiddenError, NotFoundError } from './errors';
import type { Queryable } from './types';

/**
 * Authorization, at the data layer (rule 6).
 *
 * Next.js registers server action ids globally, so a route matcher is not a
 * security boundary: any action can be called from anywhere. Every mutating
 * function in this package therefore takes the acting user and checks it
 * here, itself, against the row it is about to touch — in the same
 * transaction as the write, so the check and the write see the same data.
 *
 * Neon has no row-level security to catch a missed check. That is why this
 * is a function every write calls, and why the test suite has a case per
 * write proving a stranger is refused.
 */

export type EventRole = 'owner' | 'co_organizer';

/** The signed-in person a request acts for. */
export interface Actor {
  userId: UUID;
}

/** What `actor` may do with this competition, or null for nothing. */
export async function roleIn(
  q: Queryable,
  actor: Actor,
  competitionId: UUID,
): Promise<EventRole | null> {
  const { rows } = await q.query<{ created_by: string | null; member_role: string | null }>(
    `select c.created_by, m.role as member_role
       from competition c
       left join competition_member m
         on m.competition_id = c.id and m.user_id = $2
      where c.id = $1`,
    [competitionId, actor.userId],
  );
  const row = rows[0];
  if (!row) throw new NotFoundError('Event');
  if (row.created_by === actor.userId) return 'owner';
  if (row.member_role === 'co_organizer') return 'co_organizer';
  return null;
}

/**
 * Owner or co-organizer, or throw. A stranger gets NotFound rather than
 * Forbidden: telling them the event exists is already more than they asked
 * for, on a URL they guessed.
 */
export async function requireOrganizer(
  q: Queryable,
  actor: Actor,
  competitionId: UUID,
): Promise<EventRole> {
  const role = await roleIn(q, actor, competitionId);
  if (!role) throw new NotFoundError('Event');
  return role;
}

/** The owner only — deleting the event, and deciding who else runs it. */
export async function requireOwner(q: Queryable, actor: Actor, competitionId: UUID): Promise<void> {
  const role = await requireOrganizer(q, actor, competitionId);
  if (role !== 'owner') throw new ForbiddenError('Only the event owner can do that.');
}

/** The competition a match belongs to, by its row id. */
export async function competitionOfMatchRow(q: Queryable, matchRowId: UUID): Promise<UUID> {
  const { rows } = await q.query<{ competition_id: string }>(
    'select competition_id from match where id = $1',
    [matchRowId],
  );
  const row = rows[0];
  if (!row) throw new NotFoundError('Match');
  return row.competition_id;
}
