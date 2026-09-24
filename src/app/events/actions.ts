'use server';

import { redirect } from 'next/navigation';
import type { FormState } from '@/components/app/forms';
import { run, text } from '@/lib/app/action';
import { actorOf, requireUser } from '@/lib/auth/server';
import { isTimeZone } from '@/lib/core';
import { restoreBackup } from '@/lib/db/backup';
import { getDb } from '@/lib/db/client';
import { InvalidInputError } from '@/lib/db/errors';
import { createEvent } from '@/lib/db/events';
import { templateById } from '@/lib/event/templates';

/** Start an event from one of the four templates, then open its setup. */
export async function createFromTemplateAction(_: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser('/events');
  let id = '';
  const result = await run(async () => {
    const template = templateById(text(form, 'template'));
    if (!template) throw new InvalidInputError('Choose a template.');
    const timeZone = text(form, 'timeZone');
    const startDate = text(form, 'startDate');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate))
      throw new InvalidInputError('Choose the first date of play.');
    id = await createEvent(
      await getDb(),
      actorOf(user),
      template.build({
        name: text(form, 'name') || template.title,
        startDate,
        timeZone: isTimeZone(timeZone) ? timeZone : 'UTC',
      }),
    );
    return undefined;
  });
  if (result?.ok) redirect(`/events/${id}/setup/basics`);
  return result;
}

/** Restore a JSON backup as a new private draft. */
export async function restoreAction(_: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser('/events');
  const file = form.get('backup');
  if (!(file instanceof File) || file.size === 0)
    return { ok: false, message: 'Choose a backup file.' };
  if (file.size > 10 * 1024 * 1024)
    return { ok: false, message: 'That file is larger than any CourtSync backup.' };
  let id = '';
  const result = await run(async () => {
    id = await restoreBackup(await getDb(), actorOf(user), await file.text());
    return undefined;
  });
  if (result?.ok) redirect(`/events/${id}`);
  return result;
}
