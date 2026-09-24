import type { UUID } from './ids';
import type { ForfeitPolicy, Tiebreaker } from './standings';

/**
 * The three formats CourtSync supports. Every competition is exactly one of
 * these, and the discriminator drives which scheduling strategy applies.
 *
 * This enum is the reason `Competition` exists rather than `Tournament`:
 * a league has no pools and twelve dates, a drop-in has no fixed teams.
 */
export type CompetitionFormat = 'tournament' | 'league' | 'dropin';

export const COMPETITION_FORMATS: readonly CompetitionFormat[] = [
  'tournament',
  'league',
  'dropin',
] as const;

/**
 * A place with courts, reused across events.
 *
 * Promoted from the `venueName` string that used to sit on `Competition`.
 * An organizer describes their gym once — its courts, and when each of them
 * is actually available — and every competition there reuses it. A string
 * could not hold any of that.
 */
export interface Venue {
  id: UUID;
  name: string;
  address?: string;
  /** Opaque user id. No FK yet — Neon ships no auth; see docs/DECISIONS.md. */
  createdBy?: UUID;
  createdAt: string;
}

/**
 * The root entity. A tournament, a league season, or a drop-in series.
 *
 * `registrationFee` is what the organizer charges participants — CourtSync
 * never processes it, it only tracks who has paid. See `Transaction`.
 *
 * An event hangs off the user who created it. There is no `Organization`:
 * a club with several organizers is served by the co-organizer role, and the
 * tenant table was buying nothing but a join on every query.
 */
export interface Competition {
  id: UUID;
  name: string;
  /** URL-safe, unique per owner. Two organizers may both run a "spring-classic". */
  slug: string;
  format: CompetitionFormat;
  /** Opaque user id. No FK yet — Neon ships no auth; see docs/DECISIONS.md. */
  createdBy?: UUID;
  venueId?: UUID;
  registrationFee?: number;
  gameDurationMin: number;
  bufferMin: number;
  /**
   * How much of a forfeit reaches the table. Per event, because it is
   * usually written on the rules sheet rather than being the engine's call.
   * Undefined means the engine's default.
   */
  forfeitPolicy?: ForfeitPolicy;
  /**
   * The organizer's tiebreaker order, most significant first. Undefined
   * means `TIEBREAKER_ORDER` — which is not the same as an empty array.
   */
  tiebreakerOrder?: readonly Tiebreaker[];
  createdAt: string;
}

/**
 * One date of play. This single entity is what makes leagues and drop-ins
 * expressible at all:
 *
 * - tournament -> exactly one session
 * - league     -> one session per week for a season
 * - dropin     -> one session per occurrence, open-ended
 *
 * Timeslots hang off a session, not off the competition, so a league's
 * week 3 has its own grid independent of week 4.
 */
export interface Session {
  id: UUID;
  competitionId: UUID;
  /** e.g. "Week 3" or "Finals Day". Optional for single-session tournaments. */
  name?: string;
  /** ISO date, YYYY-MM-DD. */
  playDate: string;
  /** Local wall-clock time, HH:mm. */
  startTime: string;
  endTime: string;
  /** 1-based ordering within the competition. */
  sequence?: number;
}

/**
 * A court belongs to its venue, not to the competition using it tonight.
 *
 * `isActive` is about the court being out of service — a fact about the
 * venue. Which of a venue's courts one event has is a different question,
 * answered by the `competition_court` join, because a gym with four courts
 * where tonight's league only has two is the ordinary case.
 */
export interface Court {
  id: UUID;
  venueId: UUID;
  name: string;
  isActive: boolean;
}

/**
 * When a court is actually available on a given session.
 *
 * "Court 3 is only ours until noon." The constraint arrives per day of play
 * rather than in the abstract, which is why this hangs off a session as well
 * as a court. No windows for a court means no restriction — the common case
 * is a court free all session, and making an organizer say so would be a
 * form nobody fills in correctly.
 *
 * Absolute timestamps, never display strings, for the reason `Timeslot`
 * gives (C4).
 */
export interface CourtWindow {
  id: UUID;
  courtId: UUID;
  sessionId: UUID;
  startAt: string;
  endAt: string;
}

/**
 * A schedulable slot on a given session.
 *
 * `startAt` / `endAt` are absolute timestamps, deliberately NOT display
 * strings. Audit finding C4: scoop sorted matches by a 12-hour display
 * string, so "12:00 AM" sorted before "12:00 PM" and a tournament's final
 * appeared above its opening match. Sort on these fields, never on a label.
 */
export interface Timeslot {
  id: UUID;
  sessionId: UUID;
  startAt: string;
  endAt: string;
}

/** Pool play grouping. Tournaments use these; leagues and drop-ins usually do not. */
export interface Pool {
  id: UUID;
  competitionId: UUID;
  name: string;
}

/**
 * Which phase of a competition a rule applies to.
 *
 * Mirrors the `match_phase` enum. `matchPhaseOf` in the scheduling package
 * derives the same answer from a match; this is the stored side of it, used
 * to say which set format an organizer chose for each phase.
 */
export type MatchPhase = 'pool' | 'playoff';

export const MATCH_PHASES: readonly MatchPhase[] = ['pool', 'playoff'] as const;

/**
 * One set of a competition's chosen format, for one phase.
 *
 * A row per set rather than a count plus one target: a best-of-three played
 * to 25, 25 and 15 is three different targets, and every format that ends in
 * a short decider has the same shape. No rows for a phase means the engine's
 * default for that phase.
 */
export interface CompetitionSetFormat {
  id: UUID;
  competitionId: UUID;
  phase: MatchPhase;
  /** 1-based, ordered. */
  setNumber: number;
  target: number;
  winBy: number;
  /** Null means play on until `winBy` is satisfied — no ceiling. */
  cap: number | null;
}
