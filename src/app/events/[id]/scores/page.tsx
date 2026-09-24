import Link from 'next/link';
import { ActionForm, SubmitButton } from '@/components/app/forms';
import { ScoreForm } from '@/components/app/ScoreForm';
import { EmptyState, Notice, SectionTitle, StatusText } from '@/components/app/ui';
import { organizerEvent } from '@/lib/app/session';
import { venueClockLabel } from '@/lib/core';
import { formatOf, namesOf } from '@/lib/event/engine';
import { scheduleRows } from '@/lib/event/views';
import { issueLinkAction, revokeLinkAction, scoreAction } from '../actions';
import { CopyLink } from './CopyLink';

/** Score entry for organizers, and the per-match links for scorekeepers (#22). */
export default async function ScoresPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ match?: string; show?: string }>;
}) {
  const { id } = await params;
  const { match: key, show } = await searchParams;
  const { event } = await organizerEvent(id);
  const zone = event.competition.timeZone ?? 'UTC';
  const names = namesOf(event);
  const rows = scheduleRows({
    matches: event.matches,
    timeslots: event.timeslots,
    courts: event.courts,
    names,
  });
  const visible =
    show === 'all'
      ? rows
      : rows.filter((r) => r.status !== 'final' && r.status !== 'forfeit' && r.homeId && r.awayId);
  const match = event.matches.find((m) => m.id === key);

  if (event.matches.length === 0) {
    return <EmptyState title="No matches yet">Generate the schedule first.</EmptyState>;
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_24rem]">
      <section className="flex flex-col gap-4">
        <SectionTitle
          note={
            <Link
              href={`/events/${id}/scores${show === 'all' ? '' : '?show=all'}`}
              className="text-primary"
            >
              {show === 'all' ? 'Only matches still to score' : 'Show every match'}
            </Link>
          }
        >
          {show === 'all' ? 'Every match' : 'Still to score'}
        </SectionTitle>
        {visible.length === 0 ? (
          <p className="text-body">Every match with two teams has a result.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {visible.map((row) => (
              <li key={row.matchId}>
                <Link
                  href={`/events/${id}/scores?match=${encodeURIComponent(row.matchId)}${show === 'all' ? '&show=all' : ''}`}
                  aria-current={row.matchId === key ? 'true' : undefined}
                  className={`flex flex-wrap items-baseline justify-between gap-2 rounded-lg border px-4 py-3 ${row.matchId === key ? 'border-primary' : 'border-hairline'}`}
                >
                  <span>
                    <span className="block text-body-strong">
                      {row.home} v {row.away}
                    </span>
                    <span className="block text-caption text-ink-muted-80">
                      {row.startAt ? venueClockLabel(row.startAt, zone) : 'Not placed'} ·{' '}
                      {row.court ?? 'no court'}
                      {row.score ? ` · ${row.score}` : ''}
                    </span>
                  </span>
                  <StatusText status={row.status} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <aside aria-label="Score entry" className="flex flex-col gap-6">
        {match?.homeParticipantId && match.awayParticipantId ? (
          <div className="flex flex-col gap-6 rounded-lg border border-hairline p-5 lg:sticky lg:top-20">
            <div>
              <p className="text-body-strong">
                {names[match.homeParticipantId]} v {names[match.awayParticipantId]}
              </p>
              <p className="text-caption text-ink-muted-80">{formatOf(event, match).label}</p>
            </div>
            <ScoreForm
              key={match.id}
              action={scoreAction}
              hidden={{ id, match: match.id }}
              home={names[match.homeParticipantId] ?? 'Home'}
              away={names[match.awayParticipantId] ?? 'Away'}
              setLabels={formatOf(event, match).setLabels}
              initial={match.sets.map((s) => ({ home: s.homePoints, away: s.awayPoints }))}
            />
            <div className="flex flex-col gap-3 border-t border-hairline pt-5">
              <p className="text-caption-strong">Hand the scoring to someone else</p>
              <p className="text-caption text-ink-muted-80">
                A link that scores this one match and nothing else. No account needed. Issuing a new
                one stops the old one.
              </p>
              <CopyLink action={issueLinkAction} id={id} match={match.id} />
              <ActionForm action={revokeLinkAction}>
                <input type="hidden" name="id" value={id} />
                <input type="hidden" name="match" value={match.id} />
                <div>
                  <SubmitButton variant="danger">Revoke link</SubmitButton>
                </div>
              </ActionForm>
            </div>
            {event.scoreEdits.some((e) => e.matchId === match.id) && (
              <details className="border-t border-hairline pt-5">
                <summary className="cursor-pointer text-caption-strong">Score history</summary>
                <ol className="mt-2 flex flex-col gap-1 text-caption">
                  {event.scoreEdits
                    .filter((e) => e.matchId === match.id)
                    .map((e) => (
                      <li key={e.id}>
                        {venueClockLabel(e.editedAt, zone)} · Set {e.setNumber}:{' '}
                        {e.previousHome === null
                          ? 'entered'
                          : `${e.previousHome}–${e.previousAway} →`}{' '}
                        {e.nextHome === null ? 'removed' : `${e.nextHome}–${e.nextAway}`}
                        {e.viaLinkId ? ' · via score link' : ''}
                        {e.reason ? ` · “${e.reason}”` : ''}
                      </li>
                    ))}
                </ol>
              </details>
            )}
          </div>
        ) : match ? (
          <Notice>This match is waiting for its teams.</Notice>
        ) : (
          <Notice>Choose a match to enter its score.</Notice>
        )}
      </aside>
    </div>
  );
}
