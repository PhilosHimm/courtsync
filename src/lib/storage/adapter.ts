import type { StoredDropIn, StoredLeague, StoredTournament } from './types';

/**
 * The seam between the UI and wherever data actually lives.
 *
 * Components and hooks depend on this interface and nothing else — no
 * component may touch `localStorage` directly. Today the one implementation
 * is `local-adapter.ts`; when the auth decision lands, a `server-adapter.ts`
 * that calls server actions against Neon implements the same surface and the
 * components do not change. That is the whole point of the seam, so keep it
 * narrow and keep it async: localStorage is synchronous but a server never
 * will be, and an interface that leaks synchronicity would have to break on
 * the swap.
 *
 * `save*` and `update*` are distinct so a server adapter can map them onto
 * INSERT and UPDATE (with rule 4's row-count assertion) rather than guessing.
 * The local adapter treats both as upserts, which is the honest best it can
 * do over a key-value store.
 */
export interface StorageAdapter {
  getAllTournaments(): Promise<StoredTournament[]>;
  getTournament(id: string): Promise<StoredTournament | null>;
  saveTournament(tournament: StoredTournament): Promise<void>;
  updateTournament(tournament: StoredTournament): Promise<void>;
  deleteTournament(id: string): Promise<void>;

  getAllLeagues(): Promise<StoredLeague[]>;
  getLeague(id: string): Promise<StoredLeague | null>;
  saveLeague(league: StoredLeague): Promise<void>;
  updateLeague(league: StoredLeague): Promise<void>;
  deleteLeague(id: string): Promise<void>;

  getAllDropIns(): Promise<StoredDropIn[]>;
  getDropIn(id: string): Promise<StoredDropIn | null>;
  saveDropIn(session: StoredDropIn): Promise<void>;
  updateDropIn(session: StoredDropIn): Promise<void>;
  deleteDropIn(id: string): Promise<void>;

  /** Wipe everything this adapter holds. The local "start over" button. */
  clearAll(): Promise<void>;
}
