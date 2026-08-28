import type {
  Competition,
  Court,
  Match,
  Participant,
  Session,
  Standing,
  Timeslot,
} from '@/lib/core';
import { BRACKET_TIERS, setsWon } from '@/lib/core';
import type { BracketSlot, PoolInput } from '@/lib/scheduling';
import {
  advanceBracket,
  assignReferees,
  computeStandings,
  drawPools,
  generatePoolPlay,
  seedBrackets,
} from '@/lib/scheduling';
import type { TournamentDemoConfig, TournamentStage } from './config';
import { demoCompetition, demoCourts, demoSession, demoTeams, demoTimeslots } from './data';
import type { Outcomes } from './results';
import { play } from './results';

/**
 * A whole tournament day, assembled by calling the real engine in the order
 * the app will have to call it: draw, schedule, referee, score, rank, seed,
 * advance. Nothing is reimplemented here — every step below is one exported
 * function from `src/lib/scheduling`, and this file only carries the output
 * of one into the next.
 *
 * That is the point of the demo. The engine has been finished and tested for
 * a while with nothing to look at, and a page that redrew a schematic grid
 * would prove nothing about it. This runs it.
 */

const SLUG = 'demo-open';
const SESSION_ID = 'demo-sess-1';
const PLAY_DATE = '2026-09-19';
const GAME_MIN = 45;
const BUFFER_MIN = 5;

/** Which bracket rounds have results in, by stage. */
const ROUNDS_PLAYED: Record<TournamentStage, number> = {
  draw: 0,
  pools: 0,
  quarters: 1,
  semis: 2,
  final: 3,
};

const BRACKET_ROUNDS: ReadonlyArray<readonly BracketSlot[]> = [
  ['q1', 'q2', 'q3', 'q4'],
  ['s1', 's2'],
  ['final', 'consolation'],
];

export interface TournamentDemo {
  config: TournamentDemoConfig;
  competition: Competition;
  session: Session;
  courts: Court[];
  timeslots: Timeslot[];
  participants: Participant[];
  pools: PoolInput[];
  poolMatches: Match[];
  /** Matches the day had no room for. A real answer, not an error. */
  unassignedMatchIds: string[];
  /** Matches nobody could referee without playing in them at the same time. */
  unrefereedMatchIds: string[];
  standingsByPool: Record<string, Standing[]>;
  /**
   * One draw per tier, gold first. Empty until pool results exist — a bracket
   * seeded from nothing is a lie, and seeding reads records, never the entry
   * list.
   *
   * A tier the field cannot fill is left out rather than shown empty: with
   * twelve teams, gold takes eight and silver takes the other four, and there
   * is no bronze to draw.
   */
  brackets: TierDraw[];
  nameOf: Record<string, string>;
}

/** One tier's draw, and whoever came through it. */
export interface TierDraw {
  tier: string;
  /** The eight slots, in `BRACKET_SLOTS` order. */
  matches: Match[];
  champion: Participant | null;
}

function toBracketMatch(
  competitionId: string,
  seeded: {
    matchId: string;
    tier: string;
    slot: BracketSlot;
    homeParticipantId: string | null;
    awayParticipantId: string | null;
  },
): Match {
  return {
    id: seeded.matchId,
    competitionId,
    sessionId: SESSION_ID,
    poolId: null,
    courtId: null,
    timeslotId: null,
    homeParticipantId: seeded.homeParticipantId,
    awayParticipantId: seeded.awayParticipantId,
    refParticipantId: null,
    bracket: seeded.tier,
    roundLabel: seeded.slot,
    status: 'scheduled',
    sets: [],
  };
}

export function buildTournamentDemo(
  config: TournamentDemoConfig,
  outcomes: Outcomes = {},
): TournamentDemo {
  const competition = demoCompetition({
    format: 'tournament',
    slug: SLUG,
    name: 'Demo Open',
    venueName: 'Demo Gym',
    gameDurationMin: GAME_MIN,
    bufferMin: BUFFER_MIN,
    registrationFee: 100,
  });

  const session = demoSession({
    competitionId: competition.id,
    id: SESSION_ID,
    playDate: PLAY_DATE,
    startTime: '09:00',
    endTime: '18:00',
    sequence: 1,
  });

  const courts = demoCourts(competition.id, config.courts);
  const timeslots = demoTimeslots({
    sessionId: SESSION_ID,
    playDate: PLAY_DATE,
    startTime: '09:00',
    count: config.slots,
    durationMin: GAME_MIN,
    bufferMin: BUFFER_MIN,
  });
  const participants = demoTeams(competition.id, config.teams);
  const nameOf = Object.fromEntries(participants.map((p) => [p.id, p.name]));

  // The pool count is already snapped to something legal by parseTournamentConfig,
  // so drawPools is never handed a field it has to refuse.
  const pools = drawPools({
    participants,
    pools: Array.from({ length: config.pools }, (_, i) => ({
      id: `demo-pool-${i + 1}`,
      name: String.fromCharCode(65 + i),
    })),
  });

  const scheduled = generatePoolPlay({
    competitionSlug: SLUG,
    competitionId: competition.id,
    sessionId: SESSION_ID,
    pools,
    courtIds: courts.map((c) => c.id),
    timeslotIds: timeslots.map((t) => t.id),
    minRestSlots: config.rest,
  });

  const refereed = assignReferees({
    matches: scheduled.matches,
    pools,
    allParticipantIds: participants.map((p) => p.id),
  });

  const poolsPlayed = config.stage !== 'draw';
  const poolMatches = poolsPlayed
    ? refereed.matches.map((m) => play(m, outcomes, 'pool'))
    : refereed.matches;

  const standingsByPool: Record<string, Standing[]> = {};
  if (poolsPlayed) {
    for (const pool of pools) {
      standingsByPool[pool.id] = computeStandings({
        participants: participants.filter((p) => pool.participantIds.includes(p.id)),
        matches: poolMatches.filter((m) => m.poolId === pool.id),
        splitSetsDecidedByTotalPoints: config.splitByPoints,
      });
    }
  }

  /** Whoever won a decided final. Null while the tier is still being played. */
  const championOf = (matches: readonly Match[]): Participant | null => {
    const final = matches.find((m) => m.roundLabel === 'final');
    if (final?.status !== 'final') return null;
    const sets = setsWon(final);
    if (sets.home === sets.away) return null;
    const id = (sets.home > sets.away ? final.homeParticipantId : final.awayParticipantId) ?? null;
    return participants.find((p) => p.id === id) ?? null;
  };

  const brackets: TierDraw[] = [];
  if (poolsPlayed) {
    const tierNames = BRACKET_TIERS.slice(0, config.tiers);
    const seeded = seedBrackets({
      competitionSlug: SLUG,
      sessionId: SESSION_ID,
      standingsByPool,
      tiers: [...tierNames],
    });

    for (const tier of tierNames) {
      // seedBrackets skips a tier with nobody left to draw, so an absent tier
      // here is a field that ran out — not an error, and not something to
      // render as an empty draw.
      const forTier = seeded.filter((s) => s.tier === tier);
      if (forTier.length === 0) continue;

      let matches = forTier.map((s) => toBracketMatch(competition.id, s));

      // Play a round, advance, repeat — exactly the loop the day itself runs,
      // and the reason a corrected quarterfinal reshapes everything after it.
      const rounds = ROUNDS_PLAYED[config.stage];
      for (let round = 0; round < BRACKET_ROUNDS.length; round++) {
        if (round < rounds) {
          const slots = BRACKET_ROUNDS[round] ?? [];
          matches = matches.map((m) =>
            slots.includes(m.roundLabel as BracketSlot) ? play(m, outcomes, 'playoff') : m,
          );
        }
        matches = advanceBracket({ competitionSlug: SLUG, tier, matches });
      }

      brackets.push({ tier, matches, champion: championOf(matches) });
    }
  }

  return {
    config,
    competition,
    session,
    courts,
    timeslots,
    participants,
    pools,
    poolMatches,
    unassignedMatchIds: scheduled.unassigned,
    unrefereedMatchIds: refereed.unassigned,
    standingsByPool,
    brackets,
    nameOf,
  };
}
