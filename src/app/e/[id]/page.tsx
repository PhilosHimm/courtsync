import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ActionButton } from '@/components/app/ActionButton';
import { BracketView } from '@/components/app/BracketView';
import { LiveRefresh } from '@/components/app/LiveRefresh';
import { MatchList, Timeline } from '@/components/app/ScheduleViews';
import { StandingsView } from '@/components/app/StandingsView';
import { EmptyState, Notice, SectionTitle } from '@/components/app/ui';
import { Tile } from '@/components/Tile';
import { signedInUser } from '@/lib/app/session';
import type { MatchStatus } from '@/lib/core';
import { MATCH_STATUSES, venueClockLabel } from '@/lib/core';
import { countView } from '@/lib/db/analytics';
import { getDb } from '@/lib/db/client';
import { NotFoundError } from '@/lib/db/errors';
import { myParticipants } from '@/lib/db/people';
import { asSnapshot, loadPublicEvent, type PublicEvent } from '@/lib/db/public';
import type { BracketStage } from '@/lib/event/bracket-stages';
import { bracketStages } from '@/lib/event/bracket-stages';
import { leagueTable, playoffMatchesOf, poolTables, setFormatsOf } from '@/lib/event/engine';
import { filterRows, nextUp, STATUS_LABELS, scheduleRows, teamDay } from '@/lib/event/views';
import { setFormatFor } from '@/lib/scheduling';
import { checkInAction, followAction, joinAction, leaveAction } from './actions';

export const dynamic = 'force-dynamic';

async function load(id: string): Promise<PublicEvent> {
  try {
    return await loadPublicEvent(await getDb(), id);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const pub = await load(id);
  const kind = { tournament: 'Tournament', league: 'League', dropin: 'Drop-in' }[pub.format];
  const description = `${kind}${pub.venue ? ` at ${pub.venue.name}` : ''}: schedule, scores and standings.`;
  return {
    title: `${pub.name} — CourtSync`,
    description: pub.description ?? description,
    alternates: { canonical: `/e/${id}` },
    openGraph: { title: pub.name, description: pub.description ?? description, type: 'website' },
  };
}

/**
 * The public event page (#23): real, indexable, and safe to be indexable.
 * Everything here came through `loadPublicEvent`, which reduced every person
 * to a first name and initial on the server — the full name is not in this
 * page's HTML or its payload. Team names are shown as entered.
 */
export default async function PublicEventPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    tab?: string;
    view?: string;
    team?: string;
    court?: string;
    status?: string;
    day?: string;
    stage?: string;
  }>;
}) {
  const { id } = await params;
  const q = await searchParams;
  const pub = await load(id);
  const event = asSnapshot(pub);
  const zone = pub.timeZone;
  const db = await getDb();
  void countView(db, `/e/${id}`, new Date().toISOString()).catch(() => undefined);
  const user = await signedInUser();
  const mine = user ? (await myParticipants(db, user)).filter((m) => m.competitionId === id) : [];
  const names = Object.fromEntries(pub.participants.map((p) => [p.id, p.name]));
  const rows = scheduleRows({
    matches: pub.matches,
    timeslots: pub.timeslots,
    courts: pub.courts,
    names,
  });
  const base = `/e/${id}`;
  const tab = q.tab ?? (pub.format === 'dropin' ? 'nights' : 'schedule');
  const tabs =
    pub.format === 'dropin'
      ? [{ key: 'nights', label: 'Nights' }]
      : [
          { key: 'schedule', label: 'Schedule' },
          { key: 'standings', label: 'Standings' },
          ...(pub.format === 'tournament' ? [{ key: 'bracket', label: 'Bracket' }] : []),
          { key: 'teams', label: 'Teams' },
        ];
  const firstDay = pub.sessions[0]?.playDate;
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'SportsEvent',
    name: pub.name,
    sport: 'Volleyball',
    ...(firstDay ? { startDate: firstDay } : {}),
    ...(pub.sessions.at(-1)?.playDate ? { endDate: pub.sessions.at(-1)?.playDate } : {}),
    ...(pub.venue
      ? {
          location: {
            '@type': 'Place',
            name: pub.venue.name,
            ...(pub.venue.address ? { address: pub.venue.address } : {}),
          },
        }
      : {}),
    ...(pub.description ? { description: pub.description } : {}),
  };
  const now = new Date().toISOString();
  const next =
    mine.length > 0
      ? nextUp(
          rows,
          mine.map((m) => m.participantId),
          now,
        )
      : null;

  return (
    <>
      {/* Structured data for search engines. JSON.stringify of our own object,
          with every "<" escaped, so no value can close the script element. */}
      <script
        type="application/ld+json"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: JSON-LD must be raw script text; "<" is escaped above.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
      />
      <Tile surface="parchment">
        <p className="text-caption text-ink-muted-80">
          {{ tournament: 'Tournament', league: 'League', dropin: 'Drop-in' }[pub.format]}
          {pub.venue ? ` · ${pub.venue.name}` : ''}
          {pub.skillLabel ? ` · ${pub.skillLabel}` : ''}
        </p>
        <h1 className="mt-1 text-display-md sm:text-display-lg">{pub.name}</h1>
        {pub.description && (
          <p className="mt-3 max-w-2xl whitespace-pre-line text-body">{pub.description}</p>
        )}
        {next && (
          <div className="mt-6 rounded-lg border border-primary bg-canvas p-5">
            <p className="text-caption-strong">Your next match</p>
            <p className="mt-1 text-lead">
              {next.startAt ? venueClockLabel(next.startAt, zone) : 'Time to be set'}
            </p>
            <p className="text-body">
              {next.home} v {next.away}
              {next.court ? ` · ${next.court}` : ''}
            </p>
          </div>
        )}
        {pub.announcements.length > 0 && (
          <div className="mt-6 flex flex-col gap-2">
            {pub.announcements.slice(0, 3).map((a) => (
              <Notice key={a.id}>
                <span className="text-caption-strong">
                  {new Date(a.createdAt).toISOString().slice(0, 10)}:{' '}
                </span>
                <span className="whitespace-pre-line">{a.body}</span>
              </Notice>
            ))}
          </div>
        )}
      </Tile>
      <div className="mx-auto flex max-w-[1100px] flex-col gap-8 px-6 py-10">
        <nav aria-label="Event">
          <ul className="flex flex-wrap gap-2">
            {tabs.map((t) => (
              <li key={t.key}>
                <Link
                  href={`${base}?tab=${t.key}`}
                  aria-current={t.key === tab ? 'page' : undefined}
                  className={`block rounded-full px-4 py-2 text-caption ${t.key === tab ? 'bg-ink text-on-dark' : 'border border-hairline'}`}
                >
                  {t.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        {pub.format !== 'dropin' && tab !== 'teams' && <LiveRefresh />}

        {tab === 'schedule' && <PublicSchedule pub={pub} rows={rows} q={q} base={base} />}

        {tab === 'standings' &&
          (pub.format === 'league' ? (
            <StandingsView
              title="Season table"
              standings={leagueTable(event)}
              matches={pub.matches}
              tiebreakerOrder={pub.tiebreakerOrder ?? undefined}
              splitSetsDecidedByTotalPoints={
                setFormatFor('pool', setFormatsOf(event)).splitDecidedOnTotalPoints
              }
            />
          ) : pub.pools.length === 0 ? (
            <EmptyState title="Pools are not drawn yet" />
          ) : (
            <div className="flex flex-col gap-8">
              {pub.pools.map((pool) => (
                <StandingsView
                  key={pool.id}
                  title={`Pool ${pool.name}`}
                  standings={poolTables(event)[pool.id] ?? []}
                  matches={pub.matches.filter((m) => m.poolId === pool.id)}
                  tiebreakerOrder={pub.tiebreakerOrder ?? undefined}
                  splitSetsDecidedByTotalPoints={
                    setFormatFor('pool', setFormatsOf(event)).splitDecidedOnTotalPoints
                  }
                />
              ))}
            </div>
          ))}

        {tab === 'bracket' &&
          (playoffMatchesOf(event).length === 0 ? (
            <EmptyState title="The bracket is drawn after pool play" />
          ) : (
            [...new Set(playoffMatchesOf(event).map((m) => m.bracket ?? ''))].map((tier) => (
              <BracketView
                key={tier}
                tier={tier}
                stages={bracketStages({
                  competitionSlug: pub.slug,
                  tier,
                  matches: playoffMatchesOf(event),
                  names,
                })}
                current={q.stage as BracketStage['key'] | undefined}
                hrefFor={(stage) => `${base}?tab=bracket&stage=${stage}`}
                mode={q.view === 'list' ? 'list' : 'stages'}
                listHref={`${base}?tab=bracket&view=list`}
                stagesHref={`${base}?tab=bracket`}
              />
            ))
          ))}

        {tab === 'teams' && (
          <section className="flex flex-col gap-4">
            <SectionTitle note="Follow a team to see its matches on your own schedule.">
              Teams
            </SectionTitle>
            <ul className="grid gap-3 sm:grid-cols-2">
              {pub.participants.map((p) => {
                const following = mine.some((m) => m.participantId === p.id && m.how === 'follows');
                return (
                  <li
                    key={p.id}
                    className="flex flex-col gap-2 rounded-lg border border-hairline p-4"
                  >
                    <Link
                      href={`${base}?tab=schedule&team=${encodeURIComponent(p.name)}&view=team`}
                      className="text-body-strong text-primary"
                    >
                      {p.name}
                    </Link>
                    {p.roster.length > 0 && (
                      <p className="text-caption text-ink-muted-80">{p.roster.join(', ')}</p>
                    )}
                    {user ? (
                      <ActionButton
                        action={followAction}
                        fields={{ id, participant: p.id, mode: following ? 'unfollow' : 'follow' }}
                        label={following ? 'Unfollow' : 'Follow'}
                      />
                    ) : null}
                  </li>
                );
              })}
            </ul>
            {!user && (
              <p className="text-caption">
                <Link
                  className="text-primary"
                  href={`/sign-in?next=${encodeURIComponent(`${base}?tab=teams`)}`}
                >
                  Sign in
                </Link>{' '}
                to follow a team.
              </p>
            )}
          </section>
        )}

        {tab === 'nights' && (
          <section className="flex flex-col gap-4">
            <SectionTitle
              note={
                pub.capacity
                  ? `${pub.capacity} places a night. A full night has a waitlist; you are told if a place opens.`
                  : undefined
              }
            >
              Nights
            </SectionTitle>
            <ul className="flex flex-col gap-3">
              {pub.sessions.map((s) => {
                const att = pub.attendance.find((a) => a.sessionId === s.id);
                const going = att?.going.filter((g) => g.status !== 'no_show') ?? [];
                const mineHere = mine.find((m) => m.how === 'plays');
                return (
                  <li
                    key={s.id}
                    className="flex flex-col gap-3 rounded-lg border border-hairline p-4"
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="text-body-strong">
                        {s.name ?? s.playDate} · {s.startTime}–{s.endTime}
                      </p>
                      <p className="text-caption text-ink-muted-80">
                        {s.cancelledAt
                          ? `Cancelled${s.cancelReason ? `: ${s.cancelReason}` : ''}`
                          : `${going.length}${pub.capacity ? ` of ${pub.capacity}` : ''} going${att && att.waitlist > 0 ? ` · ${att.waitlist} waiting` : ''}`}
                      </p>
                    </div>
                    {going.length > 0 && (
                      <p className="text-caption">{going.map((g) => g.name).join(', ')}</p>
                    )}
                    {!s.cancelledAt &&
                      (user ? (
                        <div className="flex flex-wrap gap-2">
                          <ActionButton
                            action={joinAction}
                            fields={{ id, session: s.id }}
                            label="Join"
                            variant="primary"
                          />
                          {mineHere && (
                            <ActionButton
                              action={checkInAction}
                              fields={{ id, session: s.id }}
                              label="I’m here"
                              variant="utility"
                            />
                          )}
                          {mineHere && (
                            <ActionButton
                              action={leaveAction}
                              fields={{ id, session: s.id }}
                              label="Leave"
                            />
                          )}
                        </div>
                      ) : (
                        <Link
                          className="self-start text-body text-primary"
                          href={`/sign-in?next=${encodeURIComponent(base)}`}
                        >
                          Sign in to join
                        </Link>
                      ))}
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        <p className="text-caption text-ink-muted-80">
          <a className="text-primary" href={`${base}/sheet.pdf`}>
            Printable sheet (PDF)
          </a>{' '}
          · People are shown as first name and last initial.
        </p>
      </div>
    </>
  );
}

function PublicSchedule({
  pub,
  rows,
  q,
  base,
}: {
  pub: PublicEvent;
  rows: ReturnType<typeof scheduleRows>;
  q: { view?: string; team?: string; court?: string; status?: string; day?: string };
  base: string;
}) {
  if (rows.length === 0) return <EmptyState title="The schedule is not out yet" />;
  const day =
    pub.sessions.find((s) => s.id === q.day) ??
    pub.sessions.find((s) => rows.some((r) => r.sessionId === s.id));
  const status = MATCH_STATUSES.includes(q.status as MatchStatus)
    ? (q.status as MatchStatus)
    : undefined;
  const view = q.view === 'timeline' ? 'timeline' : q.view === 'team' ? 'team' : 'list';
  const dayRows = rows.filter((r) => r.sessionId === day?.id);
  const filtered = filterRows(dayRows, {
    ...(q.team ? { team: q.team } : {}),
    ...(q.court ? { courtId: q.court } : {}),
    ...(status ? { status } : {}),
  });
  const link = (extra: Record<string, string | undefined>) => {
    const p = new URLSearchParams({ tab: 'schedule' });
    for (const [k, v] of Object.entries({
      view,
      team: q.team,
      court: q.court,
      status: q.status,
      day: day?.id,
      ...extra,
    }))
      if (v) p.set(k, v);
    return `${base}?${p.toString()}`;
  };
  const team = q.team
    ? pub.participants.find((p) => p.name.toLowerCase() === q.team?.toLowerCase())
    : undefined;

  return (
    <section className="flex flex-col gap-4">
      {pub.sessions.length > 1 && (
        <nav aria-label="Day">
          <ul className="flex flex-wrap gap-2">
            {pub.sessions.map((s) => (
              <li key={s.id}>
                <Link
                  href={link({ day: s.id })}
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
      <form
        method="get"
        action={base}
        className="grid gap-3 rounded-lg border border-hairline p-4 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end"
      >
        <input type="hidden" name="tab" value="schedule" />
        <input type="hidden" name="view" value={view} />
        {day && <input type="hidden" name="day" value={day.id} />}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="team" className="text-caption-strong">
            Team
          </label>
          <input
            id="team"
            name="team"
            defaultValue={q.team ?? ''}
            placeholder="Search a team"
            className="rounded-sm border border-hairline px-3 py-2 text-body"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="court" className="text-caption-strong">
            Court
          </label>
          <select
            id="court"
            name="court"
            defaultValue={q.court ?? ''}
            className="rounded-sm border border-hairline px-3 py-2 text-body"
          >
            <option value="">All courts</option>
            {pub.courts.map((c) => (
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
          <select
            id="status"
            name="status"
            defaultValue={q.status ?? ''}
            className="rounded-sm border border-hairline px-3 py-2 text-body"
          >
            <option value="">Any</option>
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
      <div className="flex flex-wrap items-center gap-2 text-caption">
        <span>View:</span>
        {(['list', 'timeline', 'team'] as const).map((v, i) => (
          <span key={v} className="flex items-center gap-2">
            {i > 0 && <span aria-hidden="true">·</span>}
            <Link
              href={link({ view: v })}
              aria-current={view === v ? 'page' : undefined}
              className={view === v ? 'text-caption-strong' : 'text-primary'}
            >
              {{ list: 'Match list', timeline: 'Court timeline', team: 'One team’s day' }[v]}
            </Link>
          </span>
        ))}
      </div>
      {view === 'list' && <MatchList rows={filtered} zone={pub.timeZone} />}
      {view === 'timeline' && (
        <Timeline
          rows={filtered}
          timeslots={pub.timeslots.filter((t) => t.sessionId === day?.id)}
          courts={pub.courts}
          zone={pub.timeZone}
        />
      )}
      {view === 'team' &&
        (team ? (
          <div className="flex flex-col gap-2">
            <h2 className="text-tagline">{team.name}</h2>
            <MatchList
              rows={teamDay(rows, team.id).map((e) => e.row)}
              zone={pub.timeZone}
              showDay={pub.sessions.length > 1}
            />
          </div>
        ) : (
          <Notice>Type a team’s full name above to see its whole day.</Notice>
        ))}
    </section>
  );
}
