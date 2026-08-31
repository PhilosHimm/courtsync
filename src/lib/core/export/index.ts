import type {
  Attendance,
  Court,
  Match,
  Participant,
  Pool,
  Session,
  Standing,
  TeamPlayer,
  Timeslot,
  UUID,
} from '../types/index';
import { setsWon, sortSets } from '../utils/index';

/**
 * CSV exports — the data walking out the door on purpose.
 *
 * The claim CourtSync makes against the paper sheet and the group chat is
 * that the record outlives the session (PRODUCT.md). Half of that is storage;
 * the other half is that the organizer can take the record with them — into
 * the spreadsheet they still trust, onto a printout taped to the gym door,
 * into whatever comes after this tool. An export is also the honest fallback
 * for everything CourtSync deliberately does not do.
 *
 * Everything here is a pure function from domain rows to a string. Timestamps
 * are exported as the absolute ISO values they are stored as, never as
 * 12-hour display labels — a spreadsheet sorting "12:00 PM" above "9:00 AM"
 * is exactly the C4 bug, exported. Formatting for humans is the reader's job.
 *
 * A dangling reference — a match naming a court that was not handed in —
 * raises rather than exporting a blank. A silently incomplete export looks
 * like a complete one, and this file exists to be trusted.
 */

/** What a CSV cell can hold. `null` and `undefined` both export as empty. */
export type CsvValue = string | number | null | undefined;

/** RFC 4180: CRLF line endings, fields quoted only when they need to be. */
const CRLF = '\r\n';

function csvCell(value: CsvValue): string {
  if (value === null || value === undefined) return '';
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * Assemble a CSV document from a header and rows. Quoting and line endings
 * follow RFC 4180 (double-quote escaping, CRLF), which is what spreadsheet
 * applications expect a `.csv` to be. The document ends with a final CRLF.
 */
export function toCsv(header: readonly string[], rows: ReadonlyArray<readonly CsvValue[]>): string {
  return [header, ...rows].map((row) => row.map(csvCell).join(',')).join(CRLF) + CRLF;
}

/** Deterministic name order, ties broken on id — never locale-dependent. */
function byName(a: { name: string; id: UUID }, b: { name: string; id: UUID }): number {
  if (a.name !== b.name) return a.name < b.name ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** Sorted on `startAt`, then `endAt`, then id (C4: timestamps, never labels). */
function byStart(a: Timeslot, b: Timeslot): number {
  if (a.startAt !== b.startAt) return a.startAt < b.startAt ? -1 : 1;
  if (a.endAt !== b.endAt) return a.endAt < b.endAt ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function lookup<T extends { id: UUID }>(rows: readonly T[], what: string): (id: UUID) => T {
  const byId = new Map<UUID, T>(rows.map((row) => [row.id, row]));
  return (id) => {
    const row = byId.get(id);
    if (!row) throw new Error(`Cannot export: unknown ${what} id ${id}.`);
    return row;
  };
}

/**
 * The entry list: every participant with their seed and contact details.
 * Ordered by name — predictable to somebody reading it against the signup
 * sheet, which registration order is not.
 */
export function participantsToCsv(participants: readonly Participant[]): string {
  const ordered = [...participants].sort(byName);
  return toCsv(
    [
      'name',
      'kind',
      'seed',
      'contactName',
      'contactEmail',
      'contactPhone',
      'registeredAt',
      'notes',
    ],
    ordered.map((p) => [
      p.name,
      p.kind,
      p.seed,
      p.contactName,
      p.contactEmail,
      p.contactPhone,
      p.registeredAt,
      p.notes,
    ]),
  );
}

/**
 * Team rosters: one row per name on a sheet. This is the whole of what a
 * roster is here — a name and maybe a jersey number, never an identity
 * (SCOPE.md rules out player profiles), so this export is the scoresheet
 * view and nothing more.
 */
export function rosterToCsv(teams: readonly Participant[], players: readonly TeamPlayer[]): string {
  const teamOf = lookup(teams, 'team participant');
  const ordered = [...players].sort((a, b) => {
    const cmp = byName(teamOf(a.participantId), teamOf(b.participantId));
    if (cmp !== 0) return cmp;
    if (a.name !== b.name) return a.name < b.name ? -1 : 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
  return toCsv(
    ['team', 'player', 'jerseyNumber'],
    ordered.map((p) => [teamOf(p.participantId).name, p.name, p.jerseyNumber]),
  );
}

export interface ScheduleCsvInput {
  matches: readonly Match[];
  sessions: readonly Session[];
  timeslots: readonly Timeslot[];
  courts: readonly Court[];
  participants: readonly Participant[];
  /** Needed only when matches carry pool ids; a match naming a pool not given here raises. */
  pools?: readonly Pool[];
}

/**
 * The grid as rows: chronological by slot timestamp, then court name, then
 * match id. Matches not yet placed on the grid come last, with their time and
 * court columns empty — an export that quietly dropped them would look
 * finished while hiding the matches that most need attention.
 */
export function scheduleToCsv(input: ScheduleCsvInput): string {
  const sessionOf = lookup(input.sessions, 'session');
  const slotOf = lookup(input.timeslots, 'timeslot');
  const courtOf = lookup(input.courts, 'court');
  const poolOf = lookup(input.pools ?? [], 'pool');
  const participantOf = lookup(input.participants, 'participant');
  const name = (id: UUID | null | undefined): string => (id == null ? '' : participantOf(id).name);

  const placed = input.matches.filter((m) => m.courtId != null && m.timeslotId != null);
  const unplaced = input.matches.filter((m) => m.courtId == null || m.timeslotId == null);

  const orderedPlaced = [...placed].sort((a, b) => {
    const cmp = byStart(slotOf(a.timeslotId ?? ''), slotOf(b.timeslotId ?? ''));
    if (cmp !== 0) return cmp;
    const courtCmp = byName(courtOf(a.courtId ?? ''), courtOf(b.courtId ?? ''));
    if (courtCmp !== 0) return courtCmp;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
  const orderedUnplaced = [...unplaced].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const row = (m: Match): CsvValue[] => {
    const session = sessionOf(m.sessionId);
    const slot = m.timeslotId == null ? null : slotOf(m.timeslotId);
    return [
      session.name,
      session.playDate,
      slot?.startAt,
      slot?.endAt,
      m.courtId == null ? '' : courtOf(m.courtId).name,
      m.poolId == null ? '' : poolOf(m.poolId).name,
      m.roundLabel,
      m.bracket,
      name(m.homeParticipantId),
      name(m.awayParticipantId),
      name(m.refParticipantId),
      m.status,
      m.id,
    ];
  };

  return toCsv(
    [
      'session',
      'date',
      'startAt',
      'endAt',
      'court',
      'pool',
      'round',
      'bracket',
      'home',
      'away',
      'referee',
      'status',
      'matchId',
    ],
    [...orderedPlaced.map(row), ...orderedUnplaced.map(row)],
  );
}

export interface ResultsCsvInput {
  matches: readonly Match[];
  participants: readonly Participant[];
}

/**
 * What happened: one row per finished match (`final` or `forfeit`), with one
 * pair of columns per set. The set column count is whatever the widest match
 * needed, so a day of two-set pool play exports two pairs and a day with a
 * playoff exports three. Ordered by match id, whose scheme already encodes
 * pool and bracket position (see match-ids.ts).
 */
export function resultsToCsv(input: ResultsCsvInput): string {
  const participantOf = lookup(input.participants, 'participant');
  const name = (id: UUID | null | undefined): string => (id == null ? '' : participantOf(id).name);

  const finished = input.matches
    .filter((m) => m.status === 'final' || m.status === 'forfeit')
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const maxSets = finished.reduce((max, m) => Math.max(max, m.sets.length), 0);
  const setHeaders = Array.from({ length: maxSets }, (_, i) => [
    `set${i + 1}Home`,
    `set${i + 1}Away`,
  ]).flat();

  return toCsv(
    [
      'matchId',
      'round',
      'bracket',
      'home',
      'away',
      'status',
      ...setHeaders,
      'setsHome',
      'setsAway',
    ],
    finished.map((m) => {
      const ordered = sortSets(m.sets);
      const setCells = Array.from({ length: maxSets }, (_, i) => {
        const set = ordered[i];
        return [set?.homePoints, set?.awayPoints];
      }).flat();
      const won = setsWon(m);
      return [
        m.id,
        m.roundLabel,
        m.bracket,
        name(m.homeParticipantId),
        name(m.awayParticipantId),
        m.status,
        ...setCells,
        won.home,
        won.away,
      ];
    }),
  );
}

/**
 * A standings table, exactly as computed. The rows come from
 * `computeStandings` and are exported in the order handed in — re-sorting
 * here would be a second ranking disagreeing with the first, and there is
 * deliberately nowhere stored to read standings from (rule 1, H9).
 */
export function standingsToCsv(standings: readonly Standing[]): string {
  return toCsv(
    [
      'rank',
      'participant',
      'wins',
      'losses',
      'winPercentage',
      'setsWon',
      'setsLost',
      'setDifferential',
      'pointsFor',
      'pointsAgainst',
      'pointDifferential',
      'pointAdjustment',
    ],
    standings.map((s) => [
      s.rank,
      s.participantName,
      s.wins,
      s.losses,
      s.winPercentage,
      s.setsWon,
      s.setsLost,
      s.setDifferential,
      s.pointsFor,
      s.pointsAgainst,
      s.pointDifferential,
      s.pointAdjustment,
    ]),
  );
}

export interface AttendanceCsvInput {
  attendance: readonly Attendance[];
  sessions: readonly Session[];
  participants: readonly Participant[];
}

/**
 * The signup sheet that does not go in the bin at the end of the night.
 * Ordered by session (date, then sequence), then participant name; the
 * waitlist position is a column rather than an ordering, so the spreadsheet
 * can answer either "who was here" or "who was next" without re-export.
 */
export function attendanceToCsv(input: AttendanceCsvInput): string {
  const sessionOf = lookup(input.sessions, 'session');
  const participantOf = lookup(input.participants, 'participant');

  const sessionOrder = new Map<UUID, number>(
    [...input.sessions]
      .sort((a, b) => {
        if (a.playDate !== b.playDate) return a.playDate < b.playDate ? -1 : 1;
        const seqA = a.sequence ?? 0;
        const seqB = b.sequence ?? 0;
        if (seqA !== seqB) return seqA - seqB;
        return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
      })
      .map((session, index) => [session.id, index]),
  );

  const ordered = [...input.attendance].sort((a, b) => {
    const orderA = sessionOrder.get(sessionOf(a.sessionId).id) ?? 0;
    const orderB = sessionOrder.get(sessionOf(b.sessionId).id) ?? 0;
    if (orderA !== orderB) return orderA - orderB;
    const cmp = byName(participantOf(a.participantId), participantOf(b.participantId));
    if (cmp !== 0) return cmp;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

  return toCsv(
    ['session', 'date', 'participant', 'status', 'waitlistPos', 'recordedAt'],
    ordered.map((a) => {
      const session = sessionOf(a.sessionId);
      return [
        session.name,
        session.playDate,
        participantOf(a.participantId).name,
        a.status,
        a.waitlistPos,
        a.recordedAt,
      ];
    }),
  );
}
