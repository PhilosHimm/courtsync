'use client';

import { useEffect, useState } from 'react';
import { ActionForm, INPUT, SubmitButton } from '@/components/app/forms';
import { createFromTemplateAction, restoreAction } from './actions';

export function NewEventForm({
  templates,
}: {
  templates: ReadonlyArray<{ id: string; title: string; summary: string }>;
}) {
  // The organizer's own zone, so 9:00 means 9:00 at their gym. Read in the
  // browser, where it is known; the server never guesses it.
  const [zone, setZone] = useState('UTC');
  useEffect(() => setZone(Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'), []);

  return (
    <ActionForm action={createFromTemplateAction}>
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 text-caption-strong">Start from</legend>
        {templates.map((t, i) => (
          <label
            key={t.id}
            className="flex cursor-pointer gap-3 rounded-lg border border-hairline p-4 has-[:checked]:border-primary"
          >
            <input
              type="radio"
              name="template"
              value={t.id}
              defaultChecked={i === 0}
              className="mt-1"
            />
            <span>
              <span className="block text-body-strong">{t.title}</span>
              <span className="block text-caption text-ink-muted-80">{t.summary}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="name" className="text-caption-strong">
            Event name
          </label>
          <input
            id="name"
            name="name"
            required
            maxLength={120}
            className={INPUT}
            placeholder="Spring Open"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="startDate" className="text-caption-strong">
            First date of play
          </label>
          <input id="startDate" name="startDate" type="date" required className={INPUT} />
        </div>
      </div>
      <input type="hidden" name="timeZone" value={zone} />
      <p className="text-caption text-ink-muted-80">
        Times are in {zone}. Every detail — teams, courts, hours, rules — is yours to change in the
        next steps.
      </p>
      <div>
        <SubmitButton pending="Creating…">Create and set up</SubmitButton>
      </div>
    </ActionForm>
  );
}

export function RestoreForm() {
  return (
    <ActionForm action={restoreAction}>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="backup" className="text-caption-strong">
          Backup file
        </label>
        <input
          id="backup"
          name="backup"
          type="file"
          accept="application/json,.json"
          required
          className={INPUT}
        />
      </div>
      <div>
        <SubmitButton variant="secondary" pending="Restoring…">
          Restore as a new draft
        </SubmitButton>
      </div>
    </ActionForm>
  );
}
