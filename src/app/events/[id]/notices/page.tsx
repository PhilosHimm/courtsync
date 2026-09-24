import { ActionForm, INPUT, SubmitButton } from '@/components/app/forms';
import { SectionTitle } from '@/components/app/ui';
import { organizerEvent } from '@/lib/app/session';
import { venueClockLabel } from '@/lib/core';
import { announceAction, cancelSessionAction, reinstateAction } from '../actions';

/** Announcements and calling a night off (#27's triggers). */
export default async function NoticesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { event } = await organizerEvent(id);
  const zone = event.competition.timeZone ?? 'UTC';
  return (
    <div className="grid gap-10 lg:grid-cols-2">
      <section className="flex flex-col gap-4">
        <SectionTitle>Announce</SectionTitle>
        <ActionForm action={announceAction}>
          <input type="hidden" name="id" value={id} />
          <div className="flex flex-col gap-1.5">
            <label htmlFor="body" className="text-caption-strong">
              Message
            </label>
            <textarea id="body" name="body" required maxLength={2000} rows={4} className={INPUT} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="session" className="text-caption-strong">
              About
            </label>
            <select id="session" name="session" className={INPUT}>
              <option value="">The whole event</option>
              {event.sessions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name ?? s.playDate}
                </option>
              ))}
            </select>
          </div>
          <p className="text-caption text-ink-muted-80">
            Shown on the public page. Players and followers who opted in get an email or text.
          </p>
          <div>
            <SubmitButton>Post</SubmitButton>
          </div>
        </ActionForm>
        <ol className="flex flex-col gap-3">
          {event.announcements.map((a) => (
            <li key={a.id} className="rounded-lg border border-hairline p-4">
              <p className="text-caption text-ink-muted-80">
                {new Date(a.createdAt).toISOString().slice(0, 10)} ·{' '}
                {venueClockLabel(a.createdAt, zone)}
              </p>
              <p className="mt-1 whitespace-pre-line text-body">{a.body}</p>
            </li>
          ))}
        </ol>
      </section>
      <section className="flex flex-col gap-4">
        <SectionTitle note="Its results stay; the sessions after it are untouched.">
          Cancel a session
        </SectionTitle>
        <ul className="flex flex-col gap-3">
          {event.sessions.map((s) => (
            <li key={s.id} className="rounded-lg border border-hairline p-4">
              <p className="text-body-strong">{s.name ?? s.playDate}</p>
              {s.cancelledAt ? (
                <ActionForm action={reinstateAction} className="mt-2 flex flex-col gap-2">
                  <input type="hidden" name="id" value={id} />
                  <input type="hidden" name="session" value={s.id} />
                  <p className="text-caption">
                    Cancelled{s.cancelReason ? `: ${s.cancelReason}` : ''}
                  </p>
                  <div>
                    <SubmitButton variant="secondary">Reinstate</SubmitButton>
                  </div>
                </ActionForm>
              ) : (
                <ActionForm
                  action={cancelSessionAction}
                  className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end"
                >
                  <input type="hidden" name="id" value={id} />
                  <input type="hidden" name="session" value={s.id} />
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor={`r-${s.id}`} className="text-caption-strong">
                      Reason (optional)
                    </label>
                    <input
                      id={`r-${s.id}`}
                      name="reason"
                      className={INPUT}
                      placeholder="Gym flooded"
                    />
                  </div>
                  <SubmitButton variant="danger">Cancel it</SubmitButton>
                </ActionForm>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
