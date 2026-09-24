import type { Court, Match, MatchStatus, Timeslot, UUID } from '@/lib/core';
import { sortSets } from '@/lib/core';

/**
 * The schedule, cut four ways (#24).
 *
 * Match list, court timeline, my schedule, one team's day. Each has a
 * different reader and all four are the same rows, so they share one row
 * builder and one sort key: the slot's timestamp. Sorting on a formatted
 * time label is what put a tournament's final above its opening match (C4),
 * and a view layer is exactly where that mistake gets made again.
 */

/**
 * Status as words. Every status has one, so a view never has to carry a
 * status on colour alone (PRD §11).
 */
export const STATUS_LABELS: Readonly<Record<MatchStatus, string>> = {
  scheduled: 'Scheduled',
  live: 'Playing now',
  final: 'Final',
  forfeit: 'Forfeit',
  delayed: 'Delayed',
  cancelled: 'Cancelled',
};

/** Shown where a side is not known yet — a semifinal waiting on a quarter. */
export const TO_BE_DECIDED = 'To be decided';

export interface ScheduleRow {
  matchId: UUID;
  sessionId: UUID;
  timeslotId: UUID | null;
  courtId: UUID | null;
  /** Absolute timestamps. Sort and compare on these; format only for display. */
  startAt: string | null;
  endAt: string | null;
  court: string | null;
  homeId: UUID | null;
  awayId: UUID | null;
  refereeId: UUID | null;
  home: string;
  away: string;
  referee: string | null;
  status: MatchStatus;
  statusLabel: string;
  /** "21–18, 19–21", or null before any set is recorded. */
  score: string | null;
  roundLabel: string | null;
  bracket: string | null;
  poolId: UUID | null;
}

export interface ScheduleRowsInput {
  matches: readonly Match[];
  timeslots: readonly Timeslot[];
  courts: readonly Court[];
  /** Display name per participant id — already reduced, on a public page. */
  names: Readonly<Record<UUID, string>>;
}

const compareIds = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

export function scheduleRows(input: ScheduleRowsInput): ScheduleRow[] {
  const slotById = new Map(input.timeslots.map((slot) => [slot.id, slot]));
  const courtById = new Map(input.courts.map((court) => [court.id, court]));
  const nameOf = (id: UUID | null | undefined): string | null =>
    id == null ? null : (input.names[id] ?? TO_BE_DECIDED);

  const rows = input.matches.map((match): ScheduleRow => {
    const slot = match.timeslotId == null ? undefined : slotById.get(match.timeslotId);
    const court = match.courtId == null ? undefined : courtById.get(match.courtId);
    const sets = sortSets(match.sets);
    return {
      matchId: match.id,
      sessionId: match.sessionId,
      timeslotId: slot ? slot.id : null,
      courtId: court ? court.id : null,
      startAt: slot?.startAt ?? null,
      endAt: slot?.endAt ?? null,
      court: court?.name ?? null,
      homeId: match.homeParticipantId ?? null,
      awayId: match.awayParticipantId ?? null,
      refereeId: match.refParticipantId ?? null,
      home: nameOf(match.homeParticipantId) ?? TO_BE_DECIDED,
      away: nameOf(match.awayParticipantId) ?? TO_BE_DECIDED,
      referee: nameOf(match.refParticipantId),
      status: match.status,
      statusLabel: STATUS_LABELS[match.status],
      score:
        sets.length === 0
          ? null
          : sets.map((set) => `${set.homePoints}–${set.awayPoints}`).join(', '),
      roundLabel: match.roundLabel ?? null,
      bracket: match.bracket ?? null,
      poolId: match.poolId ?? null,
    };
  });

  return rows.sort(compareRows);
}

/** Placed before unplaced; then instant; then court name; then id. */
function compareRows(a: ScheduleRow, b: ScheduleRow): number {
  if ((a.startAt === null) !== (b.startAt === null)) return a.startAt === null ? 1 : -1;
  if (a.startAt !== null && b.startAt !== null) {
    const diff = Date.parse(a.startAt) - Date.parse(b.startAt);
    if (diff !== 0) return diff;
  }
  const courtA = a.court ?? '';
  const courtB = b.court ?? '';
  if (courtA !== courtB) return courtA.localeCompare(courtB, undefined, { numeric: true });
  return compareIds(a.matchId, b.matchId);
}

export interface ScheduleFilter {
  /** Any part of a team or player name, any case. Refereeing counts. */
  team?: string;
  courtId?: UUID;
  status?: MatchStatus;
}

/**
 * Team search, court, status. Picking a day or a league week is not a filter
 * — it is navigation, a session switcher above the list — so it is not here.
 */
export function filterRows(rows: readonly ScheduleRow[], filter: ScheduleFilter): ScheduleRow[] {
  const needle = filter.team?.trim().toLocaleLowerCase() ?? '';
  return rows.filter((row) => {
    if (filter.courtId !== undefined && row.courtId !== filter.courtId) return false;
    if (filter.status !== undefined && row.status !== filter.status) return false;
    if (needle !== '') {
      const people = [row.homeId ? row.home : null, row.awayId ? row.away : null, row.referee];
      if (!people.some((name) => name?.toLocaleLowerCase().includes(needle))) return false;
    }
    return true;
  });
}

export interface CourtTimeline {
  courts: Array<{ id: UUID; name: string }>;
  slots: Array<{
    timeslotId: UUID;
    startAt: string;
    endAt: string;
    /** Index-aligned with `courts`; null is an empty cell. */
    cells: Array<ScheduleRow | null>;
  }>;
  /** Matches with no court or no slot. Shown beside the grid, never dropped. */
  unplaced: ScheduleRow[];
  /**
   * Matches sharing a cell with an earlier one. A hand-edited grid can do
   * that; the audit calls it blocking and the timeline must not hide it by
   * overwriting one match with the other.
   */
  collisions: ScheduleRow[];
}

/** The court × time grid — the one artifact the product actually makes. */
export function courtTimeline(input: {
  rows: readonly ScheduleRow[];
  timeslots: readonly Timeslot[];
  courts: readonly Court[];
}): CourtTimeline {
  const courts = [...input.courts]
    .sort(
      (a, b) =>
        a.name.localeCompare(b.name, undefined, { numeric: true }) || compareIds(a.id, b.id),
    )
    .map((court) => ({ id: court.id, name: court.name }));
  const column = new Map(courts.map((court, index) => [court.id, index]));

  const slots = [...input.timeslots]
    .sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt) || compareIds(a.id, b.id))
    .map((slot) => ({
      timeslotId: slot.id,
      startAt: slot.startAt,
      endAt: slot.endAt,
      cells: courts.map((): ScheduleRow | null => null),
    }));
  const rowOfSlot = new Map(slots.map((slot, index) => [slot.timeslotId, index]));

  const unplaced: ScheduleRow[] = [];
  const collisions: ScheduleRow[] = [];
  for (const row of input.rows) {
    const r = row.timeslotId === null ? undefined : rowOfSlot.get(row.timeslotId);
    const c = row.courtId === null ? undefined : column.get(row.courtId);
    const slot = r === undefined ? undefined : slots[r];
    if (slot === undefined || c === undefined) {
      unplaced.push(row);
      continue;
    }
    if (slot.cells[c]) collisions.push(row);
    else slot.cells[c] = row;
  }

  return { courts, slots, unplaced, collisions };
}

export interface TeamDayEntry {
  row: ScheduleRow;
  role: 'playing' | 'refereeing';
  /** The other side's name when playing; null when refereeing. */
  opponent: string | null;
}

/** One team's whole day, every role, in order — the screenshot for the group chat. */
export function teamDay(rows: readonly ScheduleRow[], participantId: UUID): TeamDayEntry[] {
  const entries: TeamDayEntry[] = [];
  for (const row of rows) {
    if (row.homeId === participantId) {
      entries.push({ row, role: 'playing', opponent: row.away });
    } else if (row.awayId === participantId) {
      entries.push({ row, role: 'playing', opponent: row.home });
    } else if (row.refereeId === participantId) {
      entries.push({ row, role: 'refereeing', opponent: null });
    }
  }
  return entries;
}

const OVER: ReadonlySet<MatchStatus> = new Set(['final', 'forfeit', 'cancelled']);

/**
 * The next thing any of these participants has to be at: the earliest match
 * they play or referee that is not over.
 *
 * "Over" is the match's status, not the clock. A delayed match whose slot has
 * passed is still the next place this team has to be — the clock only rules
 * out a scheduled match whose slot ended before `now`, which is a result
 * nobody has entered yet rather than something still to come.
 */
export function nextUp(
  rows: readonly ScheduleRow[],
  participantIds: readonly UUID[],
  now: string,
): ScheduleRow | null {
  const mine = new Set(participantIds);
  const current = Date.parse(now);
  for (const row of rows) {
    const involved = [row.homeId, row.awayId, row.refereeId].some(
      (id) => id !== null && mine.has(id),
    );
    if (!involved || OVER.has(row.status)) continue;
    if (row.status === 'scheduled' && row.endAt !== null && Date.parse(row.endAt) <= current) {
      continue;
    }
    return row;
  }
  return null;
}
