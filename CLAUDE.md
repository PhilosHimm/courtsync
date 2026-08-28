# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

CourtSync is an open-source tool for **three personas, one per format**:

| Persona | Runs | Rhythm | Peak need |
| --- | --- | --- | --- |
| **Tournament organizer** | A one-day event, pools into a bracket | A few times a year | Generate a schedule, then change it under pressure |
| **League convener** | A season, one night a week | Weekly | Fixtures that survive rescheduling, standings that stay correct |
| **Drop-in host** | A recurring session, individuals not teams | Every session, mid-play, on a phone | Capacity, waitlist, attendance, fair rotation |

They are not one operator wearing three hats. What they share is the material — courts, time slots, participants, matches — which is why one data model serves all three. What differs is the rhythm of the work, and that drives most product decisions. Tracking who has paid their registration fee matters to all three.

It is free, has no revenue model, and is not a startup. [PRODUCT.md](PRODUCT.md) is the source of truth on users, positioning and principles; read [docs/SCOPE.md](docs/SCOPE.md) before proposing a feature.

**Nobody has used this yet.** It is pre-first-deployment. Do not add scale-oriented machinery (caching layers, queues, multi-region anything) for load that does not exist.

## Current state

The domain model and the **whole scheduling engine** are implemented: the seeded pool draw, pool play, referee assignment, standings, bracket seeding and advancement, drop-in rotation, and league fixtures. 255 tests pass and none are skipped, including boundary coverage, bracket shapes beyond the eight-team draw (byes, tiers, pool counts other than two), the seeded pool draw, a purity sweep over every exported function, and end-to-end flows that run a whole tournament, league season and drop-in night. A further 19 in `test/personas.test.ts` hold the app’s status copy to what the engine actually exports, and 61 in `test/demo/` hold demo mode to running the real engine on data that is visibly invented — 335 in total.

Nothing is wired to a database. The engine is pure functions over in-memory data — which is exactly why it could be built while the auth decision is still open, and why demo mode can put a UI on it without one.

This is a Next.js 16 app, but it is **not a working product**: no database, no auth, no mutations. It is two things. An informational shell — a landing page and one area page per persona (`/tournaments`, `/leagues`, `/dropins`) — and **demo mode** at `/demo`, which runs the finished engine in the browser on invented data and saves nothing. **The auth decision below is now the only thing blocking the functional build** — the engine behind it is finished and tested.

Demo mode is documented in [docs/DEMO.md](docs/DEMO.md). Two rules about it that are easy to break:

- **It never persists anything, and never gets an auth exception.** It can ship before the auth decision precisely because it has no data layer to authorize. A "demo user" or a bypass would make it the one hole in rule 6 below.
- **It is not where features go.** [docs/SCOPE.md](docs/SCOPE.md) says building for the demo rather than the organizer inverts this project's priorities. It is a window onto work that already existed, not the work.

## Commands

```bash
npm install                    # Node 20+
npm run dev                    # localhost:3000
npm test                       # vitest run, whole suite
npm run typecheck
npm run lint                   # biome check .
npm run lint:fix
npm run build

npm test -- test/scheduling    # one directory
npm test -- test/core/formats  # one file
```

`npm run dev` then `/demo/tournament` is the fastest way to see the engine actually run — see [docs/DEMO.md](docs/DEMO.md).

One package at the repo root — no workspaces, no `pnpm --filter`. Plain `npm` is the package manager, and `@/*` resolves to `src/*` in both tsconfig and Vitest.

## How to add a scheduling function

Every function currently in the package was built this way, and a new one follows the same loop. **Do not deviate from it.**

1. Declare the function throwing `NotImplementedError` with a pointer to its spec file.
2. Write the spec first, as a `describe.skip(...)` suite.
3. Remove `.skip`. Read every assertion.
4. Implement until the suite passes, then delete the throw.

**Never weaken an assertion to make a test pass.** Many existing assertions encode real bugs from the predecessor codebase — the behaviour they forbid actually shipped and actually broke. If an assertion seems wrong, say so and stop — do not edit it and continue.

If new behaviour is discovered mid-implementation, add a test for it rather than leaving it undocumented. `competitionId` falling back to the slug, and a referee never working two courts at once, both arrived that way.

**The existing tests are the specification.** Changing scheduling behaviour means changing a test first and being able to say why.

## How to split a change into PRs

**One format per pull request.** A tournament change, a league change and a drop-in change are three PRs, not one. The three personas have different rhythms and will be reviewed, deployed and reverted on different schedules — a drop-in host waiting on a bracket fix to land is the coupling this rule exists to prevent.

The exception is a change that genuinely serves all three: auth, users, security, the domain model, the schema, CI, the design system. Those are one PR, because splitting them by format would mean three PRs that only work once all three merge.

Which bucket a file is in:

| Part | Files |
| --- | --- |
| **Tournament** | `scheduling/pool-draw.ts`, `pool-play.ts`, `referees.ts`, `seeding.ts`; `src/app/tournaments`; their spec suites and `bracket-shapes.test.ts` |
| **League** | `scheduling/league-fixtures.ts`; `src/app/leagues`; `league-fixtures.test.ts` |
| **Drop-in** | `scheduling/dropin-rotation.ts`; `src/app/dropins`; `dropin-rotation.test.ts` |
| **All three** | `src/lib/core` (types, constants, utils, fixtures); `scheduling/round-robin.ts` (pool play *and* league fixtures); `scheduling/match-ids.ts`; `scheduling/standings.ts` (tournament *and* league); `sql/`; `src/components`; `src/lib/personas.ts`; auth and anything security-touching; config, CI and docs |

Three things that make the rule workable rather than aspirational:

- **A format PR may touch the shared suites for its own format only.** `edge-cases.test.ts`, `integration.test.ts` and `purity.test.ts` cover all three, and a tournament change adding a tournament block to them is still a tournament PR.
- **Shared first, then the format on top.** When a format change needs something from `core` or from a shared scheduling function, land the shared piece as its own PR and build the format PR on it. Do not smuggle a `core` change through as part of a bracket fix.
- **`personas.ts` box-score counts follow their own format's rows.** A tournament PR updates the tournament rows. Where a shared function appears on two areas — `computeStandings` does — its count changes in a shared PR, since `test/personas.test.ts` asserts both areas report the same number.

If a change resists splitting, say so and explain why rather than quietly shipping one PR that spans two formats.

## Architectural rules

These are not preferences. Violating any of them reintroduces a bug that already happened.

1. **Standings are computed, never stored.** There is no standings table and `Participant` carries no win/loss columns. Denormalizing them is what caused audit finding H9.
2. **Sort on timestamps, never on display strings.** `Timeslot.startAt` is the sort key. Formatting a 12-hour label and sorting by it put a tournament's final above its opening match (C4).
3. **Match ids come from `src/lib/scheduling/match-ids.ts`.** Never build one with string concatenation. Three divergent id schemes are why imported brackets silently never populated (C3).
4. **Assert row counts after bulk writes.** Use `assertRowsAffected`. A write affecting zero rows must fail loudly, not silently.
5. **Multi-statement writes go in a transaction.** The predecessor had none anywhere, and a partial write could destroy a participant's name (H3).
6. **Authorization belongs at the data layer, not in middleware.** Route matchers are not a security boundary — Next.js server action ids are registered globally. Every mutating path checks authorization itself.
7. **No credentials in the repo, ever.** No fallback secrets in code — not even a default. Fail at boot when a required secret is missing.
8. **The transaction ledger is append-only.** Correct mistakes with an `adjustment` row; never update or delete history.
9. **Scheduling functions are pure and deterministic.** Same input, same output. No `Date.now()`, no `Math.random()`, no I/O. Every suite asserts this.
10. **Never mutate function inputs.** Return new objects.

## Architecture

One Next.js app. The old workspace boundaries survive as directories under `src/lib/`, and the dependency flow is still one-way:

```
src/app, src/components  ->  src/lib/demo  ->  src/lib/scheduling  ->  src/lib/core
```

- **`src/lib/core`** — domain types, constants, small pure utils, and fixture builders in `testing/`. Depends on nothing.
- **`src/lib/scheduling`** — pool play, league fixtures, drop-in rotation, referees, seeding, standings. Pure functions, no persistence, no I/O.
- **`src/lib/demo`** — the demo scenarios. Pure and deterministic; may import `scheduling` and `core` and nothing else. Deliberately does **not** import `core/testing/fixtures` — those builders are pinned by a model regression suite and are not the demo's to bend.
- **`src/app`, `src/components`** — the web app. Next.js 16, App Router, Tailwind v4. Informational shell plus demo mode; no database, no auth, no mutations yet.
- **`test/`** — Vitest suites: `test/core/`, `test/scheduling/` and `test/demo/`, mirroring the `src/lib/` directories they cover.
- **`sql/`** — the Postgres schema.

**`src/lib/` never imports app code.** Nothing under `src/lib/core` or `src/lib/scheduling` may import from `src/app` or `src/components`, and `core` may not import `scheduling`. This used to be enforced by pnpm's package boundaries; since the flatten it is a convention that review has to hold, so state it in the PR when you touch either directory.

There is no build step for `src/lib` — Next and Vitest compile the TypeScript sources directly. `transpilePackages` is gone along with the workspaces.

## The domain model in one paragraph

`Competition` is the root, with a `format` discriminator of `tournament | league | dropin`. A `Session` is one date of play — a tournament has one, a league has one per week, a drop-in has an open-ended series. `Timeslot` hangs off a session, so each week has its own independent grid. `Participant` replaces "team" because a drop-in's participants are individuals; `Attendance` tracks who registered, waitlisted, checked in, or no-showed. `Match` holds `MatchSet[]` so a best-of-three has somewhere to live. `Transaction` is an append-only ledger of fees the organizer collects.

Full rationale: [docs/DOMAIN.md](docs/DOMAIN.md). Schema: [sql/0001_initial.sql](sql/0001_initial.sql).

**The model must hold all three formats.** `test/core/formats.test.ts` proves it. If a change breaks that suite, the model has regressed to being tournament-shaped — which is the exact failure this project exists to fix.

## Known pitfalls

[docs/PITFALLS.md](docs/PITFALLS.md) lists every trap inherited from the predecessor codebase, with the audit finding id. Read it before implementing scheduling or auth. Rewriting from scratch does not avoid these — several are the kind of mistake you walk into precisely because you do not know about them.

## Database

**Neon** (serverless Postgres), settled. `@neondatabase/serverless` is the client.

Neon is a database, not a backend platform — no auth, no row-level security by default, no realtime, no file storage. Everything Supabase would have handled is application code here, and **authorization is the highest-risk part of this build** because nothing under the application layer will catch a missed check.

Consequences to hold onto:

- The authorization boundary is application code. Rule 6 below is not negotiable.
- Live scores use polling, not subscriptions. Do not add a realtime layer for one gym.
- `created_by` and `processed_by` are bare `uuid` columns. They get foreign keys once the auth decision lands.
- Neon serverless is HTTP-based; a query is a round trip. Batch reads rather than looping queries, and use a transaction for multi-statement writes (rule 5).

## Open decisions

[docs/DECISIONS.md](docs/DECISIONS.md) tracks what is settled and what is not. **Which auth library to use on Neon is still open, and blocks the functional build.** Hand-rolling it is not on the table.

## Conventions

- The package is `"private": true` and Apache-2.0. One [package.json](package.json), one [tsconfig.json](tsconfig.json) — no workspace globs to keep in sync.
- Imports across `src/` use the `@/` alias (`@/lib/core`, `@/components/SiteHeader`), not deep relative paths. It is declared twice — [tsconfig.json](tsconfig.json) `paths` for the editor and `tsc`, and `resolve.alias` in [vitest.config.ts](vitest.config.ts) for the tests. **Change one and you must change the other**; Vitest does not read tsconfig paths.
- Formatting and linting are Biome, configured in [biome.json](biome.json). Single quotes, semicolons, 100 columns, 2-space indent.
- Relative imports are **extensionless** (`./types/index`, not `./types/index.js`). `moduleResolution: Bundler` allows it and Vite resolves it natively; explicit `.js` specifiers that map to `.ts` sources are the fragile path under Vitest.
- Type-only imports use `import type` — `verbatimModuleSyntax` is on, so this is enforced.
- `noUncheckedIndexedAccess` is on: indexing an array yields `T | undefined`. Handle it or assert with `!` (Biome's `noNonNullAssertion` is disabled for this reason).
