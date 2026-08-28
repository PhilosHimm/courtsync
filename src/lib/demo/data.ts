import type {
  Competition,
  CompetitionFormat,
  Court,
  Participant,
  Session,
  Timeslot,
} from '@/lib/core';

/**
 * The invented material the demo runs on.
 *
 * PRODUCT.md is explicit that nothing in this project may present invented
 * data as real: there are no rosters, no results and no users yet. So every
 * name here is deliberately, visibly a placeholder — "Team C", "Player 07",
 * "Demo Gym" — and every id carries a `demo-` prefix so that a scenario
 * copied out of the demo as JSON is self-identifying wherever it lands.
 *
 * Nothing here reads a clock. The dates are fixed, which is what lets a
 * copied link reproduce the same schedule for whoever opens it, and keeps
 * this layer honest about the engine's own determinism (rule 9).
 *
 * This is deliberately NOT `src/lib/core/testing/fixtures.ts`. Those builders
 * say on their first line that application code must never import them: they
 * exist to prove the model holds three formats, and their shapes are pinned
 * by `test/core/formats.test.ts`. Sharing them would couple what a page
 * renders to what a model regression test asserts, and the first product
 * tweak to the demo would fail a suite that is about something else.
 */

export const DEMO_ORG_ID = 'demo-org';

/**
 * Shown on every demo page. One sentence, and it has to keep saying the
 * quiet part: this is not a record of anything that happened.
 */
export const DEMO_NOTICE =
  'Demo mode — every team, player and score below is invented, and nothing here is saved.';

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** `0 -> A`, `25 -> Z`, `26 -> AA`. Readable in a standings table at any size. */
export function teamLabel(index: number): string {
  let label = '';
  let n = index;
  do {
    label = `${LETTERS[n % 26] ?? '?'}${label}`;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return label;
}

export const pad2 = (n: number): string => String(n).padStart(2, '0');

/** Add whole days to an ISO date without tripping over month ends. */
export function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** `'09:00'` plus minutes, as `HH:mm`. Pure clock arithmetic, no Date needed. */
export function addMinutes(clock: string, minutes: number): string {
  const [h = '0', m = '0'] = clock.split(':');
  const total = Number.parseInt(h, 10) * 60 + Number.parseInt(m, 10) + minutes;
  const wrapped = ((total % 1440) + 1440) % 1440;
  return `${pad2(Math.floor(wrapped / 60))}:${pad2(wrapped % 60)}`;
}

export function demoCompetition(args: {
  format: CompetitionFormat;
  slug: string;
  name: string;
  venueName: string;
  gameDurationMin: number;
  bufferMin: number;
  registrationFee: number;
}): Competition {
  return {
    id: `demo-${args.format}`,
    organizationId: DEMO_ORG_ID,
    name: args.name,
    slug: args.slug,
    format: args.format,
    venueName: args.venueName,
    registrationFee: args.registrationFee,
    gameDurationMin: args.gameDurationMin,
    bufferMin: args.bufferMin,
    createdAt: '2026-01-01T00:00:00Z',
  };
}

export function demoCourts(competitionId: string, count: number): Court[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `demo-court-${i + 1}`,
    competitionId,
    name: `Court ${i + 1}`,
    isActive: true,
  }));
}

export function demoTeams(competitionId: string, count: number): Participant[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `demo-team-${teamLabel(i).toLowerCase()}`,
    competitionId,
    kind: 'team' as const,
    name: `Team ${teamLabel(i)}`,
    // Every team is seeded so the pool draw has something to snake on. An
    // organizer usually seeds only the teams they know; that partially-seeded
    // case is `drawPools`' own spec to cover, not the demo's to illustrate.
    seed: i + 1,
    registeredAt: '2026-01-01T00:00:00Z',
  }));
}

export function demoPlayers(competitionId: string, count: number): Participant[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `demo-player-${pad2(i + 1)}`,
    competitionId,
    kind: 'individual' as const,
    name: `Player ${pad2(i + 1)}`,
    registeredAt: '2026-01-01T00:00:00Z',
  }));
}

/**
 * A session's grid of timeslots.
 *
 * `startAt` / `endAt` are absolute timestamps and the UI sorts on them, never
 * on the label beside them — audit finding C4 put a tournament's final above
 * its opening match by sorting "12:00 PM" as a string.
 */
export function demoTimeslots(args: {
  sessionId: string;
  playDate: string;
  startTime: string;
  count: number;
  durationMin: number;
  bufferMin: number;
}): Timeslot[] {
  const { sessionId, playDate, startTime, count, durationMin, bufferMin } = args;
  return Array.from({ length: count }, (_, i) => {
    const start = addMinutes(startTime, i * (durationMin + bufferMin));
    return {
      id: `demo-ts-${sessionId}-${i + 1}`,
      sessionId,
      startAt: `${playDate}T${start}:00Z`,
      endAt: `${playDate}T${addMinutes(start, durationMin)}:00Z`,
    };
  });
}

export function demoSession(args: {
  competitionId: string;
  id: string;
  name?: string;
  playDate: string;
  startTime: string;
  endTime: string;
  sequence: number;
}): Session {
  const { competitionId, id, name, playDate, startTime, endTime, sequence } = args;
  return name === undefined
    ? { id, competitionId, playDate, startTime, endTime, sequence }
    : { id, competitionId, name, playDate, startTime, endTime, sequence };
}

/** The 12-hour label a gym clock shows. For display only — never a sort key. */
export function clockLabel(isoTimestamp: string): string {
  const time = isoTimestamp.slice(11, 16);
  const [h = '0', m = '00'] = time.split(':');
  const hour = Number.parseInt(h, 10);
  const suffix = hour < 12 ? 'am' : 'pm';
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  return `${twelve}:${m}${suffix}`;
}
