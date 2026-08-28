/**
 * Demo mode: the finished scheduling engine, driven from a page, with no
 * database, no account and nothing saved.
 *
 * The dependency flow the rest of the app follows gains one link here:
 *
 *     src/app, src/components  ->  src/lib/demo  ->  src/lib/scheduling  ->  src/lib/core
 *
 * `src/lib/demo` may import scheduling and core and nothing else. It must
 * never be imported *by* scheduling or core, and — like both of them — it
 * never imports app code.
 *
 * Why this exists as a layer rather than as component state: the demo has to
 * be reproducible from a URL, and everything that turns a URL into a schedule
 * is pure. Keeping it here means it is testable without rendering anything,
 * and `test/demo/` does exactly that.
 *
 * Two rules this layer holds to, both from CLAUDE.md and both easy to break
 * from a page:
 *
 * - It is pure. No `Date.now()`, no `Math.random()`, no I/O. Same URL, same
 *   schedule, on any machine, forever.
 * - It writes nothing. There is no persistence to authorize, which is what
 *   makes it safe to ship before the auth decision in docs/DECISIONS.md
 *   lands. When auth arrives it goes in front of the real app; demo mode
 *   needs no exception carved out for it, and must never be given one.
 */

export type {
  DropInDemoConfig,
  LeagueDemoConfig,
  QueryParams,
  TournamentDemoConfig,
  TournamentStage,
} from './config';
export {
  clamp,
  dropInQuery,
  flipsQuery,
  leagueQuery,
  nearestPoolCount,
  parseDropInConfig,
  parseFlips,
  parseLeagueConfig,
  parseTournamentConfig,
  readFlag,
  readInt,
  readOneOf,
  TOURNAMENT_STAGES,
  tournamentQuery,
  validPoolCounts,
} from './config';
export { addDays, addMinutes, clockLabel, DEMO_NOTICE, DEMO_ORG_ID, teamLabel } from './data';
export type { DropInDemo } from './dropin';
export { buildDropInDemo } from './dropin';
export type { LeagueDemo } from './league';
export { buildLeagueDemo } from './league';
export type { Outcome, Outcomes } from './results';
export {
  defaultOutcome,
  hash,
  opposite,
  outcomeOf,
  outcomesFromFlips,
  winnerSide,
} from './results';
export type { TournamentDemo } from './tournament';
export { buildTournamentDemo } from './tournament';
