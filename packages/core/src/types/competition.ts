import type { UUID } from './ids';

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

/** The organization running competitions. One person's club, usually. */
export interface Organization {
  id: UUID;
  name: string;
  /** Opaque user id. No FK yet — Neon ships no auth; see docs/DECISIONS.md. */
  createdBy?: UUID;
  createdAt: string;
}

/**
 * The root entity. A tournament, a league season, or a drop-in series.
 *
 * `registrationFee` is what the organizer charges participants — CourtSync
 * never processes it, it only tracks who has paid. See `Transaction`.
 */
export interface Competition {
  id: UUID;
  organizationId: UUID;
  name: string;
  /** URL-safe, unique within the organization. */
  slug: string;
  format: CompetitionFormat;
  venueName?: string;
  registrationFee?: number;
  gameDurationMin: number;
  bufferMin: number;
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

export interface Court {
  id: UUID;
  competitionId: UUID;
  name: string;
  isActive: boolean;
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
