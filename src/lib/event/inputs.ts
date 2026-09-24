import type { CompetitionFormat, ForfeitPolicy, ParticipantKind, Tiebreaker } from '@/lib/core';

/**
 * What creating an event takes — typed in by the wizard, produced by a
 * starter template or a duplicate, and read back out of a backup.
 */

export interface NewSession {
  name?: string;
  /** YYYY-MM-DD, at the venue. */
  playDate: string;
  /** HH:mm, at the venue. */
  startTime: string;
  endTime: string;
}

export interface NewParticipant {
  name: string;
  kind?: ParticipantKind;
  seed?: number;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  /** Roster names, for a team. A name on a sheet, not an account. */
  players?: string[];
}

export interface NewEventInput {
  name: string;
  format: CompetitionFormat;
  description?: string;
  timeZone: string;
  venue?: { name: string; address?: string };
  registrationFee?: number;
  gameDurationMin: number;
  bufferMin: number;
  poolCount?: number;
  bracketTiers?: string[];
  minRestMin?: number;
  playersPerSide?: number;
  capacity?: number;
  skillLabel?: string;
  forfeitPolicy?: ForfeitPolicy;
  tiebreakerOrder?: Tiebreaker[];
  courts: string[];
  sessions: NewSession[];
  participants: NewParticipant[];
}
