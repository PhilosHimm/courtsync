import 'server-only';
import { createNeonAuth } from '@neondatabase/auth/next/server';
import { redirect } from 'next/navigation';
import type { AppUser } from '@/lib/core';
import type { Actor } from '@/lib/db/authz';
import { getDb } from '@/lib/db/client';
import { serverEnv } from '@/lib/db/env';
import { upsertUser } from '@/lib/db/users';

/**
 * Neon Auth, wired the way docs/DECISIONS.md settled it.
 *
 * Verified against `@neondatabase/auth` 0.5.0-beta before wiring, as the
 * decision asked: email verification (`sendVerificationEmail`,
 * `verifyEmail`), password reset (`requestPasswordReset`, `resetPassword`)
 * and OAuth (`signIn.social`) are all endpoints of the SDK. Its user table is
 * the SDK's, not ours to hang foreign keys off column by column, so the app
 * keeps a mirror row per identity (`app_user`, sql/0003) and every
 * `created_by` points there.
 *
 * Created on first use, never at import: `next build` imports this module and
 * must not need a secret to do so.
 *
 * This file is where a request becomes an Actor. It is NOT where
 * authorization happens — that is the data layer's job on every write
 * (rule 6). A session here only says who is asking.
 */

let instance: ReturnType<typeof createNeonAuth> | undefined;

export function neonAuth(): ReturnType<typeof createNeonAuth> {
  if (!instance) {
    const env = serverEnv();
    instance = createNeonAuth({
      baseUrl: env.auth.baseUrl,
      cookies: { secret: env.auth.cookieSecret },
    });
  }
  return instance;
}

interface SessionUser {
  id: string;
  email?: string | null;
  name?: string | null;
}

/** The signed-in person's app row, or null. Creates the row on first sight. */
export async function currentUser(): Promise<AppUser | null> {
  const { data, error } = await neonAuth().getSession();
  // An auth service that cannot be reached reads as "not signed in" for this
  // request — never as signed in. Logged, because it is an outage.
  if (error) console.error('Neon Auth session lookup failed:', error.message);
  const user = (data as { user?: SessionUser } | null)?.user;
  if (!user?.id) return null;
  return upsertUser(await getDb(), {
    authUserId: String(user.id),
    email: user.email ?? null,
    displayName: user.name ?? null,
  });
}

/** The signed-in person, or a redirect to sign in and come back. */
export async function requireUser(returnTo: string): Promise<AppUser> {
  const user = await currentUser();
  if (!user) redirect(`/sign-in?next=${encodeURIComponent(returnTo)}`);
  return user;
}

export const actorOf = (user: AppUser): Actor => ({ userId: user.id });
