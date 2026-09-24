import type {
  Announcement,
  Attendance,
  Competition,
  CompetitionSetFormat,
  Court,
  CourtWindow,
  Match,
  MatchSetEdit,
  Participant,
  Session,
  TeamPlayer,
  Timeslot,
  Transaction,
  UUID,
  Venue,
} from '@/lib/core';

/**
 * Everything one event holds, as the domain types — what the data layer
 * loads, what the pages render from, and what a JSON backup contains.
 *
 * `matches[].id` is the engine's match key from `match-ids.ts`, never the
 * row's uuid. The uuid is the database's business; the key is what every
 * scheduling function speaks (C3).
 */
export interface EventSnapshot {
  competition: Competition;
  venue: Venue | null;
  /** The venue's courts this event uses, in name order. */
  courts: Court[];
  courtWindows: CourtWindow[];
  /** In sequence order, then date. */
  sessions: Session[];
  /** In start order. */
  timeslots: Timeslot[];
  pools: Array<{ id: UUID; name: string; participantIds: UUID[] }>;
  participants: Participant[];
  teamPlayers: TeamPlayer[];
  matches: Match[];
  attendance: Attendance[];
  transactions: Transaction[];
  setFormats: CompetitionSetFormat[];
  scoreEdits: MatchSetEdit[];
  announcements: Announcement[];
}

/** An event as a list shows it. */
export interface EventSummary {
  id: UUID;
  name: string;
  slug: string;
  format: Competition['format'];
  status: NonNullable<Competition['status']>;
  role: 'owner' | 'co_organizer';
  firstPlayDate: string | null;
  createdAt: string;
}
