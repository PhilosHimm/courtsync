'use client';

import { ActionForm, INPUT, SubmitButton } from '@/components/app/forms';
import { preferencesAction } from './actions';

export function PreferencesForm({
  email,
  emailOptIn,
  smsOptIn,
  phone,
}: {
  email: string | null;
  emailOptIn: boolean;
  smsOptIn: boolean;
  phone: string | null;
}) {
  return (
    <ActionForm action={preferencesAction}>
      <fieldset className="flex flex-col gap-3">
        <legend className="text-caption-strong">
          Tell me when a session I joined is cancelled, I come off a waitlist, the schedule moves,
          or an organizer announces something
        </legend>
        <label className="flex items-start gap-2 text-body">
          <input type="checkbox" name="email" defaultChecked={emailOptIn} className="mt-1" />
          <span>By email{email ? ` to ${email}` : ''}</span>
        </label>
        <label className="flex items-start gap-2 text-body">
          <input type="checkbox" name="sms" defaultChecked={smsOptIn} className="mt-1" />
          <span>By text message. Reply STOP to any text to stop them.</span>
        </label>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="phone" className="text-caption-strong">
            Mobile number, with country code
          </label>
          <input
            id="phone"
            name="phone"
            type="tel"
            autoComplete="tel"
            defaultValue={phone ?? ''}
            placeholder="+1 416 555 0100"
            className={INPUT}
          />
          <p className="text-caption text-ink-muted-80">
            Only kept while texts are on. Turning texts off deletes it.
          </p>
        </div>
      </fieldset>
      <p className="text-caption text-ink-muted-80">
        Messages about the same event are gathered for a couple of minutes and sent as one, so a
        busy morning is one text, not forty.
      </p>
      <div>
        <SubmitButton>Save</SubmitButton>
      </div>
    </ActionForm>
  );
}
