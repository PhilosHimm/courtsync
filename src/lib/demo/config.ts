import { MAX_TEAMS_PER_POOL, MIN_TEAMS_PER_POOL } from '@/lib/core';

/**
 * Every knob the demo exposes, and the rules for reading one out of a URL.
 *
 * Demo state lives entirely in the query string. That is what makes a demo
 * "copyable" in the sense that matters here: paste a link into a message and
 * the person who opens it sees the same schedule you were looking at, with no
 * account, no saved record, and nothing on a server that has to be authorized
 * later. Rule 6 says authorization belongs at the data layer; the demo's
 * answer is to have no data layer at all.
 *
 * Consequently the parsers below are the demo's whole trust boundary. A query
 * string is attacker-controlled text, and the scheduling engine throws on
 * input it cannot schedule (`drawPools` refuses a pool count that would make a
 * pool of two). Every value is therefore clamped into a range the engine is
 * known to accept rather than validated and rejected — a demo that 500s on a
 * hand-edited URL is worse than one that quietly shows the nearest legal
 * schedule.
 */

/** Next.js hands `searchParams` through in this shape. */
export type QueryParams = Record<string, string | string[] | undefined>;

export interface Range {
  min: number;
  max: number;
  fallback: number;
}

export const clamp = (value: number, min: number, max: number): number =>
  value < min ? min : value > max ? max : value;

/**
 * Read one integer knob. A repeated parameter (`?teams=8&teams=99`) yields an
 * array; the first wins, which is the same rule browsers and most servers use.
 */
export function readInt(params: QueryParams, key: string, range: Range): number {
  const raw = params[key];
  const first = Array.isArray(raw) ? raw[0] : raw;
  if (first === undefined) return range.fallback;
  const parsed = Number.parseInt(first, 10);
  if (!Number.isFinite(parsed)) return range.fallback;
  return clamp(Math.trunc(parsed), range.min, range.max);
}

export function readFlag(params: QueryParams, key: string, fallback: boolean): boolean {
  const raw = params[key];
  const first = Array.isArray(raw) ? raw[0] : raw;
  if (first === undefined) return fallback;
  return first === '1' || first === 'true';
}

export function readOneOf<T extends string>(
  params: QueryParams,
  key: string,
  allowed: readonly T[],
  fallback: T,
): T {
  const raw = params[key];
  const first = Array.isArray(raw) ? raw[0] : raw;
  return allowed.find((value) => value === first) ?? fallback;
}

/* ------------------------------------------------------------------ */
/* Corrected results                                                   */
/* ------------------------------------------------------------------ */

/**
 * Enough to correct every match on a demo day and nowhere near enough to
 * build a URL that costs anything to parse.
 */
const MAX_FLIPS = 120;

/** Engine-minted match ids are lowercase, digits and hyphens. Nothing else. */
const MATCH_ID = /^[a-z0-9-]{1,64}$/;

/**
 * The matches whose result a visitor has turned around, by id.
 *
 * Carrying these in the link is what makes a demo worth sending: the
 * interesting thing to show somebody is not the generated bracket, it is the
 * bracket after the quarterfinal that was scored wrong got corrected. Only
 * the ids travel — which result each one flips to is derived, so the link
 * stays short and cannot disagree with itself.
 */
export function parseFlips(params: QueryParams): string[] {
  const raw = params.flip;
  const values = Array.isArray(raw) ? raw : raw === undefined ? [] : [raw];
  const seen = new Set<string>();
  for (const value of values) {
    for (const id of value.split(',')) {
      if (seen.size >= MAX_FLIPS) break;
      if (MATCH_ID.test(id)) seen.add(id);
    }
  }
  return [...seen];
}

export function flipsQuery(ids: readonly string[]): string {
  const kept = ids.filter((id) => MATCH_ID.test(id)).slice(0, MAX_FLIPS);
  return kept.length === 0 ? '' : `flip=${kept.join(',')}`;
}

/* ------------------------------------------------------------------ */
/* Tournament                                                          */
/* ------------------------------------------------------------------ */

/**
 * How far into the day the demo has got. Not a wizard step — it is which
 * results exist, which is the only thing that separates "a schedule" from
 * "a bracket" in an engine where standings are always computed on read.
 */
export const TOURNAMENT_STAGES = ['draw', 'pools', 'quarters', 'semis', 'final'] as const;
export type TournamentStage = (typeof TOURNAMENT_STAGES)[number];

export interface TournamentDemoConfig {
  teams: number;
  pools: number;
  courts: number;
  /** Timeslots in the day. Too few and the engine reports matches unassigned. */
  slots: number;
  /** Empty slots to leave between rounds, i.e. rest. */
  rest: number;
  /**
   * How many bracket tiers to draw: gold, then silver, then bronze.
   *
   * More than one is what stops half the field going home after pool play,
   * and `seedBrackets` has taken a tier list from the beginning. Capped at
   * the three names in `BRACKET_TIERS` — the engine allocates eight
   * qualifiers per tier, so a fourth would have nobody in it.
   */
  tiers: number;
  /**
   * Pool play is two sets with no decider, so a 1-1 match goes to whoever
   * scored more across both. `computeStandings` defaults this on; turning it
   * off leaves those matches genuinely drawn, which is what a format with a
   * third set would want.
   */
  splitByPoints: boolean;
  stage: TournamentStage;
}

const TOURNAMENT_RANGES = {
  teams: { min: 6, max: 24, fallback: 12 },
  pools: { min: 1, max: 8, fallback: 3 },
  courts: { min: 1, max: 8, fallback: 3 },
  slots: { min: 2, max: 24, fallback: 10 },
  rest: { min: 0, max: 3, fallback: 1 },
  tiers: { min: 1, max: 3, fallback: 1 },
} as const;

/**
 * Pool counts that divide this field into pools the engine will accept.
 *
 * `drawPools` throws rather than silently redrawing when the count cannot
 * work, which is right for an organizer filling in a form and wrong for a
 * URL nobody typed carefully. Enumerating the legal counts lets the demo
 * snap to the nearest one instead of catching an exception.
 */
export function validPoolCounts(teams: number): number[] {
  const counts: number[] = [];
  for (let count = 1; count <= teams; count++) {
    const largest = Math.ceil(teams / count);
    const smallest = Math.floor(teams / count);
    if (smallest < MIN_TEAMS_PER_POOL || largest > MAX_TEAMS_PER_POOL) continue;
    counts.push(count);
  }
  return counts;
}

/** The legal pool count closest to the one asked for; ties go to the smaller. */
export function nearestPoolCount(teams: number, requested: number): number {
  const valid = validPoolCounts(teams);
  const first = valid[0];
  if (first === undefined) return 1;
  return valid.reduce(
    (best, count) => (Math.abs(count - requested) < Math.abs(best - requested) ? count : best),
    first,
  );
}

export function parseTournamentConfig(params: QueryParams): TournamentDemoConfig {
  const teams = readInt(params, 'teams', TOURNAMENT_RANGES.teams);
  return {
    teams,
    pools: nearestPoolCount(teams, readInt(params, 'pools', TOURNAMENT_RANGES.pools)),
    courts: readInt(params, 'courts', TOURNAMENT_RANGES.courts),
    slots: readInt(params, 'slots', TOURNAMENT_RANGES.slots),
    rest: readInt(params, 'rest', TOURNAMENT_RANGES.rest),
    tiers: readInt(params, 'tiers', TOURNAMENT_RANGES.tiers),
    splitByPoints: readFlag(params, 'split', true),
    stage: readOneOf(params, 'stage', TOURNAMENT_STAGES, 'pools'),
  };
}

export function tournamentQuery(config: TournamentDemoConfig): string {
  return new URLSearchParams({
    teams: String(config.teams),
    pools: String(config.pools),
    courts: String(config.courts),
    slots: String(config.slots),
    rest: String(config.rest),
    tiers: String(config.tiers),
    split: config.splitByPoints ? '1' : '0',
    stage: config.stage,
  }).toString();
}

/* ------------------------------------------------------------------ */
/* League                                                              */
/* ------------------------------------------------------------------ */

export interface LeagueDemoConfig {
  teams: number;
  weeks: number;
  courts: number;
  /** Timeslots per weekly session. Each week gets its own independent grid. */
  slotsPerWeek: number;
  /** 1 = single round-robin, 2 = home and away. */
  legs: number;
  /** Weeks with results in. Everything after this is still to be played. */
  played: number;
  /** As on the tournament: whether a 1-1 match is settled on total points. */
  splitByPoints: boolean;
}

const LEAGUE_RANGES = {
  teams: { min: 4, max: 16, fallback: 8 },
  weeks: { min: 2, max: 20, fallback: 10 },
  courts: { min: 1, max: 4, fallback: 2 },
  slotsPerWeek: { min: 1, max: 4, fallback: 2 },
  legs: { min: 1, max: 2, fallback: 1 },
  played: { min: 0, max: 20, fallback: 4 },
} as const;

export function parseLeagueConfig(params: QueryParams): LeagueDemoConfig {
  const weeks = readInt(params, 'weeks', LEAGUE_RANGES.weeks);
  return {
    teams: readInt(params, 'teams', LEAGUE_RANGES.teams),
    weeks,
    courts: readInt(params, 'courts', LEAGUE_RANGES.courts),
    slotsPerWeek: readInt(params, 'slots', LEAGUE_RANGES.slotsPerWeek),
    legs: readInt(params, 'legs', LEAGUE_RANGES.legs),
    played: clamp(readInt(params, 'played', LEAGUE_RANGES.played), 0, weeks),
    splitByPoints: readFlag(params, 'split', true),
  };
}

export function leagueQuery(config: LeagueDemoConfig): string {
  return new URLSearchParams({
    teams: String(config.teams),
    weeks: String(config.weeks),
    courts: String(config.courts),
    slots: String(config.slotsPerWeek),
    legs: String(config.legs),
    played: String(config.played),
    split: config.splitByPoints ? '1' : '0',
  }).toString();
}

/* ------------------------------------------------------------------ */
/* Drop-in                                                             */
/* ------------------------------------------------------------------ */

export interface DropInDemoConfig {
  /** Everyone who signed up, waitlist included. */
  registered: number;
  /** How many the session holds. Overflow waitlists in sign-up order. */
  capacity: number;
  /** Of those inside the cap, how many did not turn up. */
  noShows: number;
  playersPerSide: number;
  courts: number;
  rounds: number;
  /** Whether players promoted off the waitlist have checked in yet. */
  checkInPromoted: boolean;
}

const DROPIN_RANGES = {
  registered: { min: 4, max: 40, fallback: 22 },
  capacity: { min: 4, max: 40, fallback: 18 },
  noShows: { min: 0, max: 40, fallback: 2 },
  playersPerSide: { min: 2, max: 6, fallback: 4 },
  courts: { min: 1, max: 4, fallback: 2 },
  rounds: { min: 1, max: 8, fallback: 4 },
} as const;

export function parseDropInConfig(params: QueryParams): DropInDemoConfig {
  const registered = readInt(params, 'registered', DROPIN_RANGES.registered);
  const capacity = readInt(params, 'capacity', DROPIN_RANGES.capacity);
  return {
    registered,
    capacity,
    // Only people inside the cap can fail to show; the waitlist never had a place.
    noShows: clamp(
      readInt(params, 'noshows', DROPIN_RANGES.noShows),
      0,
      Math.min(registered, capacity),
    ),
    playersPerSide: readInt(params, 'side', DROPIN_RANGES.playersPerSide),
    courts: readInt(params, 'courts', DROPIN_RANGES.courts),
    rounds: readInt(params, 'rounds', DROPIN_RANGES.rounds),
    checkInPromoted: readFlag(params, 'promoted', false),
  };
}

export function dropInQuery(config: DropInDemoConfig): string {
  return new URLSearchParams({
    registered: String(config.registered),
    capacity: String(config.capacity),
    noshows: String(config.noShows),
    side: String(config.playersPerSide),
    courts: String(config.courts),
    rounds: String(config.rounds),
    promoted: config.checkInPromoted ? '1' : '0',
  }).toString();
}
