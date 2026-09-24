import Link from 'next/link';
import { ActionButton } from '@/components/app/ActionButton';
import { Card, Notice, SectionTitle } from '@/components/app/ui';
import { organizerEvent } from '@/lib/app/session';
import { serverEnv } from '@/lib/db/env';
import { auditOf, playoffMatchesOf, poolPlayComplete } from '@/lib/event/engine';
import { transitionAction } from './actions';

/**
 * Where an organizer lands: what state the event is in, what is left to do,
 * and whether the grid has a problem. Publishing is visibility only — the
 * event stays editable afterwards.
 */
export default async function EventOverview({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { event } = await organizerEvent(id);
  const c = event.competition;
  const status = c.status ?? 'draft';
  const conflicts = auditOf(event);
  const blocking = conflicts.filter((x) => x.severity === 'blocking').length;
  const publicUrl = `${serverEnv().appUrl}/e/${id}`;

  const steps: Array<{ done: boolean; label: string; href: string }> = [
    {
      done: event.participants.length > 0 || c.format === 'dropin',
      label:
        c.format === 'dropin'
          ? 'Players join themselves — nothing to enter'
          : `Entries: ${event.participants.length}`,
      href: `/events/${id}/setup/entries`,
    },
    {
      done: event.courts.length > 0,
      label: `Courts: ${event.courts.length}`,
      href: `/events/${id}/setup/courts`,
    },
    {
      done: event.timeslots.length > 0,
      label: `${c.format === 'league' ? 'Weeks' : c.format === 'dropin' ? 'Nights' : 'Days'}: ${event.sessions.length}, with ${event.timeslots.length} time slots`,
      href: `/events/${id}/setup/courts`,
    },
    ...(c.format === 'dropin'
      ? []
      : [
          {
            done: event.matches.length > 0,
            label:
              event.matches.length > 0
                ? `Schedule: ${event.matches.length} matches`
                : 'Generate the schedule',
            href: `/events/${id}/setup/schedule`,
          },
        ]),
    ...(c.format === 'tournament'
      ? [
          {
            done: playoffMatchesOf(event).length > 0,
            label: poolPlayComplete(event)
              ? 'Seed the playoffs'
              : 'Playoffs: after every pool match has a result',
            href: `/events/${id}/bracket`,
          },
        ]
      : []),
    {
      done: status === 'published',
      label: status === 'published' ? 'Published' : 'Publish when ready',
      href: `/events/${id}`,
    },
  ];

  return (
    <div className="flex flex-col gap-10">
      <section className="flex flex-col gap-4">
        <SectionTitle>Visibility</SectionTitle>
        {status === 'published' && (
          <Card>
            <p className="text-caption-strong">Public page</p>
            <p className="mt-1 break-all text-body">
              <a className="text-primary" href={`/e/${id}`}>
                {publicUrl}
              </a>
            </p>
            <p className="mt-2 text-caption text-ink-muted-80">
              Anyone with the link — and search engines — can see the schedule, scores and
              standings. People are shown as first name and last initial; contact details never
              appear.
            </p>
          </Card>
        )}
        <div className="flex flex-wrap gap-3">
          {status === 'draft' && (
            <ActionButton
              action={transitionAction}
              fields={{ id, transition: 'publish' }}
              label="Publish"
              variant="primary"
            />
          )}
          {status === 'published' && (
            <ActionButton
              action={transitionAction}
              fields={{ id, transition: 'unpublish' }}
              label="Unpublish"
            />
          )}
          {status !== 'archived' && (
            <ActionButton
              action={transitionAction}
              fields={{ id, transition: 'archive' }}
              label="Archive"
              variant="danger"
            />
          )}
          {status === 'archived' && (
            <ActionButton
              action={transitionAction}
              fields={{ id, transition: 'restore' }}
              label="Restore as draft"
              variant="primary"
            />
          )}
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <SectionTitle>Getting it ready</SectionTitle>
        <ol className="flex flex-col gap-2">
          {steps.map((step) => (
            <li key={step.label} className="flex items-baseline gap-3">
              <span aria-hidden="true" className="w-5 text-center">
                {step.done ? '✓' : '○'}
              </span>
              <span className="sr-only">{step.done ? 'Done: ' : 'To do: '}</span>
              <Link href={step.href} className="text-body text-primary">
                {step.label}
              </Link>
            </li>
          ))}
        </ol>
      </section>

      {event.matches.length > 0 && (
        <section className="flex flex-col gap-4">
          <SectionTitle>The grid</SectionTitle>
          {conflicts.length === 0 ? (
            <p className="text-body">
              No conflicts. Nobody is in two places at once and every court is used inside its
              hours.
            </p>
          ) : (
            <Notice tone={blocking > 0 ? 'warning' : 'info'}>
              {blocking > 0
                ? `${blocking} blocking conflict${blocking === 1 ? '' : 's'} — somebody or some court is double-booked. `
                : ''}
              {conflicts.length - blocking} warning{conflicts.length - blocking === 1 ? '' : 's'}.{' '}
              <Link href={`/events/${id}/schedule`} className="text-primary">
                Open the schedule board
              </Link>
            </Notice>
          )}
        </section>
      )}
    </div>
  );
}
