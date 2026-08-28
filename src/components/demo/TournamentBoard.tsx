'use client';

import { useMemo, useState } from 'react';
import type { Match } from '@/lib/core';
import { setsWon } from '@/lib/core';
import type { TournamentDemoConfig, TournamentStage } from '@/lib/demo';
import {
  buildTournamentDemo,
  clockLabel,
  flipsQuery,
  nearestPoolCount,
  outcomesFromFlips,
  tournamentQuery,
  validPoolCounts,
  winnerSide,
} from '@/lib/demo';
import { ChoiceControl, NumberControl, OptionControl, ToggleControl } from './Controls';
import { BoardHeading, DemoNotice, Shortfall } from './DemoNotice';
import { ShareBar } from './ShareBar';
import { StandingsTable } from './StandingsTable';

/**
 * The tournament organizer's day, run through the real engine.
 *
 * Every number on this screen came out of `src/lib/scheduling`: the pools are
 * a snake draw, the grid is `generatePoolPlay` placing whole rounds across
 * the day, the referee on each match is `assignReferees` picking the
 * least-loaded eligible team, the tables are `computeStandings` recomputing
 * from scratch, and the bracket is `seedBrackets` followed by
 * `advanceBracket` after every round.
 *
 * The interaction that matters is clicking a played match to turn its result
 * around. That is not a toy: correcting a score ten minutes after entering it
 * is the single most common thing that happens at a real event, and audit
 * finding H14 was a bracket that kept whoever had been written into the
 * semifinal first. Here the entire day downstream of the click is rebuilt,
 * because that is what advancement being recomputed rather than recorded
 * actually buys.
 */

const STAGE_CHOICES: ReadonlyArray<{ value: TournamentStage; label: string }> = [
  { value: 'draw', label: 'Drawn' },
  { value: 'pools', label: 'Pools played' },
  { value: 'quarters', label: 'Quarters' },
  { value: 'semis', label: 'Semis' },
  { value: 'final', label: 'Final' },
];

/**
 * Tier names come from `BRACKET_TIERS` in core; these are their headings.
 * More than one tier is what stops half the field going home after pool play,
 * and `seedBrackets` has always taken a tier list — the demo just never asked
 * for one.
 */
const TIER_LABELS: Record<string, string> = {
  gold: 'Gold bracket',
  silver: 'Silver bracket',
  bronze: 'Bronze bracket',
};

const SLOT_LABELS: Record<string, string> = {
  q1: 'Quarterfinal 1',
  q2: 'Quarterfinal 2',
  q3: 'Quarterfinal 3',
  q4: 'Quarterfinal 4',
  s1: 'Semifinal 1',
  s2: 'Semifinal 2',
  final: 'Final',
  consolation: 'Third place',
};

function scoreLine(match: Match): string {
  return match.sets.map((set) => `${set.homePoints}–${set.awayPoints}`).join(', ');
}

/**
 * One match, as a button when there is a result to turn around.
 *
 * A match nobody has played yet is not clickable: there is no result to
 * correct, and offering the gesture would imply the demo decides outcomes
 * rather than the stage control deciding what has happened so far.
 */
function MatchCard({
  match,
  nameOf,
  onFlip,
  flipped,
  kind,
  splitByPoints,
}: {
  match: Match;
  nameOf: Record<string, string>;
  onFlip?: (matchId: string) => void;
  flipped?: boolean;
  kind: 'pool' | 'playoff';
  /** The rule the standings are being computed under. */
  splitByPoints: boolean;
}) {
  const home = match.homeParticipantId ? nameOf[match.homeParticipantId] : null;
  const away = match.awayParticipantId ? nameOf[match.awayParticipantId] : null;
  const played = match.status === 'final';
  const sets = setsWon(match);
  // Not `sets.home > sets.away`: a 1-1 pool match is decided on total points,
  // and bolding on sets alone would leave it looking undecided here while the
  // standings above it had already awarded the win.
  //
  // This has to follow the *configured* rule, not the format. With the rule
  // switched off the table counts a split for neither side, and a card still
  // bolding a winner would be the same two-different-stories problem in the
  // other direction.
  const decidesSplits = kind === 'pool' && splitByPoints;
  const winner = played ? winnerSide(match, decidesSplits) : null;
  const split = played && sets.home === sets.away;

  const body = (
    <>
      <div className="flex items-baseline justify-between gap-2">
        <span
          className={winner === 'home' ? 'text-caption-strong text-ink' : 'text-caption text-ink'}
        >
          {home ?? '—'}
        </span>
        {played && <span className="text-micro-legal text-ink-muted-80">{sets.home}</span>}
      </div>
      <div className="flex items-baseline justify-between gap-2">
        <span
          className={winner === 'away' ? 'text-caption-strong text-ink' : 'text-caption text-ink'}
        >
          {away ?? (home ? 'bye' : '—')}
        </span>
        {played && <span className="text-micro-legal text-ink-muted-80">{sets.away}</span>}
      </div>
      {played && (
        <p className="mt-1 text-micro-legal text-ink-muted-80">
          {scoreLine(match)}
          {split && (decidesSplits ? ' · split, decided on total points' : ' · split, undecided')}
        </p>
      )}
      {match.refParticipantId && (
        <p className="mt-1 text-micro-legal text-ink-muted-80">
          ref {nameOf[match.refParticipantId] ?? match.refParticipantId}
        </p>
      )}
      {flipped && <p className="mt-1 text-micro-legal text-primary">corrected</p>}
    </>
  );

  const shell = 'w-full rounded-sm border p-2.5 text-left';

  if (!played || !onFlip) {
    return <div className={`${shell} border-hairline bg-canvas`}>{body}</div>;
  }

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

export function TournamentBoard({
  initialConfig,
  initialFlips,
}: {
  initialConfig: TournamentDemoConfig;
  initialFlips: string[];
}) {
  const [config, setConfig] = useState(initialConfig);
  const [flips, setFlips] = useState<string[]>(initialFlips);

  const demo = useMemo(
    () => buildTournamentDemo(config, outcomesFromFlips(flips)),
    [config, flips],
  );

  const query = [tournamentQuery(config), flipsQuery(flips)].filter(Boolean).join('&');
  const flipped = new Set(flips);
  const toggleFlip = (matchId: string) =>
    setFlips((previous) =>
      previous.includes(matchId) ? previous.filter((id) => id !== matchId) : [...previous, matchId],
    );

  /** Changing the field can invalidate the pool count, so re-snap it here too. */
  const setTeams = (teams: number) =>
    setConfig((previous) => ({
      ...previous,
      teams,
      pools: nearestPoolCount(teams, previous.pools),
    }));

  // Sorted on the timestamp, never on the label beside it. Audit finding C4
  // was a 12-hour display string used as a sort key, which put a tournament's
  // final above its opening match.
  const timeslots = [...demo.timeslots].sort((a, b) => (a.startAt < b.startAt ? -1 : 1));
  const byCell = new Map<string, Match>();
  for (const match of demo.poolMatches) {
    if (match.courtId && match.timeslotId)
      byCell.set(`${match.timeslotId}|${match.courtId}`, match);
  }

  const bracketColumns: ReadonlyArray<readonly string[]> = [
    ['q1', 'q2', 'q3', 'q4'],
    ['s1', 's2'],
    ['final', 'consolation'],
  ];

  return (
    <div className="flex flex-col gap-10">
      <DemoNotice />

      <ControlsSection
        config={config}
        setConfig={setConfig}
        setTeams={setTeams}
        flips={flips}
        onReset={() => setFlips([])}
      />

      <ShareBar
        query={query}
        data={demo}
        note="The link carries everything on screen, corrections included."
      />

      {/* min-w-0 on both this section and the scroller below is load-bearing.
          A flex child defaults to `min-width: auto`, so without it the
          overflow container grows to fit the 560px grid instead of scrolling
          it, and the whole page scrolls sideways on a phone. */}
      <section className="flex min-w-0 flex-col gap-4">
        <BoardHeading
          note={`${demo.poolMatches.length} matches · ${demo.pools.length} pools · ${demo.courts.length} courts`}
        >
          The day
        </BoardHeading>

        {demo.unassignedMatchIds.length > 0 && (
          <Shortfall>
            {demo.unassignedMatchIds.length} of {demo.poolMatches.length} matches have nowhere to go
            — the day is {config.slots} slots long and this field needs more. The engine reports
            them rather than dropping them; add slots or courts above.
          </Shortfall>
        )}

        {/* The engine returns these and the board has to show them. Running
            every court at once means nobody is free to officiate, and an
            organizer finds that out at 9am if the screen quietly leaves the
            referee line off instead of saying so. */}
        {demo.unrefereedMatchIds.length > 0 && (
          <Shortfall>
            {demo.unrefereedMatchIds.length} of {demo.poolMatches.length} matches have no referee.
            With {demo.courts.length} courts running at once there is nobody left who is not playing
            — a referee is never assigned to a team that is on court at the same time. Drop a court,
            or plan to bring officials.
          </Shortfall>
        )}

        <div className="min-w-0 overflow-x-auto">
          {/* Fixed layout, and a width that grows with the court count rather
              than filling the tile. `w-full` on a three-court day put each
              score an inch away from the team it belonged to; content-sized
              columns instead came out uneven, because a match that went to a
              set split carries a longer line than one that did not. The
              number of courts is the only thing that should widen this. */}
          <table
            className="min-w-[560px] table-fixed border-separate border-spacing-1"
            style={{ width: `${64 + demo.courts.length * 210}px`, maxWidth: '100%' }}
          >
            <thead>
              <tr>
                <th className="w-16" />
                {demo.courts.map((court) => (
                  <th
                    key={court.id}
                    scope="col"
                    className="text-left text-micro-legal text-ink-muted-80 font-normal"
                  >
                    {court.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {timeslots.map((slot) => (
                <tr key={slot.id}>
                  <th
                    scope="row"
                    className="pr-2 text-right align-top text-micro-legal text-ink-muted-80 font-normal"
                  >
                    {clockLabel(slot.startAt)}
                  </th>
                  {demo.courts.map((court) => {
                    const match = byCell.get(`${slot.id}|${court.id}`);
                    return (
                      <td key={court.id} className="align-top">
                        {match ? (
                          <MatchCard
                            match={match}
                            nameOf={demo.nameOf}
                            onFlip={toggleFlip}
                            flipped={flipped.has(match.id)}
                            kind="pool"
                            splitByPoints={config.splitByPoints}
                          />
                        ) : (
                          <div className="h-full min-h-[46px] rounded-sm border border-hairline border-dashed" />
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="flex min-w-0 flex-col gap-4">
        <BoardHeading note="computed from the matches above, on every render">
          Pool standings
        </BoardHeading>
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {demo.pools.map((pool) => (
            // min-w-0: a grid item also defaults to `min-width: auto`, so
            // without it this track sizes to the standings table's 420px and
            // the page scrolls sideways on a phone rather than the table
            // scrolling inside its own container.
            <div key={pool.id} className="min-w-0">
              <h3 className="mb-2 text-caption-strong text-ink">Pool {pool.name}</h3>
              <StandingsTable standings={demo.standingsByPool[pool.id] ?? []} />
            </div>
          ))}
        </div>
      </section>

      {demo.brackets.length === 0 && demo.config.stage === 'draw' && (
        <section className="flex min-w-0 flex-col gap-4">
          <BoardHeading note="seeding reads records, never the entry list">Brackets</BoardHeading>
          <p className="text-caption text-ink-muted-80">
            Nothing to seed yet — a bracket drawn before the pools are played would be a guess. Play
            the pools above.
          </p>
        </section>
      )}

      {demo.brackets.map((bracket) => (
        <section key={bracket.tier} className="flex min-w-0 flex-col gap-4">
          <BoardHeading
            note={
              bracket.champion
                ? `${bracket.champion.name} takes it`
                : 'seeded across pools, byes on the top seeds'
            }
          >
            {TIER_LABELS[bracket.tier] ?? bracket.tier}
          </BoardHeading>

          <div className="grid gap-4 sm:grid-cols-3">
            {bracketColumns.map((column, index) => (
              <div key={column.join()} className="flex flex-col gap-3">
                <p className="text-micro-legal text-ink-muted-80">
                  {['Quarterfinals', 'Semifinals', 'Final'][index]}
                </p>
                {column.map((slot) => {
                  const match = bracket.matches.find((m) => m.roundLabel === slot);
                  if (!match) return null;
                  return (
                    <div key={slot}>
                      <p className="mb-1 text-micro-legal text-ink-muted-80">
                        {SLOT_LABELS[slot] ?? slot}
                      </p>
                      <MatchCard
                        match={match}
                        nameOf={demo.nameOf}
                        onFlip={toggleFlip}
                        flipped={flipped.has(match.id)}
                        kind="playoff"
                        splitByPoints={config.splitByPoints}
                      />
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </section>
      ))}

      {/* Asking for three tiers and getting two is the engine declining to
          draw a bracket with nobody in it, not a failure. Say so, or the
          missing section reads as something broken. */}
      {demo.brackets.length > 0 && demo.brackets.length < demo.config.tiers && (
        <p className="text-caption text-ink-muted-80">
          {demo.config.tiers} tiers asked for, {demo.brackets.length} drawn — each tier takes eight
          qualifiers, and {demo.participants.length} teams do not fill another. Add teams above.
        </p>
      )}
    </div>
  );
}

function ControlsSection({
  config,
  setConfig,
  setTeams,
  flips,
  onReset,
}: {
  config: TournamentDemoConfig;
  setConfig: React.Dispatch<React.SetStateAction<TournamentDemoConfig>>;
  setTeams: (teams: number) => void;
  flips: string[];
  onReset: () => void;
}) {
  return (
    <div className="rounded-lg border border-hairline bg-canvas p-6">
      <div className="flex flex-wrap items-end gap-x-6 gap-y-4">
        <NumberControl label="Teams" value={config.teams} min={6} max={24} onChange={setTeams} />
        <OptionControl
          label="Pools"
          value={config.pools}
          options={validPoolCounts(config.teams)}
          onChange={(pools) => setConfig((previous) => ({ ...previous, pools }))}
        />
        <NumberControl
          label="Courts"
          value={config.courts}
          min={1}
          max={8}
          onChange={(courts) => setConfig((previous) => ({ ...previous, courts }))}
        />
        <NumberControl
          label="Timeslots"
          value={config.slots}
          min={2}
          max={24}
          onChange={(slots) => setConfig((previous) => ({ ...previous, slots }))}
        />
        <NumberControl
          label="Rest between rounds (slots)"
          value={config.rest}
          min={0}
          max={3}
          onChange={(rest) => setConfig((previous) => ({ ...previous, rest }))}
        />
        <NumberControl
          label="Bracket tiers"
          value={config.tiers}
          min={1}
          max={3}
          onChange={(tiers) => setConfig((previous) => ({ ...previous, tiers }))}
        />
        <ChoiceControl
          label="How far the day has got"
          value={config.stage}
          choices={STAGE_CHOICES}
          onChange={(stage) => setConfig((previous) => ({ ...previous, stage }))}
        />
        <ToggleControl
          label="1–1 decided on total points"
          checked={config.splitByPoints}
          onChange={(splitByPoints) => setConfig((previous) => ({ ...previous, splitByPoints }))}
        />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <p className="text-caption text-ink-muted-80">
          Click any played match to turn its result around — the standings and everything downstream
          in the bracket are recomputed, not patched.
        </p>
        {flips.length > 0 && (
          <button
            type="button"
            onClick={onReset}
            className="rounded-sm border border-hairline px-3 py-1.5 text-button-utility text-ink-muted-80 transition-transform duration-150 active:scale-95"
          >
            Undo {flips.length} correction{flips.length === 1 ? '' : 's'}
          </button>
        )}
      </div>
    </div>
  );
}
