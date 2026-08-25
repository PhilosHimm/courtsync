import type { CompetitionFormat } from '@courtsync/core';

/**
 * The single source of truth for how the three personas are presented in
 * this app. Keep this in sync with PRODUCT.md's Users section — that file
 * is the canonical record; this is its UI-sized restatement.
 *
 * CourtSync serves three personas, one per format (docs/SCOPE.md). They are
 * not one operator wearing three hats: they share the same material —
 * courts, time slots, participants, matches — but work at genuinely
 * different rhythms, and that rhythm is what the UI has to respect.
 */

export type PersonaId = CompetitionFormat;

export interface RhythmTick {
  /** Whether this tick is "lit" — a moment this persona actually opens the app. */
  lit: boolean;
}

export interface Persona {
  id: PersonaId;
  route: string;
  /** e.g. "Tournament organizer" */
  title: string;
  /** One line, said the way the person would describe their own job. */
  role: string;
  /** What today looks like without this tool. Not invented — from the interview behind PRODUCT.md. */
  today: string;
  /** The single thing that matters most when they open the app. */
  peakNeed: string;
  /** Cadence label shown next to the rhythm pulse, e.g. "a few times a year". */
  cadence: string;
  /** 12-tick rhythm visualization — see RhythmPulse. Real cadence, not decoration. */
  rhythm: RhythmTick[];
  /** Narrative paragraph for the area page — grounded, specific, no invented stats. */
  story: string;
  /** What's genuinely usable today vs. still being built. Never overstate. */
  status: {
    done: string[];
    building: string[];
  };
}

const litPattern = (indices: number[], length = 12): RhythmTick[] =>
  Array.from({ length }, (_, i) => ({ lit: indices.includes(i) }));

export const PERSONAS: readonly Persona[] = [
  {
    id: 'tournament',
    route: '/tournaments',
    title: 'Tournament organizer',
    role: 'Runs a one-day event — pool play into a bracket.',
    today: 'The grid lives in a spreadsheet, rebuilt from a copy of last time.',
    peakNeed:
      'Generate a schedule fast, then change it under pressure without breaking referee assignments.',
    cadence: 'A few times a year',
    // Sparse: this persona opens the tool a handful of times across a year.
    rhythm: litPattern([1, 5, 9]),
    story:
      'Two teams no-show at 8:52, eight minutes before the first whistle, and the grid you built last week has to move — courts, referees, and the pool standings underneath it — while forty people wait by the sign-in table.',
    status: {
      done: [
        'Domain model for pools, courts, timeslots and brackets',
        'Set-level scoring and computed standings, spec’d',
      ],
      building: [
        'Pool play and bracket seeding algorithms',
        'The setup wizard and live schedule board',
      ],
    },
  },
  {
    id: 'league',
    route: '/leagues',
    title: 'League convener',
    role: 'Runs a season — one night a week, fixed teams.',
    today: 'Fixtures and standings get posted to a group chat and re-typed by hand each week.',
    peakNeed:
      'Fixtures that survive rescheduling, and standings that stay correct without manual upkeep.',
    cadence: 'Every week',
    // Weekly: a steady, repeating beat across the season.
    rhythm: litPattern([0, 2, 4, 6, 8, 10]),
    story:
      'A team emails on Tuesday to say they can’t make week six. The fixture list has to move without quietly breaking every week after it, and by Thursday the standings need to already reflect it — nobody wants to hear "let me recalculate that."',
    status: {
      done: [
        'Session model — each week gets its own independent court grid',
        'Standings tiebreaker order carried over from the original spec',
      ],
      building: [
        'Season-long fixture generation',
        'Rescheduling a single week without touching the rest',
      ],
    },
  },
  {
    id: 'dropin',
    route: '/dropins',
    title: 'Drop-in host',
    role: 'Runs a recurring session — individuals, not teams.',
    today: 'A paper sheet at the door. Capacity is counted by eye and the waitlist is memory.',
    peakNeed:
      'Capacity and attendance, then a fair rotation that doesn’t sit the same person twice in a row.',
    cadence: 'Every session, mid-play',
    // Constant: this is the persona actually holding the phone during play.
    rhythm: litPattern([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]),
    story:
      'Twenty people, two courts, standing on the sideline with a phone. Who’s checked in, who’s next off the waitlist, and who sat out last rotation — decided between rallies, one-handed, without breaking stride.',
    status: {
      done: [
        'Attendance model — registered, waitlisted, checked in, no-show',
        'Capacity and waitlist promotion, spec’d',
      ],
      building: ['The rotation algorithm itself', 'A courtside check-in view'],
    },
  },
] as const;

export function getPersona(id: PersonaId): Persona {
  const persona = PERSONAS.find((p) => p.id === id);
  if (!persona) throw new Error(`Unknown persona: ${id}`);
  return persona;
}
