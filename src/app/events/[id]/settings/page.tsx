import { ActionForm, INPUT, SubmitButton } from '@/components/app/forms';
import { SectionTitle } from '@/components/app/ui';
import { organizerEvent } from '@/lib/app/session';
import { actorOf } from '@/lib/auth/server';
import { getDb } from '@/lib/db/client';
import { ledgerSummary, listCoOrganizers } from '@/lib/db/events';
import {
  addCoOrganizerAction,
  deleteAction,
  duplicateAction,
  removeCoOrganizerAction,
} from '../actions';

export default async function SettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, event } = await organizerEvent(id);
  const db = await getDb();
  const [coOrganizers, ledger] = await Promise.all([
    listCoOrganizers(db, actorOf(user), id),
    ledgerSummary(db, actorOf(user), id),
  ]);
  const isOwner = event.competition.createdBy === user.id;

  return (
    <div className="flex flex-col gap-12">
      <section className="flex flex-col gap-4">
        <SectionTitle note="They can do everything you can except delete the event or change who runs it.">
          Co-organizers
        </SectionTitle>
        {coOrganizers.length === 0 ? (
          <p className="text-body text-ink-muted-80">Just you.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {coOrganizers.map((co) => (
              <li
                key={co.userId}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-hairline px-4 py-3"
              >
                <span>{co.displayName ?? co.email}</span>
                {isOwner && (
                  <ActionForm action={removeCoOrganizerAction} className="contents">
                    <input type="hidden" name="id" value={id} />
                    <input type="hidden" name="user" value={co.userId} />
                    <SubmitButton variant="secondary">Remove</SubmitButton>
                  </ActionForm>
                )}
              </li>
            ))}
          </ul>
        )}
        {isOwner && (
          <ActionForm
            action={addCoOrganizerAction}
            className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end"
          >
            <input type="hidden" name="id" value={id} />
            <div className="flex flex-col gap-1.5">
              <label htmlFor="co-email" className="text-caption-strong">
                Their account email
              </label>
              <input id="co-email" name="email" type="email" required className={INPUT} />
            </div>
            <SubmitButton variant="utility">Add</SubmitButton>
          </ActionForm>
        )}
      </section>

      <section className="flex flex-col gap-4">
        <SectionTitle note="Everything in the event, as one file. Insurance, and a way to take it elsewhere.">
          Backup
        </SectionTitle>
        <div>
          <a
            href={`/events/${id}/backup`}
            download
            className="inline-flex rounded-full border border-primary px-[22px] py-[11px] text-body text-primary"
          >
            Download backup (.json)
          </a>
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <SectionTitle note="Teams, rosters, courts, days and rules — not results, payments or history.">
          Duplicate for next time
        </SectionTitle>
        <ActionForm
          action={duplicateAction}
          className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end"
        >
          <input type="hidden" name="id" value={id} />
          <div className="flex flex-col gap-1.5">
            <label htmlFor="dup-name" className="text-caption-strong">
              New event name
            </label>
            <input
              id="dup-name"
              name="name"
              defaultValue={`${event.competition.name} (copy)`}
              className={INPUT}
            />
          </div>
          <SubmitButton variant="secondary">Duplicate</SubmitButton>
        </ActionForm>
      </section>

      {isOwner && (
        <section className="flex flex-col gap-4">
          <SectionTitle>Delete for good</SectionTitle>
          <p className="max-w-2xl text-body">
            Archiving (on the overview) hides the event and keeps everything. Deleting removes it
            and everything in it —
            {ledger.entries > 0
              ? ` including ${ledger.entries} fee record${ledger.entries === 1 ? '' : 's'} (${ledger.collected.toFixed(2)} collected). Download the backup first if you may ever need them.`
              : ' results, rosters and history.'}{' '}
            This cannot be undone.
          </p>
          <ActionForm
            action={deleteAction}
            className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end"
          >
            <input type="hidden" name="id" value={id} />
            <div className="flex flex-col gap-1.5">
              <label htmlFor="typedName" className="text-caption-strong">
                Type the event’s name to confirm
              </label>
              <input
                id="typedName"
                name="typedName"
                required
                autoComplete="off"
                className={INPUT}
              />
            </div>
            <SubmitButton variant="danger" pending="Deleting…">
              Delete event
            </SubmitButton>
          </ActionForm>
        </section>
      )}
    </div>
  );
}
