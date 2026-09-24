import type { Match, SetRule, Standing, Timeslot, UUID } from '@/lib/core';
import { setsWon } from '@/lib/core';
import type {
  CompetitionSetFormats,
  CourtCell,
  PoolInput,
  ScheduleConflict,
  SeededMatch,
  SetFormat,
  SlotSuggestion,
} from '@/lib/scheduling';
import {
  advanceBracket,
  assignReferees,
  auditSchedule,
  bracketDrift,
  computeStandings,
  DEFAULT_SET_FORMATS,
  drawPools,
  generateLeagueFixtures,
  generatePoolPlay,
  matchPhaseOf,
  restSlotsForMinutes,
  seedBrackets,
  setFormatFor,
  suggestPoolCount,
  suggestSlots,
  unavailableCells,
} from '@/lib/scheduling';
import type { EventSnapshot } from './snapshot';

/**
 * The engine, applied to one stored event.
 *
 * Everything here is a pure function of an `EventSnapshot`. The data layer
 * loads a snapshot, calls one of these, and writes what comes back — so the
 * decisions (who plays whom, where, in what order, who advances) are all made
 * in code that runs without a database and is tested that way, and the SQL
 * only ever stores what was decided.
 */

/** Pool letters, in draw order. */
export const POOL_NAMES = 'ABCDEFGHIJKL';

/** The competition's set rules per phase; a phase with no rows uses the engine default. */
export function setFormatsOf(snapshot: EventSnapshot): CompetitionSetFormats {
  const rulesFor = (phase: 'pool' | 'playoff'): readonly SetRule[] => {
    const rows = snapshot.setFormats
      .filter((f) => f.phase === phase)
      .sort((a, b) => a.setNumber - b.setNumber);
    if (rows.length === 0) return DEFAULT_SET_FORMATS[phase];
    return rows.map((r) => ({ target: r.target, winBy: r.winBy, cap: r.cap }));
  };
  return { pool: rulesFor('pool'), playoff: rulesFor('playoff') };
}

/**
 * The format a match is played to. A league fixture or a drop-in game has no
 * tournament phase; it plays to the competition's regular ("pool") rules,
 * which is what an organizer configures for a league night.
 */
export function formatOf(snapshot: EventSnapshot, match: Match): SetFormat {
  return setFormatFor(matchPhaseOf(match) ?? 'pool', setFormatsOf(snapshot));
}

/** Display names by participant id. Full names — the public loader reduces them. */
export function namesOf(snapshot: EventSnapshot): Record<UUID, string> {
  return Object.fromEntries(snapshot.participants.map((p) => [p.id, p.name]));
}

const DONE = new Set(['final', 'forfeit']);

/** Whether a match has a result the standings count. */
export const isDecided = (match: Match): boolean => DONE.has(match.status);

/** Pool play matches — the ones that belong to a pool. */
export const poolMatchesOf = (snapshot: EventSnapshot): Match[] =>
  snapshot.matches.filter((m) => m.poolId != null);

/** Playoff matches — the ones in a bracket tier. */
export const playoffMatchesOf = (snapshot: EventSnapshot): Match[] =>
  snapshot.matches.filter((m) => m.bracket != null);

function standingsOptions(snapshot: EventSnapshot) {
  const pool = setFormatFor('pool', setFormatsOf(snapshot));
  return {
    splitSetsDecidedByTotalPoints: pool.splitDecidedOnTotalPoints,
    ...(snapshot.competition.forfeitPolicy
      ? { forfeitPolicy: snapshot.competition.forfeitPolicy }
      : {}),
    ...(snapshot.competition.tiebreakerOrder
      ? { tiebreakerOrder: snapshot.competition.tiebreakerOrder }
      : {}),
  };
}

/** One standings table per pool, computed now from the matches (rule 1). */
export function poolTables(snapshot: EventSnapshot): Record<UUID, Standing[]> {
  const tables: Record<UUID, Standing[]> = {};
  const ids = new Set(snapshot.participants.map((p) => p.id));
  for (const pool of snapshot.pools) {
    const members = new Set(pool.participantIds.filter((id) => ids.has(id)));
    tables[pool.id] = computeStandings({
      participants: snapshot.participants.filter((p) => members.has(p.id)),
      matches: snapshot.matches.filter((m) => m.poolId === pool.id),
      ...standingsOptions(snapshot),
    });
  }
  return tables;
}

/** A league's one table, across every week. */
export function leagueTable(snapshot: EventSnapshot): Standing[] {
  return computeStandings({
    participants: snapshot.participants,
    matches: snapshot.matches.filter((m) => m.bracket == null),
    ...standingsOptions(snapshot),
  });
}

/** Pool play is done when it has matches and every one of them is decided. */
export function poolPlayComplete(snapshot: EventSnapshot): boolean {
  const pool = poolMatchesOf(snapshot);
  return pool.length > 0 && pool.every(isDecided);
}

const byStart = (a: Timeslot, b: Timeslot): number =>
  Date.parse(a.startAt) - Date.parse(b.startAt) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** Sessions still to be played, in order — a cancelled night holds nothing. */
const liveSessions = (snapshot: EventSnapshot) => snapshot.sessions.filter((s) => !s.cancelledAt);

/** A session's slots, in time order. */
export function slotsOf(snapshot: EventSnapshot, sessionId: UUID): Timeslot[] {
  return snapshot.timeslots.filter((t) => t.sessionId === sessionId).sort(byStart);
}

const activeCourtIds = (snapshot: EventSnapshot): UUID[] =>
  snapshot.courts.filter((c) => c.isActive).map((c) => c.id);

function blockedCells(snapshot: EventSnapshot, timeslots: readonly Timeslot[]): CourtCell[] {
  return unavailableCells({
    courtIds: activeCourtIds(snapshot),
    timeslots,
    windows: snapshot.courtWindows,
  });
}

/** The rest the organizer asked for in minutes, in slots on this grid. */
export function restSlotsOf(snapshot: EventSnapshot, timeslots: readonly Timeslot[]): number {
  return restSlotsForMinutes({ timeslots, restMinutes: snapshot.competition.minRestMin ?? 0 });
}

export interface PoolDraw {
  /** Pools as drawn, with placeholder ids `draw-1`… for the caller to replace. */
  pools: PoolInput[];
}

/**
 * Draw the field into pools. The count is the organizer's if they set one,
 * otherwise the engine's suggestion; `drawPools` refuses a count that cannot
 * work rather than quietly picking another, and so does this.
 */
export function planPoolDraw(snapshot: EventSnapshot): PoolDraw {
  const count = snapshot.competition.poolCount ?? suggestPoolCount(snapshot.participants.length);
  if (count === undefined) {
    throw new Error(
      `${snapshot.participants.length} teams cannot be drawn into pools. A tournament needs at least three.`,
    );
  }
  const pools = drawPools({
    participants: snapshot.participants,
    pools: Array.from({ length: count }, (_, i) => ({
      id: `draw-${i + 1}`,
      name: POOL_NAMES[i] ?? String(i + 1),
    })),
  });
  return { pools };
}

export interface PlannedSchedule {
  matches: Match[];
  /** Match ids the grid had no room for. */
  unplaced: UUID[];
  /** Pool matches nobody could referee. */
  unrefereed: UUID[];
}

/**
 * Pool play on the tournament's first day: round-robin per pool, placed around
 * court windows with the rest the organizer asked for, then referees.
 */
export function planPoolPlay(snapshot: EventSnapshot): PlannedSchedule {
  const day = liveSessions(snapshot)[0];
  if (!day) throw new Error('Add a day of play before generating the schedule.');
  if (snapshot.pools.length === 0) throw new Error('Draw the pools before generating pool play.');
  const timeslots = slotsOf(snapshot, day.id);
  const pools: PoolInput[] = snapshot.pools.map((p) => ({
    id: p.id,
    name: p.name,
    participantIds: p.participantIds,
  }));

  const scheduled = generatePoolPlay({
    competitionSlug: snapshot.competition.slug,
    competitionId: snapshot.competition.id,
    sessionId: day.id,
    pools,
    courtIds: activeCourtIds(snapshot),
    timeslotIds: timeslots.map((t) => t.id),
    minRestSlots: restSlotsOf(snapshot, timeslots),
    unavailable: blockedCells(snapshot, timeslots),
  });
  const refereed = assignReferees({
    matches: scheduled.matches,
    pools,
    allParticipantIds: snapshot.participants.map((p) => p.id),
  });
  return {
    matches: refereed.matches,
    unplaced: scheduled.unassigned,
    unrefereed: refereed.unassigned,
  };
}

/** A league season: one round a week across the sessions still to be played. */
export function planLeague(snapshot: EventSnapshot): PlannedSchedule {
  const sessions = liveSessions(snapshot);
  const timeslotsBySession = Object.fromEntries(
    sessions.map((s) => [s.id, slotsOf(snapshot, s.id).map((t) => t.id)]),
  );
  const matches = generateLeagueFixtures({
    competitionSlug: snapshot.competition.slug,
    competitionId: snapshot.competition.id,
    sessions,
    participantIds: snapshot.participants.map((p) => p.id),
    courtIds: activeCourtIds(snapshot),
    timeslotsBySession,
    rounds: snapshot.competition.leagueLegs ?? 1,
    unavailable: blockedCells(
      snapshot,
      snapshot.timeslots.filter((t) => sessions.some((s) => s.id === t.sessionId)),
    ),
  });
  return {
    matches,
    unplaced: matches.filter((m) => m.timeslotId == null).map((m) => m.id),
    unrefereed: [],
  };
}

/** Bracket rounds in the order they are played. */
const ROUNDS: ReadonlyArray<readonly string[]> = [
  ['q1', 'q2', 'q3', 'q4'],
  ['s1', 's2'],
  ['final', 'consolation'],
];

/**
 * Seed the playoffs from the pool tables and place them on the grid.
 *
 * Each round is placed in the free court-and-slot cells after the last slot
 * the previous round used — pool play first, then quarters, semis, final —
 * so nobody is scheduled to play a match before the one that decides who is
 * in it. Byes and slots the bracket does not have are not placed: there is
 * nothing to play.
 */
export function planPlayoffs(snapshot: EventSnapshot): PlannedSchedule & { seeded: SeededMatch[] } {
  if (!poolPlayComplete(snapshot)) {
    throw new Error('Every pool match needs a result before the playoffs can be seeded.');
  }
  const tiers = [...(snapshot.competition.bracketTiers ?? ['gold'])];
  const seeded = seedBrackets({
    competitionSlug: snapshot.competition.slug,
    sessionId: snapshot.sessions[0]?.id ?? '',
    standingsByPool: poolTables(snapshot),
    tiers,
    ...(snapshot.competition.tiebreakerOrder
      ? { tiebreakerOrder: snapshot.competition.tiebreakerOrder }
      : {}),
  });

  const sessions = liveSessions(snapshot);
  const allSlots = snapshot.timeslots
    .filter((t) => sessions.some((s) => s.id === t.sessionId))
    .sort(byStart);
  const poolMatches = poolMatchesOf(snapshot);
  const lastPoolEnd = Math.max(
    0,
    ...poolMatches
      .map((m) => allSlots.find((t) => t.id === m.timeslotId))
      .filter((t): t is Timeslot => t !== undefined)
      .map((t) => Date.parse(t.endAt)),
  );

  let matches: Match[] = seeded.map((s) => ({
    id: s.matchId,
    competitionId: snapshot.competition.id,
    sessionId: sessions[0]?.id ?? snapshot.sessions[0]?.id ?? '',
    poolId: null,
    courtId: null,
    timeslotId: null,
    homeParticipantId: s.homeParticipantId,
    awayParticipantId: s.awayParticipantId,
    refParticipantId: null,
    bracket: s.tier,
    roundLabel: s.slot,
    status: 'scheduled',
    sets: [],
  }));
  // Byes resolve now, so a semifinal a top seed walks into is known.
  matches = advanceAll(snapshot, matches).matches;

  const blocked = new Set(
    blockedCells(snapshot, allSlots).map((c) => `${c.courtId}\u0000${c.timeslotId}`),
  );
  const courts = activeCourtIds(snapshot);
  let notBefore = lastPoolEnd;
  const placed = new Map<UUID, { courtId: UUID; timeslotId: UUID; sessionId: UUID }>();

  for (const round of ROUNDS) {
    const toPlace = matches.filter(
      (m) => round.includes(m.roundLabel ?? '') && playable(matches, m),
    );
    let roundEnd = notBefore;
    let i = 0;
    for (const slot of allSlots) {
      if (i >= toPlace.length) break;
      if (Date.parse(slot.startAt) < notBefore) continue;
      for (const courtId of courts) {
        if (i >= toPlace.length) break;
        if (blocked.has(`${courtId}\u0000${slot.id}`)) continue;
        const match = toPlace[i];
        if (!match) break;
        placed.set(match.id, { courtId, timeslotId: slot.id, sessionId: slot.sessionId });
        roundEnd = Math.max(roundEnd, Date.parse(slot.endAt));
        i += 1;
      }
    }
    notBefore = roundEnd;
  }

  const unplaced: UUID[] = [];
  matches = matches.map((m) => {
    const cell = placed.get(m.id);
    if (cell) return { ...m, ...cell };
    if (playable(matches, m)) unplaced.push(m.id);
    return m;
  });
  return { matches, unplaced, unrefereed: [], seeded };
}

/** A bracket match somebody will actually play: not a bye, not a slot this bracket lacks. */
function playable(matches: readonly Match[], match: Match): boolean {
  if (match.homeParticipantId && match.awayParticipantId) return true;
  const feeds: Record<string, [string, string]> = {
    s1: ['q1', 'q2'],
    s2: ['q3', 'q4'],
    final: ['s1', 's2'],
    consolation: ['s1', 's2'],
  };
  const exists = (slot: string): boolean => {
    const m = matches.find((x) => x.bracket === match.bracket && x.roundLabel === slot);
    const from = feeds[slot];
    if (!from) return Boolean(m?.homeParticipantId || m?.awayParticipantId);
    return from.some(exists);
  };
  const from = feeds[match.roundLabel ?? ''];
  if (!from) return false; // a quarterfinal with a side missing is a bye
  // A downstream match is played when both feeders exist (or one is already here).
  const [a, b] = from;
  const homeComing = Boolean(match.homeParticipantId) || exists(a);
  const awayComing = Boolean(match.awayParticipantId) || exists(b);
  return homeComing && awayComing;
}

export interface AdvanceResult {
  matches: Match[];
  /** Tiers that could not advance, with the reason — a tied elimination match (H15). */
  stalled: Array<{ tier: string; reason: string }>;
}

/**
 * Advance every tier from its current results. Recomputed from the
 * quarterfinals each time (H14), so a corrected quarterfinal reshapes the
 * rounds after it. A tied elimination match stalls its tier and says so,
 * rather than inventing a winner (H15).
 */
export function advanceAll(snapshot: EventSnapshot, matches: readonly Match[]): AdvanceResult {
  const tiers = [...new Set(matches.map((m) => m.bracket).filter((b): b is string => Boolean(b)))];
  let next = [...matches];
  const stalled: AdvanceResult['stalled'] = [];
  for (const tier of tiers) {
    try {
      next = advanceBracket({ competitionSlug: snapshot.competition.slug, tier, matches: next });
    } catch (error) {
      stalled.push({ tier, reason: (error as Error).message });
    }
  }
  return { matches: next, stalled };
}

/**
 * Which quarterfinals a change to the pool results would move — shown on the
 * score-correction confirmation, where it bites at 3:20 rather than at 3:50
 * when two teams are standing at the wrong court.
 */
export function driftAfter(snapshot: EventSnapshot, nextMatches: readonly Match[]) {
  const quarters = playoffMatchesOf(snapshot).filter((m) => /^q[1-4]$/.test(m.roundLabel ?? ''));
  if (quarters.length === 0) return [];
  const seeded: SeededMatch[] = quarters.map((m) => ({
    matchId: m.id,
    tier: m.bracket ?? '',
    slot: m.roundLabel as SeededMatch['slot'],
    homeParticipantId: m.homeParticipantId ?? null,
    awayParticipantId: m.awayParticipantId ?? null,
  }));
  const after: EventSnapshot = { ...snapshot, matches: [...nextMatches] };
  return bracketDrift({
    seeded,
    current: {
      competitionSlug: snapshot.competition.slug,
      sessionId: snapshot.sessions[0]?.id ?? '',
      standingsByPool: poolTables(after),
      tiers: [...(snapshot.competition.bracketTiers ?? ['gold'])],
      ...(snapshot.competition.tiebreakerOrder
        ? { tiebreakerOrder: snapshot.competition.tiebreakerOrder }
        : {}),
    },
  });
}

/** Every conflict on the grid, with the rest and court windows this event asked for. */
export function auditOf(snapshot: EventSnapshot): ScheduleConflict[] {
  return auditSchedule({
    matches: snapshot.matches,
    timeslots: snapshot.timeslots,
    minRestSlots: restSlotsOf(snapshot, snapshot.timeslots),
    courtWindows: snapshot.courtWindows,
  });
}

/** Who won, or null — for a decided match only. */
export function winnerOf(match: Match): UUID | null {
  if (!isDecided(match)) return null;
  const sets = setsWon(match);
  if (sets.home === sets.away) return null;
  return (sets.home > sets.away ? match.homeParticipantId : match.awayParticipantId) ?? null;
}

/** Where a match could legally move on its own day, with this event's windows and rest. */
export function suggestionsIn(snapshot: EventSnapshot, matchKey: string): SlotSuggestion[] {
  const session = snapshot.matches.find((m) => m.id === matchKey)?.sessionId;
  const sessionSlots = snapshot.timeslots.filter((t) => t.sessionId === session);
  return suggestSlots({
    matchId: matchKey,
    matches: snapshot.matches,
    timeslots: snapshot.timeslots,
    courts: snapshot.courts,
    courtWindows: snapshot.courtWindows,
    minRestSlots: restSlotsOf(snapshot, sessionSlots),
  });
}
