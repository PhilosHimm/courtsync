import type { UUID } from './ids';

export type MatchStatus = 'scheduled' | 'live' | 'final' | 'forfeit';

export const MATCH_STATUSES: readonly MatchStatus[] = [
  'scheduled',
  'live',
  'final',
  'forfeit',
] as const;

/**
 * One set within a match.
 *
 * Set-level scoring is why this entity exists. scoop's schema had a single
 * `score_a` / `score_b` pair per match, so a match that went 25-20, 22-25,
 * 15-13 had nowhere to live.
 */
export interface MatchSet {
  id: UUID;
  matchId: UUID;
  /** 1-based. Unique per match. */
  setNumber: number;
  homePoints: number;
  awayPoints: number;
}

/**
 * A single game between two participants.
 *
 * `bracket` and `roundLabel` are free text rather than an enum: a tournament
 * uses "gold"/"silver"/"bronze", a league uses "Week 3", a drop-in uses
 * nothing. Hard-coding the tournament vocabulary here is what made the old
 * model unable to hold a league.
 */
export interface Match {
  id: UUID;
  competitionId: UUID;
  sessionId: UUID;
  poolId?: UUID | null;
  courtId?: UUID | null;
  timeslotId?: UUID | null;
  homeParticipantId?: UUID | null;
  awayParticipantId?: UUID | null;
  /** The participant refereeing. Never one of the two playing. */
  refParticipantId?: UUID | null;
  bracket?: string | null;
  roundLabel?: string | null;
  status: MatchStatus;
  sets: MatchSet[];
}
