import type { AttendanceStatus } from '@/lib/core';

/**
 * The records the browser keeps.
 *
 * The design rule, carried over from the engine: **store what the user
 * decided, derive what the engine can compute.** A stored tournament holds
 * the setup (teams, courts, the shape of the day) and the results the
 * organizer typed in — never the schedule, never the standings, never the
 * bracket. Those are rebuilt by `src/lib/manage` from these inputs on every
 * read, exactly the way the demo rebuilds them from a URL. Storing the
 * derived state is how audit finding H9 happened, and a local build gets no
 * exemption from that lesson.
 *
 * Everything here is JSON-serializable and versioned so a future server
 * adapter (or a migration) knows exactly what it is looking at.
 */

export const STORAGE_SCHEMA_VERSION = 1;

/** One set's score as the organizer entered it. */
export interface StoredSetScore {
  home: number;
  away: number;
}

/**
 * A result the organizer recorded for one engine-minted match id.
 *
 * The participant ids are stored alongside the sets so a result can be
 * reconciled after the setup changes: if editing the field regenerates the
 * schedule and this match id now pairs different teams — or no longer exists
 * — the result is ignored rather than silently attached to the wrong game.
 */
export interface StoredResult {
  matchId: string;
  homeParticipantId: string;
  awayParticipantId: string;
  sets: StoredSetScore[];
  recordedAt: string;
}

/** Results keyed by match id. */
export type StoredResults = Record<string, StoredResult>;

/**
 * A team as entered by the organizer. The id is minted once at creation and
 * never changes, so renaming a team keeps its results. List order is seeding
 * order — first in the list is the top seed.
 */
export interface StoredTeam {
  id: string;
  name: string;
}

/** A drop-in player at the door. */
export interface StoredPlayer {
  id: string;
  name: string;
}

/** One player's standing at the door, in sign-up order. */
export interface StoredAttendanceEntry {
  participantId: string;
  status: AttendanceStatus;
  /** 1-based position while `status` is `waitlist`; absent otherwise. */
  waitlistPos?: number;
  recordedAt: string;
}

interface StoredBase {
  id: string;
  schemaVersion: typeof STORAGE_SCHEMA_VERSION;
  name: string;
  venueName?: string;
  createdAt: string;
  updatedAt: string;
}

/** A one-day tournament: pools into a bracket. */
export interface StoredTournament extends StoredBase {
  /** ISO date, YYYY-MM-DD. */
  playDate: string;
  /** Local wall-clock, HH:mm. */
  startTime: string;
  gameDurationMin: number;
  bufferMin: number;
  courtNames: string[];
  /** Timeslots in the day. */
  slots: number;
  /** Empty slots to leave between a team's matches. */
  restSlots: number;
  poolCount: number;
  /** Bracket tiers to draw: 1 = gold, 2 = +silver, 3 = +bronze. */
  tiers: number;
  /** Whether a 1–1 pool match is decided on total points. */
  splitByPoints: boolean;
  teams: StoredTeam[];
  results: StoredResults;
}

/** A league season: one session a week, fixed teams. */
export interface StoredLeague extends StoredBase {
  /** ISO date of week 1. Subsequent weeks are seven days apart. */
  startDate: string;
  startTime: string;
  weeks: number;
  gameDurationMin: number;
  bufferMin: number;
  courtNames: string[];
  slotsPerWeek: number;
  /** 1 = single round-robin, 2 = home and away. */
  legs: number;
  splitByPoints: boolean;
  teams: StoredTeam[];
  results: StoredResults;
}

/** A drop-in night: capacity, a waitlist, and a rotation. */
export interface StoredDropIn extends StoredBase {
  playDate: string;
  startTime: string;
  gameDurationMin: number;
  bufferMin: number;
  courtNames: string[];
  rounds: number;
  capacity: number;
  playersPerSide: number;
  /** Everyone who signed up, in sign-up order. */
  players: StoredPlayer[];
  /** One entry per player, same ids as `players`. */
  attendance: StoredAttendanceEntry[];
}

/**
 * The engine mints match ids from a competition slug ([a-z0-9-]). Deriving
 * the slug from the immutable record id — never from the name — is what lets
 * a rename keep every recorded result.
 */
export function competitionSlug(id: string): string {
  const cleaned = id.toLowerCase().replace(/[^a-z0-9-]/g, '');
  return `cs-${cleaned.slice(0, 12) || 'local'}`;
}
