import Link from 'next/link';
import { ActionForm, INPUT, SubmitButton } from '@/components/app/forms';
import { MatchList, Timeline } from '@/components/app/ScheduleViews';
import { EmptyState, Notice, SectionTitle } from '@/components/app/ui';
import { organizerEvent } from '@/lib/app/session';
import type { MatchStatus } from '@/lib/core';
import { MATCH_STATUSES, venueClockLabel } from '@/lib/core';
import { describeConflict } from '@/lib/event/conflicts';
import { auditOf, namesOf, suggestionsIn } from '@/lib/event/engine';
import { filterRows, STATUS_LABELS, scheduleRows } from '@/lib/event/views';
import { moveAction, statusAction, withdrawAction } from '../actions';

/**
 * The schedule board (#21): the tournament persona's peak need, changing the
 * grid under pressure. Tap a match, pick a valid slot. Not drag-and-drop —
 * this works one-handed, by keyboard, and without JavaScript.
 */
export default async function ScheduleBoard({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    view?: string;
    team?: string;
    court?: string;
    status?: string;
    day?: string;
    match?: string;
  }>;
}) {
  const { id } = await params;
  const q = await searchParams;
  const { event } = await organizerEvent(id);
  const zone = event.competition.timeZone ?? 'UTC';
  const base = `/events/${id}/schedule`;

  if (event.matches.length === 0) {
    return (
      <EmptyState title="No schedule yet">
        <Link className="text-primary" href={`/events/${id}/setup/schedule`}>
          Generate it in setup
        </Link>
      </EmptyState>
    );
  }

  const sessions = event.sessions;
  const day =
    sessions.find((s) => s.id === q.day) ??
    sessions.find((s) => event.matches.some((m) => m.sessionId === s.id)) ??
    sessions[0];
  const status = MATCH_STATUSES.includes(q.status as MatchStatus)
    ? (q.status as MatchStatus)
    : undefined;
  const rows = scheduleRows({
    matches: event.matches,
    timeslots: event.timeslots,
    courts: event.courts,
    names: namesOf(event),
  });
  const dayRows = rows.filter((r) => r.sessionId === day?.id);
  const filtered = filterRows(dayRows, {
    ...(q.team ? { team: q.team } : {}),
    ...(q.court ? { courtId: q.court } : {}),
    ...(status ? { status } : {}),
  });
  const view = q.view === 'list' ? 'list' : 'timeline';
  const keep = (extra: Record<string, string | undefined>) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries({
      view,
      team: q.team,
      court: q.court,
      status: q.status,
      day: day?.id,
      ...extra,
    })) {
      if (v) params.set(k, v);
    }
    return `${base}?${params.toString()}`;
  };
  const hrefFor = (row: { matchId: string }) => keep({ match: row.matchId });
  const selected = event.matches.find((m) => m.id === q.match);
  const selectedRow = rows.find((r) => r.matchId === q.match);
  const conflicts = auditOf(event);

  return (
    <div className="flex flex-col gap-8">
      {sessions.length > 1 && (
        <nav aria-label="Day">
          <ul className="flex flex-wrap gap-2">
            {sessions.map((s) => (
              <li key={s.id}>
                <Link
                  href={keep({ day: s.id, match: undefined })}
                  aria-current={s.id === day?.id ? 'page' : undefined}
                  className={`block rounded-full border px-3 py-1.5 text-caption ${s.id === day?.id ? 'border-ink bg-ink text-on-dark' : 'border-hairline'}`}
                >
                  {s.name ?? s.playDate}
                  {s.cancelledAt ? ' (cancelled)' : ''}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}

      {conflicts.length > 0 && (
        <details
          open={conflicts.some((c) => c.severity === 'blocking')}
          className="rounded-lg border border-ink p-4"
        >
          <summary className="cursor-pointer text-body-strong">
            {conflicts.filter((c) => c.severity === 'blocking').length} blocking ·{' '}
            {conflicts.filter((c) => c.severity === 'warning').length} warnings
          </summary>
          <ul className="mt-3 flex list-disc flex-col gap-1 pl-5 text-caption">
            {conflicts.map((c, i) => (
              <li key={`${c.kind}-${i}`}>
                <span className="text-caption-strong">
                  {c.severity === 'blocking' ? 'Blocking: ' : 'Warning: '}
                </span>
                {describeConflict(c, event)}
              </li>
            ))}
          </ul>
        </details>
      )}

      <form
        method="get"
        action={base}
        className="grid gap-3 rounded-lg border border-hairline p-4 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end"
      >
        <input type="hidden" name="day" value={day?.id ?? ''} />
        <input type="hidden" name="view" value={view} />
        <div className="flex flex-col gap-1.5">
          <label htmlFor="team" className="text-caption-strong">
            Team
          </label>
          <input
            id="team"
            name="team"
            defaultValue={q.team ?? ''}
            placeholder="Search a team"
            className={INPUT}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="court" className="text-caption-strong">
            Court
          </label>
          <select id="court" name="court" defaultValue={q.court ?? ''} className={INPUT}>
            <option value="">All courts</option>
            {event.courts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="status" className="text-caption-strong">
            Status
          </label>
          <select id="status" name="status" defaultValue={q.status ?? ''} className={INPUT}>
            <option value="">Any status</option>
            {MATCH_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          className="rounded-sm bg-ink px-[15px] py-2 text-button-utility text-on-dark"
        >
          Filter
        </button>
      </form>

      <div className="flex items-center gap-2 text-caption">
        <span>View:</span>
        <Link
          href={keep({ view: 'timeline' })}
          aria-current={view === 'timeline' ? 'page' : undefined}
          className={view === 'timeline' ? 'text-caption-strong' : 'text-primary'}
        >
          Court timeline
        </Link>
        <span aria-hidden="true">·</span>
        <Link
          href={keep({ view: 'list' })}
          aria-current={view === 'list' ? 'page' : undefined}
          className={view === 'list' ? 'text-caption-strong' : 'text-primary'}
        >
          Match list
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div>
          {view === 'timeline' ? (
            <Timeline
              rows={filtered}
              timeslots={event.timeslots.filter((t) => t.sessionId === day?.id)}
              courts={event.courts.filter((c) => !q.court || c.id === q.court)}
              zone={zone}
              hrefFor={hrefFor}
              {...(q.match ? { selected: q.match } : {})}
            />
          ) : (
            <MatchList rows={filtered} zone={zone} hrefFor={hrefFor} />
          )}
        </div>

        <aside aria-label="Selected match" className="flex flex-col gap-4">
          {selected && selectedRow ? (
            <div className="flex flex-col gap-5 rounded-lg border border-hairline p-4 lg:sticky lg:top-20">
              <div>
                <p className="text-body-strong">
                  {selectedRow.home} v {selectedRow.away}
                </p>
                <p className="text-caption text-ink-muted-80">
                  {selectedRow.startAt ? venueClockLabel(selectedRow.startAt, zone) : 'Not placed'}{' '}
                  · {selectedRow.court ?? 'no court'} · {STATUS_LABELS[selected.status]}
                </p>
              </div>
              {selected.sets.length === 0 && selected.status !== 'live' ? (
                <ActionForm action={moveAction}>
                  <input type="hidden" name="id" value={id} />
                  <input type="hidden" name="match" value={selected.id} />
                  <fieldset className="flex flex-col gap-1">
                    <legend className="text-caption-strong">Move to</legend>
                    {(() => {
                      const options = suggestionsIn(event, selected.id).slice(0, 12);
                      if (options.length === 0)
                        return (
                          <p className="text-caption">
                            No free slot keeps everybody in one place at a time.
                          </p>
                        );
                      return options.map((s) => {
                        const slot = event.timeslots.find((t) => t.id === s.timeslotId);
                        const court = event.courts.find((c) => c.id === s.courtId);
                        return (
                          <label
                            key={`${s.courtId}|${s.timeslotId}`}
                            className="flex items-center gap-2 text-caption"
                          >
                            <input
                              type="radio"
                              name="cell"
                              value={`${s.courtId}|${s.timeslotId}`}
                              required
                            />
                            {slot ? venueClockLabel(slot.startAt, zone) : ''} · {court?.name}
                            {!s.respectsRest && (
                              <span className="text-ink-muted-80">(short rest)</span>
                            )}
                          </label>
                        );
                      });
                    })()}
                    <label className="flex items-center gap-2 text-caption">
                      <input type="radio" name="cell" value="unplace" /> Take it off the grid
                    </label>
                  </fieldset>
                  <div>
                    <SubmitButton variant="utility" pending="Moving…">
                      Move
                    </SubmitButton>
                  </div>
                </ActionForm>
              ) : (
                <p className="text-caption text-ink-muted-80">
                  This match has started or has a score, so it stays where it was played.
                </p>
              )}
              {selected.status !== 'final' && selected.status !== 'forfeit' && (
                <ActionForm action={statusAction}>
                  <input type="hidden" name="id" value={id} />
                  <input type="hidden" name="match" value={selected.id} />
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="match-status" className="text-caption-strong">
                      Status
                    </label>
                    <select
                      id="match-status"
                      name="status"
                      defaultValue={selected.status}
                      className={INPUT}
                    >
                      {(['scheduled', 'live', 'delayed', 'cancelled'] as const).map((s) => (
                        <option key={s} value={s}>
                          {STATUS_LABELS[s]}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <SubmitButton variant="utility">Set status</SubmitButton>
                  </div>
                </ActionForm>
              )}
              <Link
                className="text-caption text-primary"
                href={`/events/${id}/scores?match=${encodeURIComponent(selected.id)}`}
              >
                Enter the score or hand out a score link
              </Link>
            </div>
          ) : (
            <Notice>Tap a match to move it, change its status or score it.</Notice>
          )}
        </aside>
      </div>

      <section className="flex flex-col gap-3">
        <SectionTitle note="Their unplayed matches become forfeits; nothing else moves, so nobody re-reads a schedule they already photographed.">
          Withdraw a team
        </SectionTitle>
        <ActionForm
          action={withdrawAction}
          className="grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end"
        >
          <input type="hidden" name="id" value={id} />
          <div className="flex flex-col gap-1.5">
            <label htmlFor="participant" className="text-caption-strong">
              Team
            </label>
            <select id="participant" name="participant" required className={INPUT}>
              <option value="">Choose…</option>
              {event.participants.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-2 pb-2 text-caption">
            <input type="checkbox" name="confirm" value="yes" required /> I am sure
          </label>
          <SubmitButton variant="danger" pending="Withdrawing…">
            Withdraw
          </SubmitButton>
        </ActionForm>
      </section>
    </div>
  );
}
