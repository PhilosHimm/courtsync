import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ActionButton } from '@/components/app/ActionButton';
import { ActionForm, INPUT, SubmitButton } from '@/components/app/forms';
import { Field, Notice, SectionTitle } from '@/components/app/ui';
import { organizerEvent } from '@/lib/app/session';
import { instantToWallClock, TIEBREAKER_ORDER } from '@/lib/core';
import { describeConflict } from '@/lib/event/conflicts';
import { auditOf, setFormatsOf } from '@/lib/event/engine';
import {
  basicsAction,
  courtsAction,
  entriesAction,
  formatAction,
  generateAction,
  redrawAction,
  sessionsAction,
  transitionAction,
  windowsAction,
} from '../../actions';
import { StepForm } from '../StepForm';

const STEPS = [
  { key: 'basics', label: 'Basics' },
  { key: 'format', label: 'Format' },
  { key: 'entries', label: 'Teams' },
  { key: 'courts', label: 'Courts and time' },
  { key: 'schedule', label: 'Schedule' },
  { key: 'review', label: 'Review' },
] as const;

const TIEBREAKER_NAMES: Record<string, string> = {
  winPercentage: 'Win percentage',
  headToHead: 'Head-to-head',
  setDifferential: 'Set differential',
  pointDifferential: 'Point differential',
};

export default async function SetupStep({
  params,
}: {
  params: Promise<{ id: string; step: string }>;
}) {
  const { id, step } = await params;
  const index = STEPS.findIndex((s) => s.key === step);
  if (index === -1) notFound();
  const { event } = await organizerEvent(id);
  const c = event.competition;
  const format = c.format;
  const steps = STEPS.filter((s) => !(format === 'dropin' && s.key === 'schedule'));
  const position = steps.findIndex((s) => s.key === step);
  const next = steps[position + 1];
  const nextHref = next ? `/events/${id}/setup/${next.key}` : null;
  const zone = c.timeZone ?? 'UTC';

  return (
    <div className="flex flex-col gap-8">
      <nav aria-label="Setup steps">
        <ol className="flex flex-wrap gap-2">
          {steps.map((s, i) => (
            <li key={s.key}>
              <Link
                href={`/events/${id}/setup/${s.key}`}
                aria-current={s.key === step ? 'step' : undefined}
                className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-caption ${
                  s.key === step ? 'border-ink bg-ink text-on-dark' : 'border-hairline text-ink'
                }`}
              >
                <span aria-hidden="true">{i + 1}</span> {s.label}
              </Link>
            </li>
          ))}
        </ol>
        <p className="mt-2 text-caption text-ink-muted-80">
          Step {position + 1} of {steps.length}. Each step saves when you continue.
        </p>
      </nav>

      {step === 'basics' && (
        <StepForm action={basicsAction} id={id} next={nextHref}>
          <SectionTitle>Basics</SectionTitle>
          <Field id="name" label="Event name">
            <input
              id="name"
              name="name"
              defaultValue={c.name}
              required
              maxLength={120}
              className={INPUT}
            />
          </Field>
          <Field id="description" label="Description" hint="Shown on the public page.">
            <textarea
              id="description"
              name="description"
              defaultValue={c.description ?? ''}
              rows={3}
              className={INPUT}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="venueName" label="Venue">
              <input
                id="venueName"
                name="venueName"
                defaultValue={event.venue?.name ?? ''}
                className={INPUT}
              />
            </Field>
            <Field id="venueAddress" label="Address">
              <input
                id="venueAddress"
                name="venueAddress"
                defaultValue={event.venue?.address ?? ''}
                className={INPUT}
              />
            </Field>
            <Field
              id="fee"
              label="Registration fee"
              hint="CourtSync records who paid. It never takes payment."
            >
              <input
                id="fee"
                name="fee"
                type="number"
                min={0}
                step="0.01"
                defaultValue={c.registrationFee ?? ''}
                className={INPUT}
              />
            </Field>
            <Field
              id="timeZone"
              label="Time zone"
              hint="Where the gym is. Every time on this event is local to it."
            >
              <input id="timeZone" name="timeZone" defaultValue={zone} required className={INPUT} />
            </Field>
          </div>
        </StepForm>
      )}

      {step === 'format' && (
        <StepForm action={formatAction} id={id} next={nextHref}>
          <SectionTitle>Format</SectionTitle>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field id="gameDurationMin" label="Match length (minutes)">
              <input
                id="gameDurationMin"
                name="gameDurationMin"
                type="number"
                min={5}
                max={240}
                defaultValue={c.gameDurationMin}
                className={INPUT}
              />
            </Field>
            <Field id="bufferMin" label="Between matches (minutes)">
              <input
                id="bufferMin"
                name="bufferMin"
                type="number"
                min={0}
                max={120}
                defaultValue={c.bufferMin}
                className={INPUT}
              />
            </Field>
            {format !== 'dropin' && (
              <Field
                id="minRestMin"
                label="Rest between a team’s matches (minutes)"
                hint="Converted to slots on your real grid."
              >
                <input
                  id="minRestMin"
                  name="minRestMin"
                  type="number"
                  min={0}
                  defaultValue={c.minRestMin ?? 0}
                  className={INPUT}
                />
              </Field>
            )}
          </div>
          {format === 'tournament' && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                id="poolCount"
                label="Pools"
                hint="Leave blank and CourtSync suggests a count that fits."
              >
                <input
                  id="poolCount"
                  name="poolCount"
                  type="number"
                  min={1}
                  max={12}
                  defaultValue={c.poolCount ?? ''}
                  className={INPUT}
                />
              </Field>
              <Field
                id="bracketTiers"
                label="Bracket tiers, one per line"
                hint="gold, then silver — best records play gold."
              >
                <textarea
                  id="bracketTiers"
                  name="bracketTiers"
                  rows={3}
                  defaultValue={(c.bracketTiers ?? ['gold']).join('\n')}
                  className={INPUT}
                />
              </Field>
            </div>
          )}
          {format === 'dropin' && (
            <div className="grid gap-4 sm:grid-cols-3">
              <Field id="capacity" label="Places per night">
                <input
                  id="capacity"
                  name="capacity"
                  type="number"
                  min={1}
                  defaultValue={c.capacity ?? ''}
                  className={INPUT}
                />
              </Field>
              <Field id="playersPerSide" label="Players per side">
                <input
                  id="playersPerSide"
                  name="playersPerSide"
                  type="number"
                  min={1}
                  max={12}
                  defaultValue={c.playersPerSide ?? 6}
                  className={INPUT}
                />
              </Field>
              <Field
                id="skillLabel"
                label="Level"
                hint="A label, like Intermediate — never a rating."
              >
                <input
                  id="skillLabel"
                  name="skillLabel"
                  defaultValue={c.skillLabel ?? ''}
                  className={INPUT}
                />
              </Field>
            </div>
          )}
          {format !== 'dropin' && (
            <>
              <fieldset className="flex flex-col gap-3">
                <legend className="text-caption-strong">Sets</legend>
                {(format === 'tournament'
                  ? (['pool', 'playoff'] as const)
                  : (['pool'] as const)
                ).map((phase: 'pool' | 'playoff') => {
                  const rules = setFormatsOf(event)[phase];
                  const rows = [
                    ...rules,
                    { target: '', winBy: '', cap: '' },
                    { target: '', winBy: '', cap: '' },
                  ];
                  return (
                    <div key={phase} className="rounded-lg border border-hairline p-4">
                      <p className="text-caption-strong">
                        {phase === 'pool'
                          ? format === 'league'
                            ? 'Every match'
                            : 'Pool play'
                          : 'Playoffs'}
                      </p>
                      <div className="mt-2 grid grid-cols-[auto_1fr_1fr_1fr] items-center gap-2 text-caption">
                        <span />
                        <span>To</span>
                        <span>Win by</span>
                        <span>Cap (blank = none)</span>
                        {rows.map((rule, i) => (
                          <div key={`${phase}-${i}`} className="contents">
                            <span>Set {i + 1}</span>
                            <input
                              aria-label={`${phase} set ${i + 1} target`}
                              name={`${phase}_target`}
                              type="number"
                              min={1}
                              defaultValue={rule.target}
                              className={INPUT}
                            />
                            <input
                              aria-label={`${phase} set ${i + 1} win by`}
                              name={`${phase}_winBy`}
                              type="number"
                              min={1}
                              defaultValue={rule.winBy}
                              className={INPUT}
                            />
                            <input
                              aria-label={`${phase} set ${i + 1} cap`}
                              name={`${phase}_cap`}
                              type="number"
                              min={1}
                              defaultValue={rule.cap ?? ''}
                              className={INPUT}
                            />
                          </div>
                        ))}
                      </div>
                      <p className="mt-2 text-caption text-ink-muted-80">
                        Clear a row to drop that set. Scores outside these rules are accepted with a
                        warning, never refused.
                      </p>
                    </div>
                  );
                })}
              </fieldset>
              <Field id="forfeitPolicy" label="What a forfeit counts for">
                <select
                  id="forfeitPolicy"
                  name="forfeitPolicy"
                  defaultValue={c.forfeitPolicy ?? 'setsOnly'}
                  className={INPUT}
                >
                  <option value="setsOnly">A win and the sets recorded, no points</option>
                  <option value="winOnly">
                    A win and nothing else — nobody gains a tiebreak edge
                  </option>
                  <option value="asScored">Everything as scored</option>
                </select>
              </Field>
              <fieldset className="flex flex-col gap-2">
                <legend className="text-caption-strong">Tiebreakers, in order</legend>
                <p className="text-caption text-ink-muted-80">
                  Untick one to skip it. Order is top to bottom; a full tie is always settled the
                  same way on every refresh.
                </p>
                {(c.tiebreakerOrder ?? TIEBREAKER_ORDER)
                  .concat(
                    TIEBREAKER_ORDER.filter(
                      (t) => !(c.tiebreakerOrder ?? TIEBREAKER_ORDER).includes(t),
                    ),
                  )
                  .map((t) => (
                    <label key={t} className="flex items-center gap-2 text-body">
                      <input
                        type="checkbox"
                        name="tiebreaker"
                        value={t}
                        defaultChecked={(c.tiebreakerOrder ?? TIEBREAKER_ORDER).includes(t)}
                      />
                      {TIEBREAKER_NAMES[t]}
                    </label>
                  ))}
              </fieldset>
            </>
          )}
          {format === 'dropin' && (
            <input type="hidden" name="forfeitPolicy" value={c.forfeitPolicy ?? 'setsOnly'} />
          )}
        </StepForm>
      )}

      {step === 'entries' && (
        <StepForm action={entriesAction} id={id} next={nextHref}>
          <SectionTitle
            note={
              format === 'dropin'
                ? 'Players join from the public page; add anyone here by name.'
                : 'List order is seeding order when seeds are blank.'
            }
          >
            {format === 'dropin' ? 'Players' : 'Teams'}
          </SectionTitle>
          <input type="hidden" name="kind" value={format === 'dropin' ? 'individual' : 'team'} />
          {event.participants.length > 0 && (
            <ul className="flex flex-col gap-3">
              {event.participants.map((p, i) => (
                <li key={p.id} className="rounded-lg border border-hairline p-4">
                  <input type="hidden" name="entry_id" value={p.id} />
                  <div className="grid gap-3 sm:grid-cols-[1fr_6rem_auto]">
                    <Field id={`n-${p.id}`} label={`Name ${i + 1}`}>
                      <input
                        id={`n-${p.id}`}
                        name="entry_name"
                        defaultValue={p.name}
                        required
                        className={INPUT}
                      />
                    </Field>
                    <Field id={`s-${p.id}`} label="Seed">
                      <input
                        id={`s-${p.id}`}
                        name="entry_seed"
                        type="number"
                        min={1}
                        defaultValue={p.seed ?? ''}
                        className={INPUT}
                      />
                    </Field>
                    <label className="flex items-end gap-2 pb-2 text-caption">
                      <input type="checkbox" name="entry_remove" value={p.id} /> Remove
                    </label>
                  </div>
                  {p.kind === 'team' ? (
                    <details className="mt-3">
                      <summary className="cursor-pointer text-caption text-primary">Roster</summary>
                      <textarea
                        aria-label={`Roster for ${p.name}, one name per line`}
                        name="entry_roster"
                        rows={4}
                        defaultValue={event.teamPlayers
                          .filter((tp) => tp.participantId === p.id)
                          .map((tp) => tp.name)
                          .join('\n')}
                        className={`${INPUT} mt-2`}
                      />
                    </details>
                  ) : (
                    <input type="hidden" name="entry_roster" value="" />
                  )}
                </li>
              ))}
            </ul>
          )}
          <Field
            id="newEntries"
            label={`Add ${format === 'dropin' ? 'players' : 'teams'}, one per line`}
          >
            <textarea id="newEntries" name="newEntries" rows={4} className={INPUT} />
          </Field>
        </StepForm>
      )}

      {step === 'courts' && (
        <div className="flex flex-col gap-10">
          <ActionForm action={courtsAction}>
            <input type="hidden" name="id" value={id} />
            <SectionTitle note="Out of service keeps a court on the list without scheduling on it.">
              Courts
            </SectionTitle>
            <ul className="flex flex-col gap-2">
              {event.courts.map((court) => (
                <li key={court.id} className="grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
                  <input type="hidden" name="court_id" value={court.id} />
                  <Field id={`c-${court.id}`} label="Court name">
                    <input
                      id={`c-${court.id}`}
                      name="court_name"
                      defaultValue={court.name}
                      required
                      className={INPUT}
                    />
                  </Field>
                  <label className="flex items-center gap-2 pb-2 text-caption">
                    <input
                      type="checkbox"
                      name="court_inactive"
                      value={court.id}
                      defaultChecked={!court.isActive}
                    />{' '}
                    Out of service
                  </label>
                  <label className="flex items-center gap-2 pb-2 text-caption">
                    <input type="checkbox" name="court_remove" value={court.id} /> Remove
                  </label>
                </li>
              ))}
            </ul>
            <Field id="newCourts" label="Add courts, one per line">
              <textarea id="newCourts" name="newCourts" rows={2} className={INPUT} />
            </Field>
            <div>
              <SubmitButton variant="secondary">Save courts</SubmitButton>
            </div>
          </ActionForm>

          <ActionForm action={sessionsAction}>
            <input type="hidden" name="id" value={id} />
            <SectionTitle
              note={`Times at the venue (${zone}). Slots are built from match length and the gap between.`}
            >
              {format === 'league' ? 'Weeks' : format === 'dropin' ? 'Nights' : 'Days of play'}
            </SectionTitle>
            <ul className="flex flex-col gap-3">
              {[
                ...event.sessions.map((s) => ({ key: s.id, ...s })),
                { key: 'new-1', name: '', playDate: '', startTime: '', endTime: '' },
              ].map((s, i) => (
                <li
                  key={s.key}
                  className="grid gap-3 rounded-lg border border-hairline p-4 sm:grid-cols-[1fr_1fr_1fr_1fr_auto] sm:items-end"
                >
                  <input type="hidden" name="session_id" value={s.key} />
                  <Field
                    id={`sn-${s.key}`}
                    label={s.key.startsWith('new-') ? 'Add: name (optional)' : `Name (optional)`}
                  >
                    <input
                      id={`sn-${s.key}`}
                      name="session_name"
                      defaultValue={s.name ?? ''}
                      className={INPUT}
                    />
                  </Field>
                  <Field id={`sd-${s.key}`} label="Date">
                    <input
                      id={`sd-${s.key}`}
                      name="session_date"
                      type="date"
                      defaultValue={s.playDate}
                      className={INPUT}
                    />
                  </Field>
                  <Field id={`ss-${s.key}`} label="Starts">
                    <input
                      id={`ss-${s.key}`}
                      name="session_start"
                      type="time"
                      defaultValue={s.startTime}
                      className={INPUT}
                    />
                  </Field>
                  <Field id={`se-${s.key}`} label="Ends">
                    <input
                      id={`se-${s.key}`}
                      name="session_end"
                      type="time"
                      defaultValue={s.endTime}
                      className={INPUT}
                    />
                  </Field>
                  {s.key.startsWith('new-') ? (
                    <span className="pb-2 text-caption text-ink-muted-80">New</span>
                  ) : (
                    <label className="flex items-center gap-2 pb-2 text-caption">
                      <input type="checkbox" name="session_remove" value={s.key} /> Remove
                    </label>
                  )}
                  {!s.key.startsWith('new-') && (
                    <p className="text-caption text-ink-muted-80 sm:col-span-5">
                      {event.timeslots.filter((t) => t.sessionId === s.key).length} slots
                      {i === 0 && format === 'tournament'
                        ? ' · pool play runs on the first day'
                        : ''}
                    </p>
                  )}
                </li>
              ))}
            </ul>
            <div>
              <SubmitButton variant="secondary">
                Save {format === 'league' ? 'weeks' : format === 'dropin' ? 'nights' : 'days'}
              </SubmitButton>
            </div>
          </ActionForm>

          {event.courts.length > 0 && event.sessions.length > 0 && (
            <ActionForm action={windowsAction}>
              <input type="hidden" name="id" value={id} />
              <SectionTitle note="“Court 3 is only ours until noon.” A court with no window is available all day.">
                Court availability
              </SectionTitle>
              <ul className="flex flex-col gap-2">
                {[
                  ...event.courtWindows.map((w) => ({
                    key: w.id,
                    courtId: w.courtId,
                    sessionId: w.sessionId,
                    start: instantToWallClock(w.startAt, zone).clock,
                    end: instantToWallClock(w.endAt, zone).clock,
                  })),
                  ...[1, 2].map((n) => ({
                    key: `new-${n}`,
                    courtId: '',
                    sessionId: '',
                    start: '',
                    end: '',
                  })),
                ].map((w) => (
                  <li key={w.key} className="grid gap-2 sm:grid-cols-4">
                    <select
                      aria-label="Court"
                      name="w_court"
                      defaultValue={w.courtId}
                      className={INPUT}
                    >
                      <option value="">Court…</option>
                      {event.courts.map((court) => (
                        <option key={court.id} value={court.id}>
                          {court.name}
                        </option>
                      ))}
                    </select>
                    <select
                      aria-label="Day"
                      name="w_session"
                      defaultValue={w.sessionId}
                      className={INPUT}
                    >
                      <option value="">Day…</option>
                      {event.sessions.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name ?? s.playDate}
                        </option>
                      ))}
                    </select>
                    <input
                      aria-label="Available from"
                      name="w_start"
                      type="time"
                      defaultValue={w.start}
                      className={INPUT}
                    />
                    <input
                      aria-label="Available until"
                      name="w_end"
                      type="time"
                      defaultValue={w.end}
                      className={INPUT}
                    />
                  </li>
                ))}
              </ul>
              <p className="text-caption text-ink-muted-80">Clear a row to remove that window.</p>
              <div>
                <SubmitButton variant="secondary">Save availability</SubmitButton>
              </div>
            </ActionForm>
          )}
          {nextHref && (
            <div>
              <Link
                href={nextHref}
                className="inline-flex rounded-full bg-primary px-[22px] py-[11px] text-body text-on-dark"
              >
                Continue
              </Link>
            </div>
          )}
        </div>
      )}

      {step === 'schedule' && (
        <div className="flex flex-col gap-6">
          <SectionTitle>Schedule</SectionTitle>
          <p className="max-w-2xl text-body">
            {format === 'tournament'
              ? 'Draws the pools (seeds spread across them), then round-robin pool play on the first day, spaced for rest and around court availability, with referees from the pools.'
              : 'One round a week across the season, every team once a week, around court availability. A cancelled week is skipped.'}{' '}
            Generating again never touches a match that has a score or is being played.
          </p>
          <div className="flex flex-wrap gap-3">
            <ActionButton
              action={generateAction}
              fields={{ id }}
              label={event.matches.length > 0 ? 'Regenerate' : 'Generate schedule'}
              variant="primary"
              pending="Generating…"
            />
            {format === 'tournament' && event.pools.length > 0 && (
              <ActionButton
                action={redrawAction}
                fields={{ id }}
                label="Clear and redraw pools"
                variant="danger"
              />
            )}
          </div>
          {event.pools.length > 0 && (
            <ul className="grid gap-3 sm:grid-cols-2">
              {event.pools.map((pool) => (
                <li key={pool.id} className="rounded-lg border border-hairline p-4">
                  <p className="text-body-strong">Pool {pool.name}</p>
                  <p className="text-caption text-ink-muted-80">
                    {pool.participantIds
                      .map((pid) => event.participants.find((p) => p.id === pid)?.name ?? '')
                      .join(', ')}
                  </p>
                </li>
              ))}
            </ul>
          )}
          {event.matches.length > 0 && (
            <p className="text-body">
              {event.matches.length} matches.{' '}
              <Link href={`/events/${id}/schedule`} className="text-primary">
                Open the schedule board
              </Link>
            </p>
          )}
          {nextHref && (
            <div>
              <Link
                href={nextHref}
                className="inline-flex rounded-full border border-primary px-[22px] py-[11px] text-body text-primary"
              >
                Continue to review
              </Link>
            </div>
          )}
        </div>
      )}

      {step === 'review' && (
        <div className="flex flex-col gap-6">
          <SectionTitle>Review</SectionTitle>
          <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-[12rem_1fr]">
            <dt className="text-caption-strong">Entries</dt>
            <dd>{event.participants.length}</dd>
            <dt className="text-caption-strong">Courts</dt>
            <dd>{event.courts.map((x) => x.name).join(', ') || 'None yet'}</dd>
            <dt className="text-caption-strong">
              {format === 'league' ? 'Weeks' : format === 'dropin' ? 'Nights' : 'Days'}
            </dt>
            <dd>{event.sessions.map((s) => s.playDate).join(', ') || 'None yet'}</dd>
            {format !== 'dropin' && (
              <>
                <dt className="text-caption-strong">Matches</dt>
                <dd>{event.matches.length}</dd>
              </>
            )}
          </dl>
          {(() => {
            const conflicts = auditOf(event);
            if (conflicts.length === 0)
              return <p className="text-body">The audit found nothing wrong.</p>;
            const blocking = conflicts.filter((x) => x.severity === 'blocking');
            return (
              <div className="flex flex-col gap-2">
                <Notice tone={blocking.length > 0 ? 'warning' : 'info'}>
                  {blocking.length} blocking, {conflicts.length - blocking.length} warning
                  {conflicts.length - blocking.length === 1 ? '' : 's'}.
                  {blocking.length > 0
                    ? ' You can still publish — you know things the schedule does not — but fix these first if you can.'
                    : ''}
                </Notice>
                <ul className="list-disc pl-6 text-caption">
                  {conflicts.slice(0, 20).map((conflict, i) => (
                    <li key={`${conflict.kind}-${i}`}>{describeConflict(conflict, event)}</li>
                  ))}
                </ul>
              </div>
            );
          })()}
          {(c.status ?? 'draft') === 'draft' ? (
            <ActionButton
              action={transitionAction}
              fields={{ id, transition: 'publish' }}
              label="Publish"
              variant="primary"
            />
          ) : (
            <p className="text-body">This event is {c.status}.</p>
          )}
        </div>
      )}
    </div>
  );
}
