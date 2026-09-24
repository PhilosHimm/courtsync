import type { AppUser } from '@/lib/core';
import { compact, iso } from './rows';
import type { Queryable } from './types';

/**
 * The app's row for a signed-in identity, created the first time it is seen.
 *
 * Upsert on the auth id, so the first request after sign-up creates the row
 * and every later one finds it. Email and display name follow the identity
 * provider — they are its facts — but only when it sends them: a provider
 * that omits a field must not blank one the user already has.
 */
export async function upsertUser(
  q: Queryable,
  identity: { authUserId: string; email?: string | null; displayName?: string | null },
): Promise<AppUser> {
  const { rows } = await q.query<UserRow>(
    `insert into app_user (auth_user_id, email, display_name)
     values ($1, $2, $3)
     on conflict (auth_user_id) do update
       set email = coalesce(excluded.email, app_user.email),
           display_name = coalesce(excluded.display_name, app_user.display_name)
     returning id, auth_user_id, email, display_name, phone, created_at`,
    [identity.authUserId, identity.email ?? null, identity.displayName ?? null],
  );
  const row = rows[0];
  if (!row) throw new Error('Upserting a user returned no row.');
  return toUser(row);
}

interface UserRow {
  id: string;
  auth_user_id: string;
  email: string | null;
  display_name: string | null;
  phone: string | null;
  created_at: unknown;
}

function toUser(row: UserRow): AppUser {
  return compact({
    id: row.id,
    authUserId: row.auth_user_id,
    email: row.email ?? undefined,
    displayName: row.display_name ?? undefined,
    phone: row.phone ?? undefined,
    createdAt: iso(row.created_at),
  });
}

/** Find users by email, for adding a co-organizer. Exact, case-insensitive. */
export async function findUserByEmail(q: Queryable, email: string): Promise<AppUser | null> {
  const { rows } = await q.query<UserRow>(
    `select id, auth_user_id, email, display_name, phone, created_at
       from app_user where lower(email) = lower($1)`,
    [email.trim()],
  );
  const row = rows[0];
  return row ? toUser(row) : null;
}
