'use server';

import { revalidatePath } from 'next/cache';
import type { FormState } from '@/components/app/forms';
import { now, text } from '@/lib/app/action';
import { requireUser } from '@/lib/auth/server';
import { getDb } from '@/lib/db/client';
import { savePreference } from '@/lib/db/notify';

/** A person's own notification choices. Consent is theirs to give and take back. */
export async function preferencesAction(_: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser('/me');
  try {
    await savePreference(
      await getDb(),
      user.id,
      {
        emailOptIn: form.get('email') === 'on',
        smsOptIn: form.get('sms') === 'on',
        phone: text(form, 'phone') || null,
      },
      now(),
    );
  } catch (error) {
    return { ok: false, message: (error as Error).message };
  }
  revalidatePath('/me');
  return { ok: true, message: 'Saved.' };
}
