import { venueClockLabel } from '@/lib/core';
import type { ScheduleConflict } from '@/lib/scheduling';
import type { EventSnapshot } from './snapshot';

/**
 * One audit conflict as a sentence an organizer can act on at 8:52: who,
 * where, when — in names and venue clock times, never ids.
 */
export function describeConflict(conflict: ScheduleConflict, event: EventSnapshot): string {
  const zone = event.competition.timeZone ?? 'UTC';
  const team = (id: string | null | undefined) =>
    event.participants.find((p) => p.id === id)?.name ?? 'A team';
  const court = (id: string | null | undefined) =>
    event.courts.find((c) => c.id === id)?.name ?? 'a court';
  const when = (slotId: string | null | undefined) => {
    const slot = event.timeslots.find((t) => t.id === slotId);
    return slot ? venueClockLabel(slot.startAt, zone) : 'an unknown time';
  };
  const match = (key: string) => {
    const m = event.matches.find((x) => x.id === key);
    return m ? `${team(m.homeParticipantId)} v ${team(m.awayParticipantId)}` : key;
  };
  switch (conflict.kind) {
    case 'court-double-booked':
      return `${court(conflict.courtId)} has two matches at ${when(conflict.timeslotIds[0])}: ${match(conflict.matchIds[0])} and ${match(conflict.matchIds[1])}.`;
    case 'participant-double-booked':
      return `${team(conflict.participantId)} is in two places at ${when(conflict.timeslotIds[0])}: ${match(conflict.matchIds[0])} and ${match(conflict.matchIds[1])}.`;
    case 'outside-court-window':
      return `${match(conflict.matchId)} is on ${court(conflict.courtId)} at ${when(conflict.timeslotId)}, outside the hours that court is available.`;
    case 'unplaced-match':
      return `${match(conflict.matchId)} has no court or time yet.`;
    case 'insufficient-rest':
      return `${team(conflict.participantId)} gets ${conflict.restSlots} empty slot${conflict.restSlots === 1 ? '' : 's'} between ${match(conflict.matchIds[0])} and ${match(conflict.matchIds[1])} — less rest than you asked for.`;
  }
}
