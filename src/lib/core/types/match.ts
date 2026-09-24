import type { UUID } from './ids';

/**
 * `delayed` and `cancelled` are things that happen in a real gym: a match
 * pushed back behind one that overran, and a match that will not be played
 * at all. Neither had a status, so both were recorded as `scheduled` — and a
 * schedule that lies about what is happening is worse than one that admits
 * it.
 *
 * Order matches the `match_status` enum in sql/, and `test/core/schema.test.ts`
 * holds the two together.
 */
export type MatchStatus = 'scheduled' | 'live' | 'final' | 'forfeit' | 'delayed' | 'cancelled';

export const MATCH_STATUSES: readonly MatchStatus[] = [
  'scheduled',
  'live',
  'final',
  'forfeit',
  'delayed',
  'cancelled',
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

/**
 * One change to one set's score, appended and never rewritten.
 *
 * Append-only for the reason the transaction ledger is (rule 8): an
 * organizer who changes a score at 4pm has to be able to say what it was at
 * 3pm and who changed it. A correction is a new row.
 *
 * `previousHome` / `previousAway` are null for the first recording of a set,
 * because an edit from nothing is not an edit from 0-0 — that would be a
 * score nobody played. `nextHome` / `nextAway` are null when a set is
 * removed — a third set typed into a match that ended 2-0 — for the same
 * reason in the other direction.
 */
export interface MatchSetEdit {
  id: UUID;
  matchId: UUID;
  setNumber: number;
  previousHome: number | null;
  previousAway: number | null;
  nextHome: number | null;
  nextAway: number | null;
  reason?: string;
  /** The organizer who made the edit, when it was made signed in. */
  editedBy?: UUID;
  /**
   * The per-match score link it came through, when a scorekeeper made it.
   * A scorekeeper has no account, so this is how "from which link" is kept.
   */
  viaLinkId?: UUID;
  editedAt: string;
}
