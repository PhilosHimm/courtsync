import type { Metadata } from 'next';
import Link from 'next/link';
import { EmptyState, PageHeading, SectionTitle } from '@/components/app/ui';
import { Tile } from '@/components/Tile';
import { requireUser } from '@/lib/auth/server';
import { instantToWallClock, venueClockLabel } from '@/lib/core';
import { getDb } from '@/lib/db/client';
import { getPreference, recentNotifications } from '@/lib/db/notify';
import { myParticipants } from '@/lib/db/people';
import { loadPublicEvent } from '@/lib/db/public';
import { nextUp, scheduleRows, teamDay } from '@/lib/event/views';
import { signOutAction } from '../(auth)/actions';
import { PreferencesForm } from './PreferencesForm';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Your schedule — CourtSync', robots: { index: false } };

/**
 * My schedule (#24, #25): the next thing you have to be at, first and large;
 * everything else below. Built from the teams you play for or follow and the
 * drop-ins you joined — an account coordinates your own attendance and keeps
 * no record beyond it.
 */
export default async function MePage() {
  const user = await requireUser('/me');
  const db = await getDb();
  const [mine, preference, notices] = await Promise.all([
    myParticipants(db, user),
    getPreference(db, user.id),
    recentNotifications(db, user.id),
  ]);
  const events = await Promise.all(
    [...new Set(mine.map((m) => m.competitionId))].map((id) => loadPublicEvent(db, id)),
  );
  const now = new Date().toISOString();
  const entries = events.flatMap((pub) => {
    const names = Object.fromEntries(pub.participants.map((p) => [p.id, p.name]));
    const rows = scheduleRows({
      matches: pub.matches,
      timeslots: pub.timeslots,
      courts: pub.courts,
      names,
    });
    const ids = mine.filter((m) => m.competitionId === pub.id).map((m) => m.participantId);
    return {
      pub,
      next: nextUp(rows, ids, now),
      day: ids
        .flatMap((pid) => teamDay(rows, pid))
        .filter((e) => e.row.status !== 'final' && e.row.status !== 'forfeit'),
    };
  });
  const soonest = entries
    .filter((e) => e.next?.startAt)
    .sort((a, b) => Date.parse(a.next?.startAt ?? '') - Date.parse(b.next?.startAt ?? ''))[0];

  return (
    <>
      <Tile surface="parchment">
        <PageHeading title="Your schedule" lead={user.displayName ?? user.email ?? undefined}>
          <form action={signOutAction}>
            <button
              type="submit"
              className="rounded-sm bg-ink px-[15px] py-2 text-button-utility text-on-dark"
            >
              Sign out
            </button>
          </form>
        </PageHeading>
        {soonest?.next ? (
          <div className="mt-8 rounded-lg border border-primary bg-canvas p-6">
            <p className="text-caption-strong">Next up · {soonest.pub.name}</p>
            <p className="mt-2 text-display-md">
              {soonest.next.startAt
                ? `${instantToWallClock(soonest.next.startAt, soonest.pub.timeZone).date} · ${venueClockLabel(soonest.next.startAt, soonest.pub.timeZone)}`
                : 'Time to be set'}
            </p>
            <p className="text-lead-airy">
              {soonest.next.home} v {soonest.next.away}
            </p>
            {soonest.next.court && <p className="text-body">{soonest.next.court}</p>}
          </div>
        ) : (
          <div className="mt-8">
            <EmptyState title="Nothing coming up">
              Follow a team from an event’s public page, or join a drop-in, and it shows up here.{' '}
              <Link className="text-primary" href="/e">
                Browse events
              </Link>
            </EmptyState>
          </div>
        )}
      </Tile>
      <Tile surface="canvas">
        {entries.map(({ pub, day }) => (
          <section key={pub.id} className="mb-8 flex flex-col gap-2">
            <SectionTitle
              note={
                <Link className="text-primary" href={`/e/${pub.id}`}>
                  Event page
                </Link>
              }
            >
              {pub.name}
            </SectionTitle>
            {day.length === 0 ? (
              <p className="text-caption text-ink-muted-80">Nothing left to play.</p>
            ) : (
              <ul className="flex flex-col gap-1 text-body">
                {day.map((e) => (
                  <li key={e.row.matchId}>
                    {e.row.startAt
                      ? venueClockLabel(e.row.startAt, pub.timeZone)
                      : 'Time to be set'}{' '}
                    ·{' '}
                    {e.role === 'refereeing'
                      ? `Refereeing ${e.row.home} v ${e.row.away}`
                      : `v ${e.opponent}`}
                    {e.row.court ? ` · ${e.row.court}` : ''}
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
        <section className="flex flex-col gap-4">
          <SectionTitle>Notifications</SectionTitle>
          <PreferencesForm
            email={user.email ?? null}
            emailOptIn={preference.emailOptIn}
            smsOptIn={preference.smsOptIn}
            phone={user.phone ?? null}
          />
          {notices.length > 0 && (
            <details className="rounded-lg border border-hairline p-4">
              <summary className="cursor-pointer text-body-strong">Recent messages</summary>
              <ul className="mt-3 flex flex-col gap-3">
                {notices.map((n) => (
                  <li key={n.id}>
                    <p className="text-caption-strong">{n.subject}</p>
                    <p className="whitespace-pre-line text-caption">{n.body}</p>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </section>
      </Tile>
    </>
  );
}
