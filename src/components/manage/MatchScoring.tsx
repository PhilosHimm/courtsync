'use client';

import { useState } from 'react';
import type { Match } from '@/lib/core';
import { setsWon } from '@/lib/core';
import type { MatchKind } from '@/lib/manage';
import { resultProblem, winnerSide } from '@/lib/manage';
import type { StoredSetScore } from '@/lib/storage';
import { FIELD, GhostButton, UtilityButton } from './ui';

/**
 * A match on a manage board, and the editor that puts a real score on it.
 *
 * Clicking a match with two named sides opens the editor; saving stores the
 * sets and everything downstream — standings, seeding, the bracket — is
 * recomputed from scratch, never patched. Correcting a score ten minutes
 * after entering it is the most common thing that happens at a real event
 * (audit finding H14 was a bracket that kept the first answer), so editing a
 * played match is the same gesture as scoring it.
 */

function scoreLine(match: Match): string {
  return match.sets.map((set) => `${set.homePoints}–${set.awayPoints}`).join(', ');
}

export function MatchCard({
  match,
  nameOf,
  kind,
  splitByPoints,
  selected,
  onSelect,
}: {
  match: Match;
  nameOf: Record<string, string>;
  kind: MatchKind;
  /** The rule the standings are computed under. */
  splitByPoints: boolean;
  selected: boolean;
  onSelect?: (match: Match) => void;
}) {
  const home = match.homeParticipantId ? nameOf[match.homeParticipantId] : null;
  const away = match.awayParticipantId ? nameOf[match.awayParticipantId] : null;
  const played = match.status === 'final';
  const sets = setsWon(match);
  const decidesSplits = kind === 'pool' && splitByPoints;
  const winner = played ? winnerSide(match, decidesSplits) : null;
  const split = played && sets.home === sets.away;
  const scorable = Boolean(match.homeParticipantId && match.awayParticipantId && onSelect);

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
      {!played && scorable && <p className="mt-1 text-micro-legal text-primary">enter score</p>}
    </>
  );

  const shell = 'w-full rounded-sm border p-2.5 text-left';

  if (!scorable) {
    return <div className={`${shell} border-hairline bg-canvas`}>{body}</div>;
  }

  return (
    <button
      type="button"
      onClick={() => onSelect?.(match)}
      title={played ? 'Edit this result' : 'Enter this result'}
      className={`${shell} transition-transform duration-150 active:scale-95 ${
        selected ? 'border-primary bg-canvas' : 'border-hairline bg-canvas'
      }`}
    >
      {body}
    </button>
  );
}

interface RowState {
  home: string;
  away: string;
}

function initialRows(match: Match, count: number): RowState[] {
  return Array.from({ length: count }, (_, i) => {
    const set = match.sets[i];
    return set
      ? { home: String(set.homePoints), away: String(set.awayPoints) }
      : { home: '', away: '' };
  });
}

/** Parse the entered rows, or explain why they cannot be parsed yet. */
function parseRows(rows: RowState[]): { sets: StoredSetScore[] } | { error: string } {
  const sets: StoredSetScore[] = [];
  let ended = false;
  for (const [i, row] of rows.entries()) {
    const homeEmpty = row.home.trim() === '';
    const awayEmpty = row.away.trim() === '';
    if (homeEmpty && awayEmpty) {
      ended = true;
      continue;
    }
    if (ended) return { error: `Set ${i + 1} is filled but an earlier set is empty.` };
    if (homeEmpty || awayEmpty) return { error: `Set ${i + 1} is half-entered.` };
    const home = Number.parseInt(row.home, 10);
    const away = Number.parseInt(row.away, 10);
    if (!Number.isFinite(home) || !Number.isFinite(away)) {
      return { error: `Set ${i + 1} needs whole numbers.` };
    }
    sets.push({ home, away });
  }
  return { sets };
}

export function ScoreEditor({
  match,
  kind,
  nameOf,
  onSave,
  onClear,
  onClose,
}: {
  match: Match;
  kind: MatchKind;
  nameOf: Record<string, string>;
  onSave: (sets: StoredSetScore[]) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  const setCount = kind === 'pool' ? 2 : 3;
  const [rows, setRows] = useState<RowState[]>(() => initialRows(match, setCount));
  const [error, setError] = useState<string | null>(null);

  const home = match.homeParticipantId ? (nameOf[match.homeParticipantId] ?? '—') : '—';
  const away = match.awayParticipantId ? (nameOf[match.awayParticipantId] ?? '—') : '—';
  const hasResult = match.status === 'final';

  const setRow = (index: number, side: 'home' | 'away', value: string) =>
    setRows((previous) =>
      previous.map((row, i) => (i === index ? { ...row, [side]: value } : row)),
    );

  const save = () => {
    const parsed = parseRows(rows);
    if ('error' in parsed) {
      setError(parsed.error);
      return;
    }
    const problem = resultProblem(parsed.sets, kind);
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    onSave(parsed.sets);
  };

  return (
    <div className="rounded-lg border border-primary bg-canvas p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-caption-strong text-ink">
          {home} vs {away}
        </p>
        <p className="text-micro-legal text-ink-muted-80">
          {kind === 'pool'
            ? 'Two sets to 21 (cap 25). A 1–1 split can be decided on total points.'
            : 'Best of three — 25, 25, then 15. Someone has to take two sets.'}
        </p>
      </div>

      <div className="mt-3 flex flex-wrap items-end gap-4">
        {rows.map((row, i) => (
          <div key={`set-${i + 1}`} className="flex flex-col gap-1.5">
            <span className="text-micro-legal text-ink-muted-80">
              Set {i + 1}
              {kind === 'playoff' && i === 2 ? ' (if needed)' : ''}
            </span>
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                min={0}
                inputMode="numeric"
                value={row.home}
                aria-label={`Set ${i + 1}, ${home}`}
                onChange={(event) => setRow(i, 'home', event.target.value)}
                className={`${FIELD} w-16`}
              />
              <span className="text-caption text-ink-muted-80">–</span>
              <input
                type="number"
                min={0}
                inputMode="numeric"
                value={row.away}
                aria-label={`Set ${i + 1}, ${away}`}
                onChange={(event) => setRow(i, 'away', event.target.value)}
                className={`${FIELD} w-16`}
              />
            </div>
          </div>
        ))}

        <div className="flex items-center gap-2">
          <UtilityButton onClick={save}>Save result</UtilityButton>
          {hasResult && <GhostButton onClick={onClear}>Clear result</GhostButton>}
          <GhostButton onClick={onClose}>Cancel</GhostButton>
        </div>
      </div>

      {error && <p className="mt-2 text-caption text-ink">{error}</p>}
    </div>
  );
}
