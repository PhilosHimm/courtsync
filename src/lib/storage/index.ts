export type { StorageAdapter } from './adapter';
export type { KeyValueStore } from './local-adapter';
export { LocalStorageAdapter } from './local-adapter';
export type {
  StoredAttendanceEntry,
  StoredDropIn,
  StoredLeague,
  StoredPlayer,
  StoredResult,
  StoredResults,
  StoredSetScore,
  StoredTeam,
  StoredTournament,
} from './types';
export { competitionSlug, STORAGE_SCHEMA_VERSION } from './types';
