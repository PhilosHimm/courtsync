import type { Metadata } from 'next';
import Link from 'next/link';
import { Card, EmptyState, PageHeading, SectionTitle } from '@/components/app/ui';
import { Tile } from '@/components/Tile';
import { actorOf, requireUser } from '@/lib/auth/server';
import { getDb } from '@/lib/db/client';
import { listEvents } from '@/lib/db/events';
import { STARTER_TEMPLATES } from '@/lib/event/templates';
import { NewEventForm, RestoreForm } from './NewEventForm';

export const metadata: Metadata = { title: 'Your events — CourtSync', robots: { index: false } };
export const dynamic = 'force-dynamic';

const FORMAT = { tournament: 'Tournament', league: 'League', dropin: 'Drop-in' } as const;
const STATUS = {
  draft: 'Draft — only you can see it',
  published: 'Published',
  archived: 'Archived',
} as const;

export default async function EventsPage() {
  const user = await requireUser('/events');
  const events = await listEvents(await getDb(), actorOf(user));
  const active = events.filter((e) => e.status !== 'archived');
  const archived = events.filter((e) => e.status === 'archived');

  return (
    <>
      <Tile surface="canvas">
        <PageHeading
          title="Your events"
          lead={`Signed in as ${user.displayName ?? user.email ?? 'you'}.`}
        >
          <Link href="/me" className="text-caption text-primary">
            Your schedule and notifications
          </Link>
        </PageHeading>
        <div className="mt-8 flex flex-col gap-3">
          {active.length === 0 ? (
            <EmptyState title="No events yet">
              Start one below — it stays a private draft until you publish it.
            </EmptyState>
          ) : (
            active.map((e) => (
              <Link key={e.id} href={`/events/${e.id}`} className="block">
                <Card className="flex flex-wrap items-baseline justify-between gap-2 hover:border-primary">
                  <span>
                    <span className="block text-body-strong">{e.name}</span>
                    <span className="block text-caption text-ink-muted-80">
                      {FORMAT[e.format]}
                      {e.firstPlayDate ? ` · from ${e.firstPlayDate}` : ''}
                      {e.role === 'co_organizer' ? ' · co-organizer' : ''}
                    </span>
                  </span>
                  <span className="text-caption text-ink-muted-80">{STATUS[e.status]}</span>
                </Card>
              </Link>
            ))
          )}
        </div>
      </Tile>
      <Tile surface="parchment">
        <SectionTitle>New event</SectionTitle>
        <div className="mt-6 rounded-lg border border-hairline bg-canvas p-6">
          <NewEventForm
            templates={STARTER_TEMPLATES.map(({ id, title, summary }) => ({ id, title, summary }))}
          />
        </div>
        <details className="mt-6 rounded-lg border border-hairline bg-canvas p-6">
          <summary className="cursor-pointer text-body-strong">Restore from a backup</summary>
          <div className="mt-4">
            <RestoreForm />
          </div>
        </details>
      </Tile>
      {archived.length > 0 && (
        <Tile surface="canvas">
          <SectionTitle>Archived</SectionTitle>
          <ul className="mt-4 flex flex-col gap-2">
            {archived.map((e) => (
              <li key={e.id}>
                <Link href={`/events/${e.id}`} className="text-body text-primary">
                  {e.name}
                </Link>
              </li>
            ))}
          </ul>
        </Tile>
      )}
    </>
  );
}
