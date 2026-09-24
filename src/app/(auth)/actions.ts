'use server';

import { redirect } from 'next/navigation';
import type { FormState } from '@/components/app/forms';
import { neonAuth } from '@/lib/auth/server';
import { serverEnv } from '@/lib/db/env';

/**
 * Sign-in, sign-up and password reset, as server actions over Neon Auth.
 * Neon Auth owns the identity, the password hashing, verification emails and
 * reset tokens; this only relays the form and says what happened.
 *
 * `next` is only ever a same-site path. An open redirect on a sign-in form is
 * a phishing kit waiting to be used.
 */

const safeNext = (value: FormDataEntryValue | null): string => {
  const next = typeof value === 'string' ? value : '';
  return next.startsWith('/') && !next.startsWith('//') ? next : '/events';
};

const field = (form: FormData, name: string) => String(form.get(name) ?? '').trim();

function explain(
  error: { message?: string; status?: number; code?: string } | null | undefined,
): string {
  if (!error) return 'That did not work. Try again.';
  if (error.code === 'EMAIL_NOT_VERIFIED')
    return 'Verify your email first — the link is in your inbox.';
  if (error.status === 401 || error.code === 'INVALID_EMAIL_OR_PASSWORD')
    return 'That email and password do not match.';
  if (error.status === 429) return 'Too many attempts. Wait a minute and try again.';
  return error.message ?? 'That did not work. Try again.';
}

export async function signInAction(_: FormState, form: FormData): Promise<FormState> {
  const { error } = await neonAuth().signIn.email({
    email: field(form, 'email'),
    password: String(form.get('password') ?? ''),
  });
  if (error) return { ok: false, message: explain(error) };
  redirect(safeNext(form.get('next')));
}

export async function signUpAction(_: FormState, form: FormData): Promise<FormState> {
  const name = field(form, 'name');
  const password = String(form.get('password') ?? '');
  if (!name) return { ok: false, message: 'Add your name — it is how organizers will see you.' };
  if (password.length < 10)
    return { ok: false, message: 'Use a password of at least 10 characters.' };
  const { error } = await neonAuth().signUp.email({
    email: field(form, 'email'),
    password,
    name,
    callbackURL: `${serverEnv().appUrl}${safeNext(form.get('next'))}`,
  });
  if (error) return { ok: false, message: explain(error) };
  const session = await neonAuth().getSession();
  if (session.data) redirect(safeNext(form.get('next')));
  return { ok: true, message: 'Check your email to verify your address, then sign in.' };
}

export async function requestResetAction(_: FormState, form: FormData): Promise<FormState> {
  await neonAuth().requestPasswordReset({
    email: field(form, 'email'),
    redirectTo: `${serverEnv().appUrl}/reset-password`,
  });
  // The same answer whether or not the address has an account: this form
  // must not tell anyone who uses CourtSync.
  return { ok: true, message: 'If that address has an account, a reset link is on its way.' };
}

export async function resetPasswordAction(_: FormState, form: FormData): Promise<FormState> {
  const password = String(form.get('password') ?? '');
  if (password.length < 10)
    return { ok: false, message: 'Use a password of at least 10 characters.' };
  const { error } = await neonAuth().resetPassword({
    newPassword: password,
    token: field(form, 'token'),
  });
  if (error)
    return {
      ok: false,
      message: 'That reset link has expired or was already used. Ask for a new one.',
    };
  redirect('/sign-in?reset=1');
}

export async function googleAction(form: FormData): Promise<void> {
  const { data, error } = await neonAuth().signIn.social({
    provider: 'google',
    callbackURL: `${serverEnv().appUrl}${safeNext(form.get('next'))}`,
  });
  const url = (data as { url?: string } | null)?.url;
  if (error || !url) redirect('/sign-in?error=google');
  redirect(url);
}

export async function signOutAction(): Promise<void> {
  await neonAuth().signOut();
  redirect('/');
}
