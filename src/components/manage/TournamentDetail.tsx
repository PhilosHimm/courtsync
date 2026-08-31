'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Match } from '@/lib/core';
import type { MatchKind, TournamentSetup } from '@/lib/manage';
import { buildResult, buildTournamentView, clockLabel } from '@/lib/manage';
import type { StoredSetScore, StoredTournament } from '@/lib/storage';
import { TextLink } from '@/components/Button';
import { StandingsTable } from '@/components/demo/StandingsTable';
import { MatchCard, ScoreEditor } from './MatchScoring';
import { TournamentForm } from './SetupForms';
import { useStorage } from './StorageProvider';
import { Callout, GhostButton, LocalDataNotice, SectionHeading, nowIso } from './ui';

/**
 * One tournament, run for real: the organizer's own teams, the engine's
 * schedule, and scores that persist in this browser.
 *
 * Every number on screen is recomputed from the stored setup and results on
 * every render — the pools are a snake draw, the grid is `generatePoolPlay`,
 * the referees are `assignReferees`, the tables are `computeStandings`, and
 * the bracket is `seedBrackets` + `advanceBracket`. Correcting a score
 * rebuilds everything downstream, which is the point.
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

const BRACKET_COLUMNS: ReadonlyArray<readonly string[]> = [
  ['q1', 'q2', 'q3', 'q4'],
  ['s1', 's2'],
  ['final', 'consolation'],
];

interface Selection {
  matchId: string;
  kind: MatchKind;
}

export function TournamentDetail({ id }: { id: string }) {
  const storage = useStorage();
  const [stored, setStored] = useState<StoredTournament | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [selected, setSelected] = useState<Selection | null>(null);

  useEffect(() => {
    void storage.getTournament(id).then((record) => {
      setStored(record);
      setLoaded(true);
    });
  }, [storage, id]);

  const view = useMemo(() => (stored ? buildTournamentView(stored) : null), [stored]);

  if (!loaded) return <p className="text-body text-ink-muted-80">Loading…</p>;
  if (!stored || !view) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-body text-ink">
          No tournament with this id in this browser's saved data.
        </p>
        <p className="text-body">
          <TextLink href="/tournaments/manage">Back to your tournaments</TextLink>
        </p>
      </div>
    );
  }

  const persist = (next: StoredTournament) => {
    setStored(next);
    void storage.updateTournament(next);
  };

  const applySetup = (setup: TournamentSetup) => {
    persist({ ...stored, ...setup, updatedAt: nowIso() });
    setEditing(false);
    setSelected(null);
  };

  const saveResult = (match: Match, sets: StoredSetScore[]) => {
    const now = nowIso();
    persist({
      ...stored,
      results: { ...stored.results, [match.id]: buildResult(match, sets, now) },
      updatedAt: now,
    });
    setSelected(null);
  };

  const clearResult = (matchId: string) => {
    const { [matchId]: _removed, ...rest } = stored.results;
    persist({ ...stored, results: rest, updatedAt: nowIso() });
    setSelected(null);
  };

  const selectedMatch: Match | null = selected
    ? ((selected.kind === 'pool'
        ? view.poolMatches.find((m) => m.id === selected.matchId)
        : view.brackets.flatMap((b) => b.matches).find((m) => m.id === selected.matchId)) ?? null)
    : null;

  const timeslots = [...view.timeslots].sort((a, b) => (a.startAt < b.startAt ? -1 : 1));
  const byCell = new Map<string, Match>();
  for (const match of view.poolMatches) {
    if (match.courtId && match.timeslotId) byCell.set(`${match.timeslotId}|${match.courtId}`, match);
  }

  return (
    <div className="flex flex-col gap-10">
      <LocalDataNotice />

      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-display-md text-ink">{stored.name}</h1>
          <p className="mt-1 text-caption text-ink-muted-80">
            {stored.playDate} · first serve {stored.startTime}
            {stored.venueName ? ` · ${stored.venueName}` : ''}
          </p>
        </div>
        <GhostButton onClick={() => setEditing((previous) => !previous)}>
          {editing ? 'Close setup' : 'Edit setup'}
        </GhostButton>
      </div>

      {editing && (
        <TournamentForm
          initial={stored}
          submitLabel="Save setup"
          onSubmit={applySetup}
          onCancel={() => setEditing(false)}
        />
      )}

      {view.problem && <Callout>{view.problem}</Callout>}

      {!view.problem && (
        <>
          {selectedMatch && selected && (
            <ScoreEditor
              key={selectedMatch.id}
              match={selectedMatch}
              kind={selected.kind}
              nameOf={view.nameOf}
              onSave={(sets) => saveResult(selectedMatch, sets)}
              onClear={() => clearResult(selectedMatch.id)}
              onClose={() => setSelected(null)}
            />
          )}

          <section className="flex min-w-0 flex-col gap-4">
            <SectionHeading
              note={`${view.playedCount} of ${view.poolMatches.length} matches scored · ${view.pools.length} pools · ${view.courts.length} courts`}
            >
              The day
            </SectionHeading>

            {view.unassignedMatchIds.length > 0 && (
              <Callout>
                {view.unassignedMatchIds.length} of {view.poolMatches.length} matches have nowhere
                to go — the day is {stored.slots} slots long and this field needs more. Add slots or
                courts in setup.
              </Callout>
            )}

            {view.unrefereedMatchIds.length > 0 && (
              <Callout>
                {view.unrefereedMatchIds.length} of {view.poolMatches.length} matches have no
                referee — with {view.courts.length} courts running at once there is nobody left who
                is not playing. Drop a court, or plan to bring officials.
              </Callout>
            )}

            <p className="text-caption text-ink-muted-80">
              Click a match to enter or correct its score. Standings and the bracket are recomputed,
              not patched.
            </p>

            <div className="min-w-0 overflow-x-auto">
              <table
                className="min-w-[560px] table-fixed border-separate border-spacing-1"
                style={{ width: `${64 + view.courts.length * 210}px`, maxWidth: '100%' }}
              >
                <thead>
                  <tr>
                    <th className="w-16" />
                    {view.courts.map((court) => (
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
                      {view.courts.map((court) => {
                        const match = byCell.get(`${slot.id}|${court.id}`);
                        return (
                          <td key={court.id} className="align-top">
                            {match ? (
                              <MatchCard
                                match={match}
                                nameOf={view.nameOf}
                                kind="pool"
                                splitByPoints={stored.splitByPoints}
                                selected={selected?.matchId === match.id}
                                onSelect={(m) => setSelected({ matchId: m.id, kind: 'pool' })}
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
            <SectionHeading note="computed from the matches above, on every render">
              Pool standings
            </SectionHeading>
            <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
              {view.pools.map((pool) => (
                <div key={pool.id} className="min-w-0">
                  <h3 className="mb-2 text-caption-strong text-ink">Pool {pool.name}</h3>
                  <StandingsTable standings={view.standingsByPool[pool.id] ?? []} />
                </div>
              ))}
            </div>
          </section>

          {!view.poolsComplete && (
            <section className="flex min-w-0 flex-col gap-4">
              <SectionHeading note="seeding reads records, never the entry list">
                Brackets
              </SectionHeading>
              <p className="text-caption text-ink-muted-80">
                Nothing to seed yet — {view.poolMatches.length - view.playedCount} pool{' '}
                {view.poolMatches.length - view.playedCount === 1 ? 'match' : 'matches'} still
                unscored. The bracket draws itself the moment the last pool score is in.
              </p>
            </section>
          )}

          {view.brackets.map((bracket) => (
            <section key={bracket.tier} className="flex min-w-0 flex-col gap-4">
              <SectionHeading
                note={
                  bracket.champion
                    ? `${bracket.champion.name} takes it`
                    : 'seeded across pools, byes on the top seeds'
                }
              >
                {TIER_LABELS[bracket.tier] ?? bracket.tier}
              </SectionHeading>

              <div className="grid gap-4 sm:grid-cols-3">
                {BRACKET_COLUMNS.map((column, index) => (
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
                            nameOf={view.nameOf}
                            kind="playoff"
                            splitByPoints={stored.splitByPoints}
                            selected={selected?.matchId === match.id}
                            onSelect={(m) => setSelected({ matchId: m.id, kind: 'playoff' })}
                          />
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </section>
          ))}

          {view.brackets.length > 0 && view.brackets.length < stored.tiers && (
            <p className="text-caption text-ink-muted-80">
              {stored.tiers} tiers asked for, {view.brackets.length} drawn — each tier takes eight
              qualifiers, and {view.participants.length} teams do not fill another.
            </p>
          )}
        </>
      )}
    </div>
  );
}
