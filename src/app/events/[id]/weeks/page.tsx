import { ActionForm, INPUT, SubmitButton } from '@/components/app/forms';
import { Notice, SectionTitle } from '@/components/app/ui';
import { organizerEvent } from '@/lib/app/session';
import { postponeAction } from '../actions';

/**
 * Moving a week (#28). A team emails on Tuesday: they cannot make week six.
 * Move that week alone for a make-up night, or push it and every week after
 * it — the fixtures travel with their week and nothing else breaks.
 */
export default async function WeeksPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { event } = await organizerEvent(id);
  const played = (sid: string) =>
    event.matches.some((m) => m.sessionId === sid && (m.sets.length > 0 || m.status === 'final'));
  return (
    <div className="flex flex-col gap-6">
      <SectionTitle>The season</SectionTitle>
      <ol className="flex flex-col gap-3">
        {event.sessions.map((s, i) => (
          <li key={s.id} className="rounded-lg border border-hairline p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-body-strong">{s.name ?? `Week ${i + 1}`}</p>
              <p className="text-caption text-ink-muted-80">
                {s.playDate} · {event.matches.filter((m) => m.sessionId === s.id).length} fixtures
                {s.cancelledAt ? ' · cancelled' : ''}
                {played(s.id) ? ' · played' : ''}
              </p>
            </div>
            {!played(s.id) && (
              <ActionForm
                action={postponeAction}
                className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
              >
                <input type="hidden" name="id" value={id} />
                <input type="hidden" name="session" value={s.id} />
                <div className="flex flex-col gap-1.5">
                  <label htmlFor={`d-${s.id}`} className="text-caption-strong">
                    New date
                  </label>
                  <input
                    id={`d-${s.id}`}
                    name="newDate"
                    type="date"
                    required
                    defaultValue={s.playDate}
                    className={INPUT}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor={`m-${s.id}`} className="text-caption-strong">
                    Weeks after it
                  </label>
                  <select id={`m-${s.id}`} name="mode" className={INPUT}>
                    <option value="only">Stay where they are (make-up night)</option>
                    <option value="cascade">Move back by the same amount</option>
                  </select>
                </div>
                <SubmitButton variant="utility">Move</SubmitButton>
              </ActionForm>
            )}
          </li>
        ))}
      </ol>
      <Notice>
        Teams following the league are told when a week moves. Results stay with the night they were
        played.
      </Notice>
    </div>
  );
}
