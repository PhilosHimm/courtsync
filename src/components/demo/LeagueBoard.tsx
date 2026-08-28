'use client';

import { useMemo, useState } from 'react';
import type { Match } from '@/lib/core';
import { setsWon } from '@/lib/core';
import type { LeagueDemoConfig } from '@/lib/demo';
import {
  buildLeagueDemo,
  clockLabel,
  flipsQuery,
  leagueQuery,
  outcomesFromFlips,
  winnerSide,
} from '@/lib/demo';
import { ChoiceControl, NumberControl } from './Controls';
import { BoardHeading, DemoNotice, Shortfall } from './DemoNotice';
import { ShareBar } from './ShareBar';
import { StandingsTable } from './StandingsTable';

/**
 * A season, one week at a time.
 *
 * The convener's question is never "what does the schedule look like" — it is
 * "is the table right, today, halfway through". So the control that matters
 * here is how many weeks have been played: everything before it has results,
 * everything after is still to come, and the table is recomputed from
 * whatever that leaves. There is no season table being maintained.
 *
 * Each week has its own grid of timeslots, which is the whole reason `Session`
 * exists rather than the schedule hanging off the competition. Week 3 filling
 * up does not touch week 4.
 */

function scoreLine(match: Match): string {
  return match.sets.map((set) => `${set.homePoints}–${set.awayPoints}`).join(', ');
}

function Fixture({
  match,
  nameOf,
  timeLabel,
  onFlip,
  flipped,
}: {
  match: Match;
  nameOf: Record<string, string>;
  timeLabel: string | null;
  onFlip: (matchId: string) => void;
  flipped: boolean;
}) {
  const home = match.homeParticipantId ? nameOf[match.homeParticipantId] : '—';
  const away = match.awayParticipantId ? nameOf[match.awayParticipantId] : '—';
  const played = match.status === 'final';
  const sets = setsWon(match);
  // A 1-1 split goes to whoever scored more across both sets, which is what
  // the table above already did with it. Bolding on sets alone would show it
  // as undecided here and decided there.
  const winner = played ? winnerSide(match) : null;
  const split = played && sets.home === sets.away;

  const body = (
    <>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-caption text-ink">
          <span className={winner === 'home' ? 'text-caption-strong' : ''}>{home}</span>
          <span className="text-ink-muted-80"> v </span>
          <span className={winner === 'away' ? 'text-caption-strong' : ''}>{away}</span>
        </span>
        <span className="shrink-0 text-micro-legal text-ink-muted-80">
          {timeLabel ?? 'unscheduled'}
        </span>
      </div>
      {played && (
        <p className="mt-1 text-micro-legal text-ink-muted-80">
          {scoreLine(match)}
          {split && ' · split, decided on total points'}
        </p>
      )}
      {flipped && <p className="mt-1 text-micro-legal text-primary">corrected</p>}
    </>
  );

  const shell = 'w-full rounded-sm border p-2.5 text-left';
  if (!played) return <div className={`${shell} border-hairline bg-canvas`}>{body}</div>;

  return (
    <button
      type="button"
      onClick={() => onFlip(match.id)}
      title="Turn this result around"
      className={`${shell} transition-transform duration-150 active:scale-95 ${
        flipped ? 'border-primary bg-canvas' : 'border-hairline bg-canvas'
      }`}
    >
      {body}
    </button>
  );
}

export function LeagueBoard({
  initialConfig,
  initialFlips,
}: {
  initialConfig: LeagueDemoConfig;
  initialFlips: string[];
}) {
  const [config, setConfig] = useState(initialConfig);
  const [flips, setFlips] = useState<string[]>(initialFlips);

  const demo = useMemo(() => buildLeagueDemo(config, outcomesFromFlips(flips)), [config, flips]);

  const query = [leagueQuery(config), flipsQuery(flips)].filter(Boolean).join('&');
  const flipped = new Set(flips);
  const toggleFlip = (matchId: string) =>
    setFlips((previous) =>
      previous.includes(matchId) ? previous.filter((id) => id !== matchId) : [...previous, matchId],
    );

  /** Shortening the season cannot leave more weeks played than exist. */
  const setWeeks = (weeks: number) =>
    setConfig((previous) => ({ ...previous, weeks, played: Math.min(previous.played, weeks) }));

  const fixturesBySession = new Map<string, Match[]>();
  for (const fixture of demo.fixtures) {
    const list = fixturesBySession.get(fixture.sessionId) ?? [];
    list.push(fixture);
    fixturesBySession.set(fixture.sessionId, list);
  }

  const timeOf = new Map<string, string>();
  for (const slots of Object.values(demo.timeslotsBySession)) {
    for (const slot of slots) timeOf.set(slot.id, clockLabel(slot.startAt));
  }

  return (
    <div className="flex flex-col gap-10">
      <DemoNotice />

      <div className="rounded-lg border border-hairline bg-canvas p-6">
        <div className="flex flex-wrap items-end gap-x-6 gap-y-4">
          <NumberControl
            label="Teams"
            value={config.teams}
            min={4}
            max={16}
            onChange={(teams) => setConfig((previous) => ({ ...previous, teams }))}
          />
          <NumberControl label="Weeks" value={config.weeks} min={2} max={20} onChange={setWeeks} />
          <NumberControl
            label="Courts"
            value={config.courts}
            min={1}
            max={4}
            onChange={(courts) => setConfig((previous) => ({ ...previous, courts }))}
          />
          <NumberControl
            label="Slots each week"
            value={config.slotsPerWeek}
            min={1}
            max={4}
            onChange={(slotsPerWeek) => setConfig((previous) => ({ ...previous, slotsPerWeek }))}
          />
          <ChoiceControl
            label="Season shape"
            value={String(config.legs)}
            choices={[
              { value: '1', label: 'Single' },
              { value: '2', label: 'Home and away' },
            ]}
            onChange={(legs) =>
              setConfig((previous) => ({ ...previous, legs: Number.parseInt(legs, 10) }))
            }
          />
          <NumberControl
            label="Weeks played"
            value={config.played}
            min={0}
            max={config.weeks}
            onChange={(played) => setConfig((previous) => ({ ...previous, played }))}
          />
        </div>
        <p className="mt-4 text-caption text-ink-muted-80">
          Slide the weeks played and watch the table follow. It is recomputed from the results every
          time — there is no standings row anywhere to fall out of date.
        </p>
      </div>

      <ShareBar
        query={query}
        data={demo}
        note="The link carries everything on screen, corrections included."
      />

      <section className="flex min-w-0 flex-col gap-4">
        <BoardHeading
          note={`${demo.fixtures.length} fixtures across ${demo.sessions.length} weeks`}
        >
          The table
        </BoardHeading>
        <StandingsTable standings={demo.standings} />
      </section>

      <section className="flex min-w-0 flex-col gap-4">
        <BoardHeading note="each week gets its own independent grid">Fixtures</BoardHeading>

        {demo.unscheduled.length > 0 && (
          <Shortfall>
            {demo.unscheduled.length} fixtures have no court and no time. {config.courts} court
            {config.courts === 1 ? '' : 's'} across {config.slotsPerWeek} slot
            {config.slotsPerWeek === 1 ? '' : 's'} holds {config.courts * config.slotsPerWeek} a
            week, and this season needs more than that. A fixture with a court but no time would
            just be confusing, so the engine assigns both or neither.
          </Shortfall>
        )}

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {demo.sessions.map((session) => {
            const fixtures = fixturesBySession.get(session.id) ?? [];
            const played = (session.sequence ?? 0) <= demo.playedWeeks;
            return (
              <div key={session.id} className="flex flex-col gap-2">
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="text-caption-strong text-ink">{session.name}</h3>
                  <span className="text-micro-legal text-ink-muted-80">
                    {played ? session.playDate : `${session.playDate} · to play`}
                  </span>
                </div>
                {fixtures.length === 0 ? (
                  <p className="text-micro-legal text-ink-muted-80">Bye week.</p>
                ) : (
                  fixtures.map((fixture) => (
                    <Fixture
                      key={fixture.id}
                      match={fixture}
                      nameOf={demo.nameOf}
                      timeLabel={
                        fixture.timeslotId ? (timeOf.get(fixture.timeslotId) ?? null) : null
                      }
                      onFlip={toggleFlip}
                      flipped={flipped.has(fixture.id)}
                    />
                  ))
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
