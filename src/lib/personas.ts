import type { CompetitionFormat } from '@/lib/core';

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

/**
 * One row of the build box score: a real exported function, and the number of
 * passing tests behind it.
 *
 * These counts are not decorative and must not be rounded, estimated or
 * padded. Each is the function's own spec suite plus its block in
 * `test/scheduling/edge-cases.test.ts`. To re-derive them all after changing
 * a suite:
 *
 *   npx vitest run --reporter=json --outputFile=.vitest-report.json
 *
 * then count `assertionResults` grouped by `ancestorTitles[0]`. The stale
 * copy this replaced is the reason the rule exists: understating what shipped
 * is as dishonest as overstating it, and nothing tied the words to the tests.
 */
export interface CoverageRow {
  /** The exported function, spelled exactly as it is in src/lib/scheduling. */
  fn: string;
  /** What it does, in the organizer's words rather than the codebase's. */
  gloss: string;
  /** Passing tests behind it: its spec suite plus its edge-case block. */
  tests: number;
  /**
   * Set when another persona's area runs on this same function. The whole
   * positioning claim is one model serving three formats — where that is
   * literally true, the box score should say so rather than quietly
   * repeating a row.
   */
  sharedWith?: string;
}

/** The end-to-end suite that runs this format start to finish. */
export interface EndToEnd {
  /** The describe block's name in test/scheduling/integration.test.ts. */
  suite: string;
  tests: number;
}

export interface RhythmTick {
  /** Whether this tick is "lit" — a moment this persona actually opens the app. */
  lit: boolean;
}

export interface Persona {
  id: PersonaId;
  route: string;
  /**
   * This persona's format, running in demo mode. Not the same page as
   * `route`: that one explains who the area is for, this one runs the engine
   * on invented data and saves nothing. See src/lib/demo.
   */
  demoRoute: string;
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
  /** What is genuinely built, with the test counts that prove it. */
  status: {
    coverage: CoverageRow[];
    endToEnd: EndToEnd;
    /** Honest gaps. No hedging, no "coming soon". */
    notYet: string[];
  };
}

const litPattern = (indices: number[], length = 12): RhythmTick[] =>
  Array.from({ length }, (_, i) => ({ lit: indices.includes(i) }));

export const PERSONAS: readonly Persona[] = [
  {
    id: 'tournament',
    route: '/tournaments',
    demoRoute: '/demo/tournament',
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
      // Each row is its spec suite plus its edge-case block. Re-derive with
      // the one-liner on CoverageRow after changing a suite.
      coverage: [
        { fn: 'drawPools', gloss: 'Seeded teams split into balanced pools', tests: 27 },
        { fn: 'generatePoolPlay', gloss: 'Pools drawn, round by round', tests: 23 },
        { fn: 'assignReferees', gloss: 'Referees, never on two courts at once', tests: 15 },
        {
          fn: 'computeStandings',
          gloss: 'Standings computed on read, penalties and forfeit policy included',
          tests: 37,
          sharedWith: 'the league season',
        },
        {
          fn: 'explainStandings',
          gloss: 'Says why each team sits above the one below it',
          tests: 11,
          sharedWith: 'the league season',
        },
        {
          fn: 'standingsMovement',
          gloss: 'Which rows a result just moved, and by how far',
          tests: 5,
          sharedWith: 'the league season',
        },
        {
          fn: 'seedBrackets',
          gloss: 'Bracket seeded — your shape or ours — then advanced as results land',
          tests: 59,
        },
        {
          fn: 'bracketDrift',
          gloss: 'Says which quarterfinals a corrected score just moved',
          tests: 7,
        },
        { fn: 'findBreaks', gloss: 'The lunch break, read back out of the grid', tests: 13 },
        {
          fn: 'auditSchedule',
          gloss: 'After a hand-moved match: collisions on a court, a team or a referee',
          tests: 21,
        },
        {
          fn: 'suggestSlots',
          gloss: 'Where a conflicted match could legally move instead',
          tests: 16,
        },
        {
          fn: 'setFormatOf',
          gloss: 'What each match is played to — the competition’s own rules',
          tests: 26,
        },
        { fn: 'isSelfRefereed', gloss: 'A self-reffed match says so instead of nothing', tests: 4 },
      ],
      endToEnd: { suite: 'a full tournament, start to champion', tests: 5 },
      notYet: [
        'The setup wizard',
        'A live schedule board to run the day from',
        'Referees for bracket matches — assignReferees staffs pool play only',
        'Anything that saves — no database is wired up',
      ],
    },
  },
  {
    id: 'league',
    route: '/leagues',
    demoRoute: '/demo/league',
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
      // 9 spec + 7 edges, 10 + 7. Verify with `npm test`.
      coverage: [
        { fn: 'generateLeagueFixtures', gloss: 'A season of fixtures, week by week', tests: 19 },
        {
          fn: 'computeStandings',
          gloss: 'Standings computed on read, penalties and forfeit policy included',
          tests: 37,
          sharedWith: 'the tournament bracket',
        },
        {
          fn: 'explainStandings',
          gloss: 'Says why each team sits above the one below it',
          tests: 11,
          sharedWith: 'the tournament bracket',
        },
        {
          fn: 'standingsMovement',
          gloss: 'Which rows a result just moved, and by how far',
          tests: 5,
          sharedWith: 'the tournament bracket',
        },
      ],
      endToEnd: { suite: 'a full league season', tests: 2 },
      notYet: [
        'Moving a week from the UI, rather than in code',
        'A standings page the teams can read',
        'Anything that saves — no database is wired up',
      ],
    },
  },
  {
    id: 'dropin',
    route: '/dropins',
    demoRoute: '/demo/dropins',
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
      // 9 spec + 4 edges, 4 + 4. Verify with `npm test`.
      coverage: [
        {
          fn: 'generateDropInRotation',
          gloss: 'Rotation that will not sit the same person twice',
          tests: 14,
        },
        {
          fn: 'promoteFromWaitlist',
          gloss: 'Waitlist promoted in the order people arrived',
          tests: 8,
        },
      ],
      endToEnd: { suite: 'a drop-in night', tests: 1 },
      notYet: ['The courtside check-in view', 'Anything that saves — no database is wired up'],
    },
  },
] as const;

export function getPersona(id: PersonaId): Persona {
  const persona = PERSONAS.find((p) => p.id === id);
  if (!persona) throw new Error(`Unknown persona: ${id}`);
  return persona;
}
