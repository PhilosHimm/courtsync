import type { Attendance, Competition, Court, Participant, Session, Timeslot } from '@/lib/core';
import type { DropInRotationOutput, WaitlistPromotion } from '@/lib/scheduling';
import { generateDropInRotation, promoteFromWaitlist } from '@/lib/scheduling';
import type { DropInDemoConfig } from './config';
import { demoCompetition, demoCourts, demoPlayers, demoSession, demoTimeslots } from './data';

/**
 * A drop-in night: capacity, waitlist, who actually turned up, and a rotation
 * decided between rallies.
 *
 * This persona's real problem is not schedule generation — it is the door.
 * So the demo starts at the door: sign-ups past the cap waitlist in arrival
 * order, no-shows free places, `promoteFromWaitlist` fills them strictly in
 * order and renumbers what is left, and only then does a rotation get built
 * from the people actually in the gym.
 *
 * A promoted player becomes `registered`, not `checked_in`. That gap is real
 * and the demo keeps it: being told a place opened up is not the same as
 * walking through the door, and a rotation that assumes otherwise puts four
 * people on a court who are still in the car park.
 */

const SLUG = 'demo-thursday';
const SESSION_ID = 'demo-di-1';
const SESSION_SEQUENCE = 1;
const PLAY_DATE = '2026-09-17';
const GAME_MIN = 20;
const BUFFER_MIN = 5;

export interface DropInDemo {
  config: DropInDemoConfig;
  competition: Competition;
  session: Session;
  courts: Court[];
  timeslots: Timeslot[];
  participants: Participant[];
  /** The door as it stood before anyone was promoted. */
  attendanceBefore: Attendance[];
  /** The door after `promoteFromWaitlist`, and after any check-in of them. */
  attendance: Attendance[];
  promoted: WaitlistPromotion[];
  rotation: DropInRotationOutput;
  /** How many rounds each player sat out. Even is the whole point. */
  sitOutCounts: Record<string, number>;
  nameOf: Record<string, string>;
}

export function buildDropInDemo(config: DropInDemoConfig): DropInDemo {
  const competition = demoCompetition({
    format: 'dropin',
    slug: SLUG,
    name: 'Demo Thursday Drop-In',
    venueName: 'Demo Rec Centre',
    gameDurationMin: GAME_MIN,
    bufferMin: BUFFER_MIN,
    registrationFee: 10,
  });

  const session = demoSession({
    competitionId: competition.id,
    id: SESSION_ID,
    name: 'Session 1',
    playDate: PLAY_DATE,
    startTime: '20:00',
    endTime: '22:00',
    sequence: SESSION_SEQUENCE,
  });

  const courts = demoCourts(competition.id, config.courts);
  const timeslots = demoTimeslots({
    sessionId: SESSION_ID,
    playDate: PLAY_DATE,
    startTime: '20:00',
    count: config.rounds,
    durationMin: GAME_MIN,
    bufferMin: BUFFER_MIN,
  });

  const participants = demoPlayers(competition.id, config.registered);
  const nameOf = Object.fromEntries(participants.map((p) => [p.id, p.name]));

  // Sign-up order is the only fair order at a door, so the cap falls where it
  // falls and the overflow waitlists in the order people arrived. The
  // no-shows are taken off the back of the in-cap group: deterministic, and
  // it is the late sign-ups who most often do not appear.
  const inCap = Math.min(config.registered, config.capacity);
  const firstNoShowIndex = inCap - config.noShows;

  const attendanceBefore: Attendance[] = participants.map((participant, i) => {
    const base = {
      id: `demo-att-${i + 1}`,
      sessionId: SESSION_ID,
      participantId: participant.id,
      recordedAt: '2026-09-17T18:00:00Z',
    };
    if (i >= inCap) {
      return { ...base, status: 'waitlist' as const, waitlistPos: i - inCap + 1 };
    }
    if (i >= firstNoShowIndex) return { ...base, status: 'no_show' as const };
    return { ...base, status: 'checked_in' as const };
  });

  const { promoted, attendance: afterPromotion } = promoteFromWaitlist(
    attendanceBefore,
    config.capacity,
  );

  const promotedIds = new Set(promoted.map((p) => p.participantId));
  const attendance = config.checkInPromoted
    ? afterPromotion.map((entry) =>
        promotedIds.has(entry.participantId) && entry.status === 'registered'
          ? { ...entry, status: 'checked_in' as const }
          : entry,
      )
    : afterPromotion;

  const rotation = generateDropInRotation({
    competitionSlug: SLUG,
    competitionId: competition.id,
    sessionId: SESSION_ID,
    sessionSequence: SESSION_SEQUENCE,
    attendance,
    courtIds: courts.map((c) => c.id),
    timeslotIds: timeslots.map((t) => t.id),
    playersPerSide: config.playersPerSide,
  });

  const sitOutCounts: Record<string, number> = {};
  for (const entry of attendance) {
    if (entry.status === 'checked_in') sitOutCounts[entry.participantId] = 0;
  }
  for (const ids of Object.values(rotation.sittingOut)) {
    for (const id of ids) sitOutCounts[id] = (sitOutCounts[id] ?? 0) + 1;
  }

  return {
    config,
    competition,
    session,
    courts,
    timeslots,
    participants,
    attendanceBefore,
    attendance,
    promoted,
    rotation,
    sitOutCounts,
    nameOf,
  };
}
