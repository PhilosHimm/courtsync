import Link from 'next/link';
import { ActionForm, INPUT, SubmitButton } from '@/components/app/forms';
import { EmptyState, Notice, SectionTitle } from '@/components/app/ui';
import { organizerEvent } from '@/lib/app/session';
import type { AttendanceStatus } from '@/lib/core';
import { occupied } from '@/lib/event/door';
import { generateDropInRotation } from '@/lib/scheduling';
import { hostAddAction, hostStatusAction, walkInAction } from '../actions';

const LABEL: Record<AttendanceStatus, string> = {
  registered: 'Signed up',
  checked_in: 'Here',
  waitlist: 'Waiting',
  no_show: 'No-show',
};

/**
 * The drop-in host's night, on a phone, between rallies (#26). Big targets,
 * one list, status in words. Walk-ins are added by name with no account, and
 * the host can put anyone in over capacity — the host owns who is in the room.
 */
export default async function DoorPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ night?: string }>;
}) {
  const { id } = await params;
  const { night } = await searchParams;
  const { event } = await organizerEvent(id);
  const c = event.competition;
  if (event.sessions.length === 0)
    return <EmptyState title="No nights yet">Add them in setup.</EmptyState>;
  const today = new Date().toISOString().slice(0, 10);
  const session =
    event.sessions.find((s) => s.id === night) ??
    event.sessions.find((s) => s.playDate >= today) ??
    event.sessions.at(-1)!;
  const list = event.attendance
    .filter((a) => a.sessionId === session.id)
    .sort(
      (a, b) =>
        (a.status === 'waitlist' ? 1 : 0) - (b.status === 'waitlist' ? 1 : 0) ||
        (a.waitlistPos ?? 0) - (b.waitlistPos ?? 0),
    );
  const name = (pid: string) => event.participants.find((p) => p.id === pid)?.name ?? 'Unknown';
  const onList = new Set(list.map((a) => a.participantId));
  const rotation = generateDropInRotation({
    competitionSlug: c.slug,
    competitionId: c.id,
    sessionId: session.id,
    sessionSequence: session.sequence ?? 1,
    attendance: list,
    courtIds: event.courts.filter((x) => x.isActive).map((x) => x.id),
    timeslotIds: event.timeslots.filter((t) => t.sessionId === session.id).map((t) => t.id),
    playersPerSide: c.playersPerSide ?? 6,
  });
  const firstRound = rotation.sides.slice(0, event.courts.length);

  return (
    <div className="flex flex-col gap-8">
      <nav aria-label="Night">
        <ul className="flex flex-wrap gap-2">
          {event.sessions.map((s) => (
            <li key={s.id}>
              <Link
                href={`/events/${id}/door?night=${s.id}`}
                aria-current={s.id === session.id ? 'page' : undefined}
                className={`block rounded-full border px-3 py-1.5 text-caption ${s.id === session.id ? 'border-ink bg-ink text-on-dark' : 'border-hairline'}`}
              >
                {s.name ?? s.playDate}
                {s.cancelledAt ? ' (cancelled)' : ''}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {session.cancelledAt && (
        <Notice tone="warning">
          This night is cancelled{session.cancelReason ? `: ${session.cancelReason}` : '.'}
        </Notice>
      )}

      <SectionTitle
        note={
          c.capacity ? `${occupied(list)} of ${c.capacity} places taken` : `${occupied(list)} in`
        }
      >
        {session.name ?? session.playDate}
      </SectionTitle>

      {list.length === 0 ? (
        <EmptyState title="Nobody yet">
          Players join from the public page, or add them below.
        </EmptyState>
      ) : (
        <ul className="flex flex-col gap-2">
          {list.map((a) => (
            <li
              key={a.participantId}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-hairline px-4 py-3"
            >
              <span>
                <span className="block text-body-strong">{name(a.participantId)}</span>
                <span className="block text-caption text-ink-muted-80">
                  {LABEL[a.status]}
                  {a.status === 'waitlist' ? ` · #${a.waitlistPos}` : ''}
                </span>
              </span>
              <span className="flex flex-wrap gap-2">
                {(a.status === 'checked_in'
                  ? (['no_show', 'registered'] as const)
                  : a.status === 'waitlist'
                    ? (['checked_in'] as const)
                    : (['checked_in', 'no_show'] as const)
                ).map((to) => (
                  <ActionForm key={to} action={hostStatusAction} className="contents">
                    <input type="hidden" name="id" value={id} />
                    <input type="hidden" name="session" value={session.id} />
                    <input type="hidden" name="participant" value={a.participantId} />
                    <input type="hidden" name="status" value={to} />
                    <SubmitButton
                      variant={to === 'checked_in' ? 'utility' : 'secondary'}
                      pending="…"
                    >
                      {to === 'checked_in'
                        ? a.status === 'waitlist'
                          ? 'Let in'
                          : 'Check in'
                        : to === 'no_show'
                          ? 'No-show'
                          : 'Undo'}
                    </SubmitButton>
                  </ActionForm>
                ))}
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="grid gap-6 sm:grid-cols-2">
        <ActionForm action={walkInAction}>
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="session" value={session.id} />
          <div className="flex flex-col gap-1.5">
            <label htmlFor="walkin" className="text-caption-strong">
              Walk-in
            </label>
            <input id="walkin" name="name" required placeholder="Their name" className={INPUT} />
          </div>
          <div>
            <SubmitButton variant="utility">Add and check in</SubmitButton>
          </div>
        </ActionForm>
        {event.participants.some((p) => !onList.has(p.id)) && (
          <ActionForm action={hostAddAction}>
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="session" value={session.id} />
            <div className="flex flex-col gap-1.5">
              <label htmlFor="regular" className="text-caption-strong">
                Add a regular
              </label>
              <select id="regular" name="participant" required className={INPUT}>
                <option value="">Choose…</option>
                {event.participants
                  .filter((p) => !onList.has(p.id))
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </select>
            </div>
            <div>
              <SubmitButton variant="secondary">Sign them up</SubmitButton>
            </div>
          </ActionForm>
        )}
      </div>

      <section className="flex flex-col gap-3">
        <SectionTitle note="Built from who is checked in. Whoever sat out plays first next round; sides reshuffle every round.">
          First round
        </SectionTitle>
        {firstRound.length === 0 ? (
          <p className="text-body text-ink-muted-80">Check people in to see the first round.</p>
        ) : (
          <ol className="grid gap-3 sm:grid-cols-2">
            {firstRound.map((side, i) => (
              <li key={side.matchId} className="rounded-lg border border-hairline p-4 text-caption">
                <p className="text-caption-strong">{event.courts[i]?.name ?? `Court ${i + 1}`}</p>
                <p className="mt-1">{side.home.participantIds.map(name).join(', ')}</p>
                <p className="text-ink-muted-80">v</p>
                <p>{side.away.participantIds.map(name).join(', ')}</p>
              </li>
            ))}
          </ol>
        )}
      </section>

      <p className="text-caption text-ink-muted-80">
        {c.registrationFee ? `Fee: ${c.registrationFee}. ` : ''}CourtSync records what was collected
        and never processes a payment.
      </p>
    </div>
  );
}
