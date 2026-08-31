import type { StorageAdapter } from './adapter';
import type { StoredDropIn, StoredLeague, StoredTournament } from './types';

/**
 * `StorageAdapter` over the browser's localStorage.
 *
 * One key per collection, each holding a JSON array. Every read re-parses
 * from storage rather than caching in the instance — two tabs on the same
 * browser then see each other's writes on their next read instead of
 * clobbering each other with stale snapshots.
 *
 * Reads are defensive everywhere: storage can be missing (server render,
 * privacy modes), the value can be absent, and the JSON can be from a future
 * or mangled version. Any of those yields an empty collection, never a
 * throw — losing the parse is survivable, taking the page down is not.
 */

const KEYS = {
  tournaments: 'courtsync.v1.tournaments',
  leagues: 'courtsync.v1.leagues',
  dropins: 'courtsync.v1.dropins',
} as const;

type CollectionKey = (typeof KEYS)[keyof typeof KEYS];

/** The subset of the Web Storage API this adapter needs. Injectable for tests. */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function defaultStore(): KeyValueStore | null {
  // `localStorage` throws on access in some contexts (e.g. blocked site
  // data), not just returns undefined — hence the try around the read.
  try {
    if (typeof localStorage !== 'undefined') return localStorage;
  } catch {
    // fall through
  }
  return null;
}

export class LocalStorageAdapter implements StorageAdapter {
  private readonly store: KeyValueStore | null;

  constructor(store?: KeyValueStore) {
    this.store = store ?? defaultStore();
  }

  private read<T extends { id: string }>(key: CollectionKey): T[] {
    if (!this.store) return [];
    try {
      const raw = this.store.getItem(key);
      if (raw === null) return [];
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(
        (item): item is T =>
          typeof item === 'object' &&
          item !== null &&
          typeof (item as { id?: unknown }).id === 'string',
      );
    } catch {
      return [];
    }
  }

  private write<T extends { id: string }>(key: CollectionKey, items: T[]): void {
    if (!this.store) {
      throw new Error('No local storage is available in this context; nothing was saved.');
    }
    this.store.setItem(key, JSON.stringify(items));
  }

  private upsert<T extends { id: string }>(key: CollectionKey, item: T): void {
    const items = this.read<T>(key);
    const index = items.findIndex((existing) => existing.id === item.id);
    if (index === -1) items.push(item);
    else items[index] = item;
    this.write(key, items);
  }

  private remove(key: CollectionKey, id: string): void {
    const items = this.read<{ id: string }>(key);
    this.write(
      key,
      items.filter((item) => item.id !== id),
    );
  }

  // -- tournaments ---------------------------------------------------------

  async getAllTournaments(): Promise<StoredTournament[]> {
    return this.read<StoredTournament>(KEYS.tournaments);
  }

  async getTournament(id: string): Promise<StoredTournament | null> {
    return (await this.getAllTournaments()).find((t) => t.id === id) ?? null;
  }

  async saveTournament(tournament: StoredTournament): Promise<void> {
    this.upsert(KEYS.tournaments, tournament);
  }

  async updateTournament(tournament: StoredTournament): Promise<void> {
    this.upsert(KEYS.tournaments, tournament);
  }

  async deleteTournament(id: string): Promise<void> {
    this.remove(KEYS.tournaments, id);
  }

  // -- leagues -------------------------------------------------------------

  async getAllLeagues(): Promise<StoredLeague[]> {
    return this.read<StoredLeague>(KEYS.leagues);
  }

  async getLeague(id: string): Promise<StoredLeague | null> {
    return (await this.getAllLeagues()).find((l) => l.id === id) ?? null;
  }

  async saveLeague(league: StoredLeague): Promise<void> {
    this.upsert(KEYS.leagues, league);
  }

  async updateLeague(league: StoredLeague): Promise<void> {
    this.upsert(KEYS.leagues, league);
  }

  async deleteLeague(id: string): Promise<void> {
    this.remove(KEYS.leagues, id);
  }

  // -- drop-ins ------------------------------------------------------------

  async getAllDropIns(): Promise<StoredDropIn[]> {
    return this.read<StoredDropIn>(KEYS.dropins);
  }

  async getDropIn(id: string): Promise<StoredDropIn | null> {
    return (await this.getAllDropIns()).find((d) => d.id === id) ?? null;
  }

  async saveDropIn(session: StoredDropIn): Promise<void> {
    this.upsert(KEYS.dropins, session);
  }

  async updateDropIn(session: StoredDropIn): Promise<void> {
    this.upsert(KEYS.dropins, session);
  }

  async deleteDropIn(id: string): Promise<void> {
    this.remove(KEYS.dropins, id);
  }

  // -- housekeeping --------------------------------------------------------

  async clearAll(): Promise<void> {
    if (!this.store) return;
    for (const key of Object.values(KEYS)) {
      this.store.removeItem(key);
    }
  }
}
