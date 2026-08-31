'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { ButtonLink } from '@/components/Button';
import { createDropIn, createLeague, createTournament } from '@/lib/manage';
import { DropInForm, LeagueForm, TournamentForm } from './SetupForms';
import { useStorage } from './StorageProvider';
import { GhostButton, LocalDataNotice, newId, nowIso } from './ui';

/**
 * The list screens ("your tournaments") and the create screens, per format.
 *
 * All state lives behind the `StorageAdapter` from context; these components
 * never touch localStorage. Deleting asks first — it is the one action here
 * with no undo.
 */

interface ListRow {
  id: string;
  name: string;
  meta: string;
}

function ListShell({
  rows,
  loaded,
  hrefFor,
  newHref,
  newLabel,
  emptyText,
  onDelete,
}: {
  rows: ListRow[];
  loaded: boolean;
  hrefFor: (id: string) => string;
  newHref: string;
  newLabel: string;
  emptyText: string;
  onDelete: (id: string, name: string) => void;
}) {
  return (
    <div className="flex flex-col gap-6">
      <LocalDataNotice />

      <div>
        <ButtonLink href={newHref}>{newLabel}</ButtonLink>
      </div>

      {loaded && rows.length === 0 && <p className="text-body text-ink-muted-80">{emptyText}</p>}

      {rows.length > 0 && (
        <ul className="flex flex-col">
          {rows.map((row) => (
            <li
              key={row.id}
              className="flex flex-wrap items-center justify-between gap-3 border-divider-soft border-b py-3 last:border-0"
            >
              <div className="min-w-0">
                <Link href={hrefFor(row.id)} className="text-body-strong text-primary">
                  {row.name}
                </Link>
                <p className="text-caption text-ink-muted-80">{row.meta}</p>
              </div>
              <GhostButton onClick={() => onDelete(row.id, row.name)}>Delete</GhostButton>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Tournaments                                                         */
/* ------------------------------------------------------------------ */

export function TournamentManager() {
  const storage = useStorage();
  const [rows, setRows] = useState<ListRow[]>([]);
  const [loaded, setLoaded] = useState(false);

  const reload = useCallback(async () => {
    const all = await storage.getAllTournaments();
    setRows(
      all.map((t) => ({
        id: t.id,
        name: t.name,
        meta: `${t.playDate} · ${t.teams.length} teams · ${Object.keys(t.results).length} results in`,
      })),
    );
    setLoaded(true);
  }, [storage]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return (
    <ListShell
      rows={rows}
      loaded={loaded}
      hrefFor={(id) => `/tournaments/manage/${id}`}
      newHref="/tournaments/manage/new"
      newLabel="New tournament"
      emptyText="No tournaments yet. Create one and it stays in this browser."
      onDelete={(id, name) => {
        if (!window.confirm(`Delete "${name}" and every result in it? This cannot be undone.`))
          return;
        void storage.deleteTournament(id).then(reload);
      }}
    />
  );
}

export function NewTournament() {
  const storage = useStorage();
  const router = useRouter();

  return (
    <div className="flex flex-col gap-6">
      <LocalDataNotice />
      <TournamentForm
        submitLabel="Create tournament"
        onSubmit={(setup) => {
          const stored = createTournament(setup, newId(), nowIso());
          void storage.saveTournament(stored).then(() => {
            router.push(`/tournaments/manage/${stored.id}`);
          });
        }}
        onCancel={() => router.push('/tournaments/manage')}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Leagues                                                             */
/* ------------------------------------------------------------------ */

export function LeagueManager() {
  const storage = useStorage();
  const [rows, setRows] = useState<ListRow[]>([]);
  const [loaded, setLoaded] = useState(false);

  const reload = useCallback(async () => {
    const all = await storage.getAllLeagues();
    setRows(
      all.map((l) => ({
        id: l.id,
        name: l.name,
        meta: `${l.weeks} weeks from ${l.startDate} · ${l.teams.length} teams · ${
          Object.keys(l.results).length
        } results in`,
      })),
    );
    setLoaded(true);
  }, [storage]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return (
    <ListShell
      rows={rows}
      loaded={loaded}
      hrefFor={(id) => `/leagues/manage/${id}`}
      newHref="/leagues/manage/new"
      newLabel="New league"
      emptyText="No leagues yet. Create one and it stays in this browser."
      onDelete={(id, name) => {
        if (!window.confirm(`Delete "${name}" and every result in it? This cannot be undone.`))
          return;
        void storage.deleteLeague(id).then(reload);
      }}
    />
  );
}

export function NewLeague() {
  const storage = useStorage();
  const router = useRouter();

  return (
    <div className="flex flex-col gap-6">
      <LocalDataNotice />
      <LeagueForm
        submitLabel="Create league"
        onSubmit={(setup) => {
          const stored = createLeague(setup, newId(), nowIso());
          void storage.saveLeague(stored).then(() => {
            router.push(`/leagues/manage/${stored.id}`);
          });
        }}
        onCancel={() => router.push('/leagues/manage')}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Drop-ins                                                            */
/* ------------------------------------------------------------------ */

export function DropInManager() {
  const storage = useStorage();
  const [rows, setRows] = useState<ListRow[]>([]);
  const [loaded, setLoaded] = useState(false);

  const reload = useCallback(async () => {
    const all = await storage.getAllDropIns();
    setRows(
      all.map((d) => ({
        id: d.id,
        name: d.name,
        meta: `${d.playDate} · ${d.players.length} signed up · capacity ${d.capacity}`,
      })),
    );
    setLoaded(true);
  }, [storage]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return (
    <ListShell
      rows={rows}
      loaded={loaded}
      hrefFor={(id) => `/dropins/manage/${id}`}
      newHref="/dropins/manage/new"
      newLabel="New drop-in session"
      emptyText="No sessions yet. Create one and it stays in this browser."
      onDelete={(id, name) => {
        if (!window.confirm(`Delete "${name}" and its sign-in sheet? This cannot be undone.`))
          return;
        void storage.deleteDropIn(id).then(reload);
      }}
    />
  );
}

export function NewDropIn() {
  const storage = useStorage();
  const router = useRouter();

  return (
    <div className="flex flex-col gap-6">
      <LocalDataNotice />
      <DropInForm
        submitLabel="Create session"
        onSubmit={(setup) => {
          const stored = createDropIn(setup, newId(), nowIso());
          void storage.saveDropIn(stored).then(() => {
            router.push(`/dropins/manage/${stored.id}`);
          });
        }}
        onCancel={() => router.push('/dropins/manage')}
      />
    </div>
  );
}
