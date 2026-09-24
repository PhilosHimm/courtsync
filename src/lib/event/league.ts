import type { Match, Session, Timeslot, UUID } from '@/lib/core';
import { instantToWallClock, wallClockToInstant } from '@/lib/core';

/**
 * Moving a league week (#28).
 *
 * A team emails on Tuesday: they cannot make week six. The convener moves
 * the week, and the fixture list has to move with it without quietly
 * breaking every week after it. Fixtures hang off their session, so moving a
 * session's date — and its timeslots with it, at the same venue clock times —
 * carries every fixture of the week along and touches nothing else.
 *
 * Two ways to move it, and the convener picks:
 *
 * - `only`: this week moves to the new date; the rest of the season stays.
 *   A make-up night.
 * - `cascade`: this week and every later week move by the same number of
 *   days. The season runs a week longer, and nobody's week seven quietly
 *   becomes a double-header.
 *
 * Refused if any week it would move has been played — a result is attached
 * to the night it happened.
 */

export interface PostponeInput {
  sessions: readonly Session[];
  timeslots: readonly Timeslot[];
  matches: readonly Match[];
  sessionId: UUID;
  /** YYYY-MM-DD, at the venue. */
  newDate: string;
  mode: 'only' | 'cascade';
  timeZone: string;
}

export interface PostponePlan {
  sessions: Session[];
  timeslots: Timeslot[];
  /** Sessions whose date changed, in order. */
  moved: UUID[];
}

const PLAYED = (m: Match) =>
  m.sets.length > 0 || m.status === 'live' || m.status === 'final' || m.status === 'forfeit';

const dayNumber = (isoDate: string): number =>
  Math.round(Date.parse(`${isoDate}T00:00:00Z`) / 86_400_000);
const fromDayNumber = (n: number): string => new Date(n * 86_400_000).toISOString().slice(0, 10);

export function planPostponement(input: PostponeInput): PostponePlan {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.newDate) || Number.isNaN(Date.parse(input.newDate))) {
    throw new Error('Choose the new date.');
  }
  const ordered = [...input.sessions].sort(
    (a, b) => (a.sequence ?? 0) - (b.sequence ?? 0) || a.playDate.localeCompare(b.playDate),
  );
  const index = ordered.findIndex((s) => s.id === input.sessionId);
  const target = ordered[index];
  if (!target) throw new Error('That week is not part of this league.');
  const shift = dayNumber(input.newDate) - dayNumber(target.playDate);
  if (shift === 0)
    return { sessions: [...input.sessions], timeslots: [...input.timeslots], moved: [] };

  const moving = new Set(
    (input.mode === 'cascade' ? ordered.slice(index) : [target])
      .filter((s) => input.mode === 'only' || !s.cancelledAt || s.id === target.id)
      .map((s) => s.id),
  );
  const played = input.matches.filter((m) => moving.has(m.sessionId) && PLAYED(m));
  if (played.length > 0) {
    throw new Error('A week being moved already has results. Only weeks not yet played can move.');
  }

  const newDateOf = new Map<UUID, string>();
  for (const s of ordered) {
    if (moving.has(s.id)) newDateOf.set(s.id, fromDayNumber(dayNumber(s.playDate) + shift));
  }
  const staying = new Set(
    ordered.filter((s) => !moving.has(s.id) && !s.cancelledAt).map((s) => s.playDate),
  );
  for (const [id, date] of newDateOf) {
    if (staying.has(date)) {
      const clash = ordered.find((s) => s.playDate === date && !moving.has(s.id));
      throw new Error(
        `${ordered.find((s) => s.id === id)?.name ?? 'That week'} would land on ${date}, which already has ${clash?.name ?? 'a week'}.`,
      );
    }
  }

  const sessions = input.sessions.map((s) => {
    const date = newDateOf.get(s.id);
    return date ? { ...s, playDate: date } : s;
  });
  const timeslots = input.timeslots.map((t) => {
    const date = newDateOf.get(t.sessionId);
    if (!date) return t;
    // Same clock time at the venue on the new date — which is not always the
    // same number of hours later, across a daylight-saving change.
    const start = instantToWallClock(t.startAt, input.timeZone);
    const end = instantToWallClock(t.endAt, input.timeZone);
    return {
      ...t,
      startAt: wallClockToInstant(date, start.clock, input.timeZone),
      endAt: wallClockToInstant(date, end.clock, input.timeZone),
    };
  });
  return { sessions, timeslots, moved: ordered.filter((s) => moving.has(s.id)).map((s) => s.id) };
}
