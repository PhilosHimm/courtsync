'use client';

import { useState } from 'react';
import type { DropInSetup, LeagueSetup, TournamentSetup } from '@/lib/manage';
import { validPoolCounts } from '@/lib/manage';
import type { StoredDropIn, StoredLeague, StoredTeam, StoredTournament } from '@/lib/storage';
import type { NamedRow } from './ListEditors';
import { NameListEditor } from './ListEditors';
import {
  Callout,
  CheckboxField,
  DateField,
  GhostButton,
  NumberField,
  OptionField,
  PrimaryButton,
  TextField,
  TimeField,
  newId,
} from './ui';

/**
 * The setup forms — where an organizer actually creates and customizes their
 * own event. Each submits a complete `*Setup`; the caller mints the id and
 * timestamp and writes through the storage adapter.
 *
 * On edit, the same form is reused with the stored record as its initial
 * state. Editing regenerates the schedule; results whose pairings survive the
 * regeneration keep applying, and the form says so rather than hiding it.
 */

/** Today in the browser's clock, as an ISO date. Forms only — never engine code. */
function todayIso(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
    now.getDate(),
  ).padStart(2, '0')}`;
}

function numberedRows(count: number, label: string): NamedRow[] {
  return Array.from({ length: count }, (_, i) => ({ id: newId(), name: `${label} ${i + 1}` }));
}

function cleanRows(rows: NamedRow[], label: string): StoredTeam[] {
  return rows.map((row, i) => ({ id: row.id, name: row.name.trim() || `${label} ${i + 1}` }));
}

const PANEL = 'rounded-lg border border-hairline bg-canvas p-6';
const ROW = 'flex flex-wrap items-end gap-x-6 gap-y-4';

function FormActions({
  submitLabel,
  onSubmit,
  onCancel,
}: {
  submitLabel: string;
  onSubmit: () => void;
  onCancel?: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <PrimaryButton onClick={onSubmit}>{submitLabel}</PrimaryButton>
      {onCancel && <GhostButton onClick={onCancel}>Cancel</GhostButton>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Tournament                                                          */
/* ------------------------------------------------------------------ */

export function TournamentForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial?: StoredTournament;
  submitLabel: string;
  onSubmit: (setup: TournamentSetup) => void;
  onCancel?: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [venueName, setVenueName] = useState(initial?.venueName ?? '');
  const [playDate, setPlayDate] = useState(initial?.playDate ?? todayIso());
  const [startTime, setStartTime] = useState(initial?.startTime ?? '09:00');
  const [gameDurationMin, setGameDurationMin] = useState(initial?.gameDurationMin ?? 45);
  const [bufferMin, setBufferMin] = useState(initial?.bufferMin ?? 5);
  const [slots, setSlots] = useState(initial?.slots ?? 10);
  const [restSlots, setRestSlots] = useState(initial?.restSlots ?? 1);
  const [poolCount, setPoolCount] = useState(initial?.poolCount ?? 2);
  const [tiers, setTiers] = useState(initial?.tiers ?? 1);
  const [splitByPoints, setSplitByPoints] = useState(initial?.splitByPoints ?? true);
  const [teams, setTeams] = useState<NamedRow[]>(
    initial?.teams ?? (() => numberedRows(8, 'Team'))(),
  );
  const [courts, setCourts] = useState<NamedRow[]>(
    initial?.courtNames.map((courtName) => ({ id: newId(), name: courtName })) ??
      numberedRows(3, 'Court'),
  );

  const poolOptions = validPoolCounts(teams.length);
  const hasResults = Boolean(initial && Object.keys(initial.results).length > 0);

  const submit = () =>
    onSubmit({
      name: name.trim() || 'Untitled tournament',
      ...(venueName.trim() ? { venueName: venueName.trim() } : {}),
      playDate,
      startTime,
      gameDurationMin,
      bufferMin,
      courtNames: cleanRows(courts, 'Court').map((c) => c.name),
      slots,
      restSlots,
      poolCount,
      tiers,
      splitByPoints,
      teams: cleanRows(teams, 'Team'),
    });

  return (
    <div className="flex flex-col gap-6">
      {hasResults && (
        <Callout>
          This tournament has results recorded. Changing teams or the day's shape regenerates the
          schedule — scores whose pairings survive keep applying, the rest are set aside.
        </Callout>
      )}

      <div className={PANEL}>
        <div className={ROW}>
          <TextField label="Name" value={name} onChange={setName} placeholder="Autumn Open" wide />
          <TextField label="Venue" value={venueName} onChange={setVenueName} placeholder="Gym" />
          <DateField label="Date" value={playDate} onChange={setPlayDate} />
          <TimeField label="First serve" value={startTime} onChange={setStartTime} />
          <NumberField
            label="Game length (min)"
            value={gameDurationMin}
            min={15}
            max={90}
            onChange={setGameDurationMin}
          />
          <NumberField
            label="Buffer (min)"
            value={bufferMin}
            min={0}
            max={30}
            onChange={setBufferMin}
          />
          <NumberField label="Timeslots" value={slots} min={2} max={24} onChange={setSlots} />
          <NumberField
            label="Rest between rounds (slots)"
            value={restSlots}
            min={0}
            max={3}
            onChange={setRestSlots}
          />
          <OptionField
            label="Pools"
            value={poolOptions.includes(poolCount) ? poolCount : (poolOptions[0] ?? 1)}
            options={poolOptions.length > 0 ? poolOptions : [1]}
            onChange={setPoolCount}
          />
          <NumberField label="Bracket tiers" value={tiers} min={1} max={3} onChange={setTiers} />
          <CheckboxField
            label="1–1 decided on total points"
            checked={splitByPoints}
            onChange={setSplitByPoints}
          />
        </div>
      </div>

      <div className={`${PANEL} flex flex-col gap-6 sm:flex-row sm:gap-16`}>
        <NameListEditor
          label="Teams"
          rows={teams}
          onChange={setTeams}
          mintId={newId}
          min={3}
          max={24}
          placeholderFor={(i) => `Team ${i + 1}`}
          addLabel="Add team"
          note="List order is seeding order — first is the top seed."
        />
        <NameListEditor
          label="Courts"
          rows={courts}
          onChange={setCourts}
          mintId={newId}
          min={1}
          max={8}
          placeholderFor={(i) => `Court ${i + 1}`}
          addLabel="Add court"
        />
      </div>

      <FormActions submitLabel={submitLabel} onSubmit={submit} onCancel={onCancel} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* League                                                              */
/* ------------------------------------------------------------------ */

export function LeagueForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial?: StoredLeague;
  submitLabel: string;
  onSubmit: (setup: LeagueSetup) => void;
  onCancel?: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [venueName, setVenueName] = useState(initial?.venueName ?? '');
  const [startDate, setStartDate] = useState(initial?.startDate ?? todayIso());
  const [startTime, setStartTime] = useState(initial?.startTime ?? '19:00');
  const [weeks, setWeeks] = useState(initial?.weeks ?? 10);
  const [gameDurationMin, setGameDurationMin] = useState(initial?.gameDurationMin ?? 50);
  const [bufferMin, setBufferMin] = useState(initial?.bufferMin ?? 10);
  const [slotsPerWeek, setSlotsPerWeek] = useState(initial?.slotsPerWeek ?? 2);
  const [legs, setLegs] = useState(initial?.legs ?? 1);
  const [splitByPoints, setSplitByPoints] = useState(initial?.splitByPoints ?? true);
  const [teams, setTeams] = useState<NamedRow[]>(
    initial?.teams ?? (() => numberedRows(8, 'Team'))(),
  );
  const [courts, setCourts] = useState<NamedRow[]>(
    initial?.courtNames.map((courtName) => ({ id: newId(), name: courtName })) ??
      numberedRows(2, 'Court'),
  );

  const hasResults = Boolean(initial && Object.keys(initial.results).length > 0);

  const submit = () =>
    onSubmit({
      name: name.trim() || 'Untitled league',
      ...(venueName.trim() ? { venueName: venueName.trim() } : {}),
      startDate,
      startTime,
      weeks,
      gameDurationMin,
      bufferMin,
      courtNames: cleanRows(courts, 'Court').map((c) => c.name),
      slotsPerWeek,
      legs,
      splitByPoints,
      teams: cleanRows(teams, 'Team'),
    });

  return (
    <div className="flex flex-col gap-6">
      {hasResults && (
        <Callout>
          This league has results recorded. Changing teams or the season's shape regenerates the
          fixtures — scores whose pairings survive keep applying, the rest are set aside.
        </Callout>
      )}

      <div className={PANEL}>
        <div className={ROW}>
          <TextField
            label="Name"
            value={name}
            onChange={setName}
            placeholder="Tuesday Night League"
            wide
          />
          <TextField label="Venue" value={venueName} onChange={setVenueName} placeholder="Gym" />
          <DateField label="Week 1" value={startDate} onChange={setStartDate} />
          <TimeField label="Start time" value={startTime} onChange={setStartTime} />
          <NumberField label="Weeks" value={weeks} min={2} max={20} onChange={setWeeks} />
          <NumberField
            label="Game length (min)"
            value={gameDurationMin}
            min={15}
            max={90}
            onChange={setGameDurationMin}
          />
          <NumberField
            label="Buffer (min)"
            value={bufferMin}
            min={0}
            max={30}
            onChange={setBufferMin}
          />
          <NumberField
            label="Timeslots per week"
            value={slotsPerWeek}
            min={1}
            max={4}
            onChange={setSlotsPerWeek}
          />
          <NumberField
            label="Times through (legs)"
            value={legs}
            min={1}
            max={2}
            onChange={setLegs}
          />
          <CheckboxField
            label="1–1 decided on total points"
            checked={splitByPoints}
            onChange={setSplitByPoints}
          />
        </div>
      </div>

      <div className={`${PANEL} flex flex-col gap-6 sm:flex-row sm:gap-16`}>
        <NameListEditor
          label="Teams"
          rows={teams}
          onChange={setTeams}
          mintId={newId}
          min={2}
          max={16}
          placeholderFor={(i) => `Team ${i + 1}`}
          addLabel="Add team"
        />
        <NameListEditor
          label="Courts"
          rows={courts}
          onChange={setCourts}
          mintId={newId}
          min={1}
          max={4}
          placeholderFor={(i) => `Court ${i + 1}`}
          addLabel="Add court"
        />
      </div>

      <FormActions submitLabel={submitLabel} onSubmit={submit} onCancel={onCancel} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Drop-in                                                             */
/* ------------------------------------------------------------------ */

export function DropInForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial?: StoredDropIn;
  submitLabel: string;
  onSubmit: (setup: DropInSetup) => void;
  onCancel?: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [venueName, setVenueName] = useState(initial?.venueName ?? '');
  const [playDate, setPlayDate] = useState(initial?.playDate ?? todayIso());
  const [startTime, setStartTime] = useState(initial?.startTime ?? '20:00');
  const [gameDurationMin, setGameDurationMin] = useState(initial?.gameDurationMin ?? 20);
  const [bufferMin, setBufferMin] = useState(initial?.bufferMin ?? 5);
  const [rounds, setRounds] = useState(initial?.rounds ?? 4);
  const [capacity, setCapacity] = useState(initial?.capacity ?? 18);
  const [playersPerSide, setPlayersPerSide] = useState(initial?.playersPerSide ?? 4);
  const [courts, setCourts] = useState<NamedRow[]>(
    initial?.courtNames.map((courtName) => ({ id: newId(), name: courtName })) ??
      numberedRows(2, 'Court'),
  );

  const submit = () =>
    onSubmit({
      name: name.trim() || 'Untitled drop-in',
      ...(venueName.trim() ? { venueName: venueName.trim() } : {}),
      playDate,
      startTime,
      gameDurationMin,
      bufferMin,
      courtNames: cleanRows(courts, 'Court').map((c) => c.name),
      rounds,
      capacity,
      playersPerSide,
    });

  return (
    <div className="flex flex-col gap-6">
      <div className={PANEL}>
        <div className={ROW}>
          <TextField
            label="Name"
            value={name}
            onChange={setName}
            placeholder="Thursday Drop-In"
            wide
          />
          <TextField label="Venue" value={venueName} onChange={setVenueName} placeholder="Gym" />
          <DateField label="Date" value={playDate} onChange={setPlayDate} />
          <TimeField label="Doors" value={startTime} onChange={setStartTime} />
          <NumberField
            label="Round length (min)"
            value={gameDurationMin}
            min={10}
            max={45}
            onChange={setGameDurationMin}
          />
          <NumberField
            label="Buffer (min)"
            value={bufferMin}
            min={0}
            max={15}
            onChange={setBufferMin}
          />
          <NumberField label="Rounds" value={rounds} min={1} max={8} onChange={setRounds} />
          <NumberField label="Capacity" value={capacity} min={4} max={40} onChange={setCapacity} />
          <NumberField
            label="Players per side"
            value={playersPerSide}
            min={2}
            max={6}
            onChange={setPlayersPerSide}
          />
        </div>
      </div>

      <div className={PANEL}>
        <NameListEditor
          label="Courts"
          rows={courts}
          onChange={setCourts}
          mintId={newId}
          min={1}
          max={4}
          placeholderFor={(i) => `Court ${i + 1}`}
          addLabel="Add court"
        />
      </div>

      <FormActions submitLabel={submitLabel} onSubmit={submit} onCancel={onCancel} />
    </div>
  );
}
