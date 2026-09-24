'use server';

import type { FormState } from '@/components/app/forms';
import { now, text } from '@/lib/app/action';
import { getDb } from '@/lib/db/client';
import { ForbiddenError } from '@/lib/db/errors';
import { recordScore } from '@/lib/db/scores';

/**
 * A scorekeeper's save. The token is the whole of their authority, and it is
 * checked in the data layer against this exact match, in the same
 * transaction as the write. The competition and match in the form are what
 * the token must cover — never what it grants.
 */
export async function scorekeeperAction(_: FormState, form: FormData): Promise<FormState> {
  const homes = form.getAll('home').map(String);
  const aways = form.getAll('away').map(String);
  const sets = homes
    .map((h, i) => ({ h: h.trim(), a: (aways[i] ?? '').trim() }))
    .filter((s) => s.h !== '' || s.a !== '')
    .map((s) => ({ home: Number(s.h), away: Number(s.a) }));
  try {
    const result = await recordScore(
      await getDb(),
      { kind: 'link', token: text(form, 'token') },
      text(form, 'competition'),
      text(form, 'match'),
      sets,
      {
        now: now(),
        confirm: text(form, 'confirm') === 'yes',
        ...(text(form, 'reason') ? { reason: text(form, 'reason') } : {}),
      },
    );
    if (result.kind === 'invalid') return { ok: false, message: result.errors.join(' ') };
    return { ok: true, data: result };
  } catch (error) {
    if (error instanceof ForbiddenError)
      return { ok: false, message: 'This link no longer works. Ask the organizer for a new one.' };
    throw error;
  }
}
