import type { Court, Match, Participant, Session, Standing, Timeslot } from '@/lib/core';
import { BRACKET_TIERS, MAX_TEAMS_PER_POOL, MIN_TEAMS_PER_POOL, setsWon } from '@/lib/core';
import type { BracketSlot, PoolInput } from '@/lib/scheduling';
import {
  advanceBracket,
  assignReferees,
  computeStandings,
  drawPools,
  generatePoolPlay,
  seedBrackets,
} from '@/lib/scheduling';
import type { StoredTeam, StoredTournament } from '@/lib/storage';
import { competitionSlug, STORAGE_SCHEMA_VERSION } from '@/lib/storage';
import { applyResult } from './results';
import { addMinutes, buildTimeslots } from './time';

/**
 * A stored tournament, rebuilt into a live day by the real engine.
 *
 * This mirrors `src/lib/demo/tournament.ts` step for step — draw, schedule,
 * referee, rank, seed, advance — with two differences that make it the
 * product rather than the demo: the teams are the organizer's own, and the
 * results come from `stored.results` (what the organizer typed in) instead
 * of being invented. There is no stage knob; how far the day has got *is*
 * which results exist.
 *
 * Everything here is pure and deterministic. The same stored record rebuilds
 * to the identical schedule on every read — which is what lets the schedule
 * itself stay unstored.
 */

const POOL_LETTERS = 'ABCDEFGH';

const BRACKET_ROUNDS: ReadonlyArray<readonly BracketSlot[]> = [
  ['q1', 'q2', 'q3', 'q4'],
  ['s1', 's2'],
  ['final', 'consolation'],
];

export interface TierView {
  tier: string;
  /** The eight slots, in `BRACKET_SLOTS` order. */
  matches: Match[];
  champion: Participant | null;
}

export interface TournamentView {
  stored: StoredTournament;
  slug: string;
  session: Session;
  courts: Court[];
  timeslots: Timeslot[];
  participants: Participant[];
  pools: PoolInput[];
  poolMatches: Match[];
  unassignedMatchIds: string[];
  unrefereedMatchIds: string[];
  /** Pool matches with a recorded result. */
  playedCount: number;
  /** Every pool match has a result — the gate for seeding the bracket. */
  poolsComplete: boolean;
  standingsByPool: Record<string, Standing[]>;
  /** Empty until `poolsComplete`; seeding reads records, never the entry list. */
  brackets: TierView[];
  nameOf: Record<string, string>;
  /** Set when the setup cannot be scheduled at all (e.g. too few teams). */
  problem: string | null;
}

/**
 * Pool counts that divide this field into pools the engine will accept.
 * Duplicated from the demo's config on purpose — the demo is not a library.
 */
export function validPoolCounts(teams: number): number[] {
  const counts: number[] = [];
  for (let count = 1; count <= teams; count++) {
    const largest = Math.ceil(teams / count);
    const smallest = Math.floor(teams / count);
    if (smallest < MIN_TEAMS_PER_POOL || largest > MAX_TEAMS_PER_POOL) continue;
    counts.push(count);
  }
  return counts;
}

/** The legal pool count closest to the one asked for; ties go to the smaller. */
export function nearestPoolCount(teams: number, requested: number): number {
  const valid = validPoolCounts(teams);
  const first = valid[0];
  if (first === undefined) return 1;
  return valid.reduce(
    (best, count) => (Math.abs(count - requested) < Math.abs(best - requested) ? count : best),
    first,
  );
}

export interface TournamentSetup {
  name: string;
  venueName?: string;
  playDate: string;
  startTime: string;
  gameDurationMin: number;
  bufferMin: number;
  courtNames: string[];
  slots: number;
  restSlots: number;
  poolCount: number;
  tiers: number;
  splitByPoints: boolean;
  teams: StoredTeam[];
}

/**
 * A new stored tournament. `id` and `now` come from the caller — an event
 * handler mints the uuid and reads the clock so this stays pure.
 */
export function createTournament(
  setup: TournamentSetup,
  id: string,
  now: string,
): StoredTournament {
  return {
    id,
    schemaVersion: STORAGE_SCHEMA_VERSION,
    ...setup,
    createdAt: now,
    updatedAt: now,
    results: {},
  };
}

/** A played match must stay decided in sets before `advanceBracket` sees it. */
function decisiveOnSets(match: Match): boolean {
  const sets = setsWon(match);
  return sets.home !== sets.away;
}

export function buildTournamentView(stored: StoredTournament): TournamentView {
  const slug = competitionSlug(stored.id);
  const sessionId = `${slug}-day`;

  const session: Session = {
    id: sessionId,
    competitionId: stored.id,
    playDate: stored.playDate,
    startTime: stored.startTime,
    endTime: addMinutes(
      stored.startTime,
      stored.slots * (stored.gameDurationMin + stored.bufferMin),
    ),
    sequence: 1,
  };

  const courts: Court[] = stored.courtNames.map((name, i) => ({
    id: `${slug}-court-${i + 1}`,
    competitionId: stored.id,
    name: name.trim() || `Court ${i + 1}`,
    isActive: true,
  }));

  const timeslots = buildTimeslots({
    sessionId,
    playDate: stored.playDate,
    startTime: stored.startTime,
    count: stored.slots,
    durationMin: stored.gameDurationMin,
    bufferMin: stored.bufferMin,
  });

  // List order is seeding order — the organizer ranks by dragging nothing
  // fancier than the order they typed the teams in.
  const participants: Participant[] = stored.teams.map((team, i) => ({
    id: team.id,
    competitionId: stored.id,
    kind: 'team' as const,
    name: team.name,
    seed: i + 1,
    registeredAt: stored.createdAt,
  }));
  const nameOf = Object.fromEntries(participants.map((p) => [p.id, p.name]));

  const empty: Omit<TournamentView, 'problem'> = {
    stored,
    slug,
    session,
    courts,
    timeslots,
    participants,
    pools: [],
    poolMatches: [],
    unassignedMatchIds: [],
    unrefereedMatchIds: [],
    playedCount: 0,
    poolsComplete: false,
    standingsByPool: {},
    brackets: [],
    nameOf,
  };

  if (participants.length < MIN_TEAMS_PER_POOL) {
    return {
      ...empty,
      problem: `A tournament needs at least ${MIN_TEAMS_PER_POOL} teams — add ${
        MIN_TEAMS_PER_POOL - participants.length
      } more in setup.`,
    };
  }
  if (courts.length === 0) {
    return { ...empty, problem: 'Add at least one court in setup.' };
  }

  const poolCount = nearestPoolCount(participants.length, stored.poolCount);
  const pools = drawPools({
    participants,
    pools: Array.from({ length: poolCount }, (_, i) => ({
      id: `${slug}-pool-${i + 1}`,
      name: POOL_LETTERS[i] ?? String(i + 1),
    })),
  });

  const scheduled = generatePoolPlay({
    competitionSlug: slug,
    competitionId: stored.id,
    sessionId,
    pools,
    courtIds: courts.map((c) => c.id),
    timeslotIds: timeslots.map((t) => t.id),
    minRestSlots: stored.restSlots,
  });

  const refereed = assignReferees({
    matches: scheduled.matches,
    pools,
    allParticipantIds: participants.map((p) => p.id),
  });

  const poolMatches = refereed.matches.map((match) => applyResult(match, stored.results));
  const playedCount = poolMatches.filter((match) => match.status === 'final').length;
  const poolsComplete = poolMatches.length > 0 && playedCount === poolMatches.length;

  const standingsByPool: Record<string, Standing[]> = {};
  for (const pool of pools) {
    standingsByPool[pool.id] = computeStandings({
      participants: participants.filter((p) => pool.participantIds.includes(p.id)),
      matches: poolMatches.filter((m) => m.poolId === pool.id),
      splitSetsDecidedByTotalPoints: stored.splitByPoints,
    });
  }

  const championOf = (matches: readonly Match[]): Participant | null => {
    const final = matches.find((m) => m.roundLabel === 'final');
    if (final?.status !== 'final') return null;
    const sets = setsWon(final);
    if (sets.home === sets.away) return null;
    const id = (sets.home > sets.away ? final.homeParticipantId : final.awayParticipantId) ?? null;
    return participants.find((p) => p.id === id) ?? null;
  };

  const brackets: TierView[] = [];
  if (poolsComplete) {
    const tierCount = Math.min(Math.max(1, Math.trunc(stored.tiers)), BRACKET_TIERS.length);
    const tierNames = BRACKET_TIERS.slice(0, tierCount);
    const seeded = seedBrackets({
      competitionSlug: slug,
      sessionId,
      standingsByPool,
      tiers: [...tierNames],
    });

    for (const tier of tierNames) {
      // A tier the field cannot fill is skipped by the engine, not drawn empty.
      const forTier = seeded.filter((s) => s.tier === tier);
      if (forTier.length === 0) continue;

      let matches: Match[] = forTier.map((s) => ({
        id: s.matchId,
        competitionId: stored.id,
        sessionId,
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

      // Play a round, advance, repeat — the loop the day itself runs, and why
      // correcting a quarterfinal reshapes everything after it.
      for (const roundSlots of BRACKET_ROUNDS) {
        matches = matches.map((m) => {
          if (!roundSlots.includes(m.roundLabel as BracketSlot)) return m;
          const withResult = applyResult(m, stored.results);
          // Entry validation already refuses a level playoff scoreline; this
          // guard keeps a hand-edited store from crashing `advanceBracket`.
          return withResult.status === 'final' && !decisiveOnSets(withResult) ? m : withResult;
        });
        matches = advanceBracket({ competitionSlug: slug, tier, matches });
      }

      brackets.push({ tier, matches, champion: championOf(matches) });
    }
  }

  return {
    ...empty,
    pools,
    poolMatches,
    unassignedMatchIds: scheduled.unassigned,
    unrefereedMatchIds: refereed.unassigned,
    playedCount,
    poolsComplete,
    standingsByPool,
    brackets,
    problem: null,
  };
}
