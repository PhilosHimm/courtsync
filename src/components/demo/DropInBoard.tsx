'use client';

import { useMemo, useState } from 'react';
import type { DropInDemoConfig } from '@/lib/demo';
import { buildDropInDemo, clockLabel, dropInQuery } from '@/lib/demo';
import { NumberControl, ToggleControl } from './Controls';
import { BoardHeading, DemoNotice, Shortfall } from './DemoNotice';
import { ShareBar } from './ShareBar';

/**
 * A drop-in night, from the door to the court.
 *
 * The host is standing on a sideline holding a phone between rallies, so this
 * board is ordered the way the night is: who is in, who is waiting, who did
 * not turn up, and then who is on which court right now. Schedule generation
 * is the least of it — the capacity and the waitlist are the job.
 *
 * `promoteFromWaitlist` fills freed places strictly in arrival order and
 * renumbers what remains, because a waitlist with a hole in it is a waitlist
 * nobody trusts. A promoted player is `registered`, not `checked_in`, and the
 * rotation leaves them off court until the host says they walked in — the
 * toggle below is that moment.
 */

function Pill({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-sm border border-hairline bg-canvas px-3 py-2">
      <p className="text-caption-strong text-ink">{value}</p>
      <p className="text-micro-legal text-ink-muted-80">{label}</p>
    </div>
  );
}

function Side({ names }: { names: string[] }) {
  return (
    <div className="flex flex-wrap gap-1">
      {names.map((name) => (
        <span
          key={name}
          className="rounded-full border border-hairline px-2 py-0.5 text-micro-legal text-ink"
        >
          {name}
        </span>
      ))}
    </div>
  );
}

export function DropInBoard({ initialConfig }: { initialConfig: DropInDemoConfig }) {
  const [config, setConfig] = useState(initialConfig);
  const demo = useMemo(() => buildDropInDemo(config), [config]);

  const query = dropInQuery(config);
  const name = (id: string) => demo.nameOf[id] ?? id;

  const checkedIn = demo.attendance.filter((entry) => entry.status === 'checked_in');
  const waiting = demo.attendance
    .filter((entry) => entry.status === 'waitlist')
    .sort((a, b) => (a.waitlistPos ?? 0) - (b.waitlistPos ?? 0));
  const noShows = demo.attendance.filter((entry) => entry.status === 'no_show');
  const awaitingArrival = demo.attendance.filter((entry) => entry.status === 'registered');

  const perMatch = config.playersPerSide * 2;
  const concurrent = Math.min(config.courts, Math.floor(checkedIn.length / perMatch));

  // Capacity is what caps the no-show control: nobody on the waitlist ever had
  // a place to fail to turn up for.
  const maxNoShows = Math.min(config.registered, config.capacity);
  const setNumber = (key: keyof DropInDemoConfig) => (value: number) =>
    setConfig((previous) => {
      const next = { ...previous, [key]: value };
      return { ...next, noShows: Math.min(next.noShows, Math.min(next.registered, next.capacity)) };
    });

  const sitOuts = Object.entries(demo.sitOutCounts).sort(([a], [b]) => (a < b ? -1 : 1));
  const sitOutValues = sitOuts.map(([, count]) => count);
  const spread =
    sitOutValues.length === 0 ? 0 : Math.max(...sitOutValues) - Math.min(...sitOutValues);
  const everybodyPlays = sitOutValues.length > 0 && sitOutValues.every((count) => count === 0);

  return (
    <div className="flex flex-col gap-10">
      <DemoNotice />

      <div className="rounded-lg border border-hairline bg-canvas p-6">
        <div className="flex flex-wrap items-end gap-x-6 gap-y-4">
          <NumberControl
            label="Signed up"
            value={config.registered}
            min={4}
            max={40}
            onChange={setNumber('registered')}
          />
          <NumberControl
            label="Capacity"
            value={config.capacity}
            min={4}
            max={40}
            onChange={setNumber('capacity')}
          />
          <NumberControl
            label="No-shows"
            value={config.noShows}
            min={0}
            max={maxNoShows}
            onChange={setNumber('noShows')}
          />
          <NumberControl
            label="Players a side"
            value={config.playersPerSide}
            min={2}
            max={6}
            onChange={setNumber('playersPerSide')}
          />
          <NumberControl
            label="Courts"
            value={config.courts}
            min={1}
            max={4}
            onChange={setNumber('courts')}
          />
          <NumberControl
            label="Rounds"
            value={config.rounds}
            min={1}
            max={8}
            onChange={setNumber('rounds')}
          />
          <ToggleControl
            label="Promoted players have arrived"
            checked={config.checkInPromoted}
            onChange={(checkInPromoted) =>
              setConfig((previous) => ({ ...previous, checkInPromoted }))
            }
          />
        </div>
        <p className="mt-4 text-caption text-ink-muted-80">
          Raise the no-shows and watch places open up. Whoever is first on the waitlist gets each
          one, in arrival order, and the rest of the list renumbers behind them.
        </p>
      </div>

      <ShareBar query={query} data={demo} />

      <section className="flex min-w-0 flex-col gap-4">
        <BoardHeading note={`capacity ${config.capacity}`}>The door</BoardHeading>

        <div className="flex flex-wrap gap-3">
          <Pill label="in the gym" value={checkedIn.length} />
          <Pill label="promoted, not arrived" value={awaitingArrival.length} />
          <Pill label="no-show" value={noShows.length} />
          <Pill label="still waiting" value={waiting.length} />
        </div>

        {demo.promoted.length > 0 && (
          <div className="rounded-sm border border-hairline bg-parchment px-4 py-3">
            <p className="text-caption text-ink">
              {demo.promoted.length} place{demo.promoted.length === 1 ? '' : 's'} opened up.{' '}
              {demo.promoted.map((promotion) => name(promotion.participantId)).join(', ')} promoted
              off the waitlist, in the order they signed up.
            </p>
            {!config.checkInPromoted && (
              <p className="mt-1 text-micro-legal text-ink-muted-80">
                Off court until they actually walk in — being told a place opened up is not the same
                as being in the gym.
              </p>
            )}
          </div>
        )}

        {waiting.length > 0 && (
          <div>
            <p className="mb-2 text-micro-legal text-ink-muted-80">
              Waitlist, renumbered from 1 with no gaps
            </p>
            <div className="flex flex-wrap gap-1">
              {waiting.map((entry) => (
                <span
                  key={entry.id}
                  className="rounded-full border border-hairline px-2 py-0.5 text-micro-legal text-ink"
                >
                  {entry.waitlistPos}. {name(entry.participantId)}
                </span>
              ))}
            </div>
          </div>
        )}
      </section>

      <section className="flex min-w-0 flex-col gap-4">
        <BoardHeading
          note={`${config.playersPerSide} a side · ${concurrent} court${concurrent === 1 ? '' : 's'} in play`}
        >
          The rotation
        </BoardHeading>

        {concurrent === 0 && (
          <Shortfall>
            {checkedIn.length} people in the gym is not enough for one {config.playersPerSide}
            -a-side match, which needs {perMatch}. Nobody is put on a short-handed court; everyone
            sits.
          </Shortfall>
        )}

        <div className="flex flex-col gap-5">
          {demo.timeslots.map((slot) => {
            const matches = demo.rotation.matches.filter((m) => m.timeslotId === slot.id);
            const sitting = demo.rotation.sittingOut[slot.id] ?? [];
            return (
              <div key={slot.id} className="rounded-lg border border-hairline bg-canvas p-4">
                <p className="mb-3 text-micro-legal text-ink-muted-80">
                  {clockLabel(slot.startAt)}
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {matches.map((match) => {
                    const sides = demo.rotation.sides.find((s) => s.matchId === match.id);
                    const court = demo.courts.find((c) => c.id === match.courtId);
                    return (
                      <div key={match.id} className="rounded-sm border border-hairline p-3">
                        <p className="mb-2 text-micro-legal text-ink-muted-80">
                          {court?.name ?? 'Court'}
                        </p>
                        <Side names={(sides?.home.participantIds ?? []).map(name)} />
                        <p className="my-1 text-micro-legal text-ink-muted-80">v</p>
                        <Side names={(sides?.away.participantIds ?? []).map(name)} />
                      </div>
                    );
                  })}
                </div>
                {sitting.length > 0 && (
                  <p className="mt-3 text-micro-legal text-ink-muted-80">
                    Sitting out — {sitting.map(name).join(', ')}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {sitOuts.length > 0 && (
        <section className="flex min-w-0 flex-col gap-4">
          <BoardHeading
            note={
              everybodyPlays
                ? 'the gym divides exactly into the courts available'
                : spread <= 1
                  ? 'nobody has sat out more than one round longer than anyone else'
                  : `spread of ${spread} rounds`
            }
          >
            Who sat out, and how often
          </BoardHeading>
          <p className="text-caption text-ink-muted-80">
            Whoever sits goes to the front of the queue for the next round. Sides are reshuffled by
            an offset that is deliberately not a whole side, because rotating by a whole side just
            relabels the same groups and everyone plays the same teammates all night.
          </p>
          {/* A list of everyone at zero is noise, not evidence. Say the one
              fact instead — and it is worth saying, because "nobody sits" is
              the outcome a host is actually hoping for. */}
          {everybodyPlays ? (
            <p className="text-caption text-ink">
              Nobody sat out. {checkedIn.length} in the gym fills {concurrent} court
              {concurrent === 1 ? '' : 's'} exactly, every round.
            </p>
          ) : (
            <div className="flex flex-wrap gap-1">
              {sitOuts.map(([id, count]) => (
                <span
                  key={id}
                  className="rounded-full border border-hairline px-2 py-0.5 text-micro-legal text-ink"
                >
                  {name(id)} · {count}
                </span>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
