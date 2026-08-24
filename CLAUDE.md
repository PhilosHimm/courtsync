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

The domain model and the scheduling package's *interfaces* exist. Most scheduling **implementations do not** — they throw `NotImplementedError` and each has a matching `describe.skip` suite in `test/` that fully specifies the required behaviour.

`apps/organizer` is a Next.js 16 app, but it is an **informational shell, not a working product**: a landing page and one area page per persona (`/tournaments`, `/leagues`, `/dropins`), no database, no auth, no mutations. It exists to give the three personas a real front door and to prove the routing and design system before any functional build starts. The functional build is still blocked on the auth decision below and on the scheduling implementations above.

## Commands

```bash
pnpm install                              # Node 20+, pnpm 10+
pnpm test                                 # fans out to every workspace
pnpm typecheck
pnpm lint                                 # biome check .
pnpm lint:fix
pnpm --filter @courtsync/scheduling test  # single workspace
```

Workspaces are addressed by npm name (`@courtsync/core`, `@courtsync/scheduling`, `@courtsync/ui-components`, `@courtsync/organizer`), not directory path.

## How to implement a scheduling function

Every unimplemented function follows the same loop. **Do not deviate from it.**

1. Find the `describe.skip(...)` suite named in the `NotImplementedError` message.
2. Remove `.skip`. Read every assertion — they encode real bugs from the predecessor codebase.
3. Implement until the suite passes.
4. Delete the `throw new NotImplementedError(...)`.

**Never weaken an assertion to make a test pass.** Each one exists because the behaviour it forbids actually shipped and actually broke. If an assertion seems wrong, say so and stop — do not edit it and continue.

If new behaviour is discovered mid-implementation, add a test for it rather than leaving it undocumented.

## Architectural rules

These are not preferences. Violating any of them reintroduces a bug that already happened.

1. **Standings are computed, never stored.** There is no standings table and `Participant` carries no win/loss columns. Denormalizing them is what caused audit finding H9.
2. **Sort on timestamps, never on display strings.** `Timeslot.startAt` is the sort key. Formatting a 12-hour label and sorting by it put a tournament's final above its opening match (C4).
3. **Match ids come from `packages/scheduling/src/match-ids.ts`.** Never build one with string concatenation. Three divergent id schemes are why imported brackets silently never populated (C3).
4. **Assert row counts after bulk writes.** Use `assertRowsAffected`. A write affecting zero rows must fail loudly, not silently.
5. **Multi-statement writes go in a transaction.** The predecessor had none anywhere, and a partial write could destroy a participant's name (H3).
6. **Authorization belongs at the data layer, not in middleware.** Route matchers are not a security boundary — Next.js server action ids are registered globally (C1). Every mutating path checks authorization itself.
7. **No credentials in the repo, ever.** No fallback secrets in code — not even a default. A committed `ADMIN_PASSWORD ?? "..."` fallback was a critical finding (C2).
8. **The transaction ledger is append-only.** Correct mistakes with an `adjustment` row; never update or delete history.
9. **Scheduling functions are pure and deterministic.** Same input, same output. No `Date.now()`, no `Math.random()`, no I/O. Every suite asserts this.
10. **Never mutate function inputs.** Return new objects.

## Architecture

Three deployable-ish workspaces, one-way dependency flow:

```
apps/organizer  ->  packages/scheduling  ->  packages/core
                ->  packages/ui-components
```

- **`packages/core`** — domain types, constants, small pure utils, the SQL schema in `sql/`, and fixture builders in `src/testing/`. Depends on nothing.
- **`packages/scheduling`** — pool play, league fixtures, drop-in rotation, referees, seeding, standings. Pure functions, no persistence, no I/O.
- **`packages/ui-components`** — shared UI. Currently empty.
- **`apps/organizer`** — the web app. Next.js 16, App Router, Tailwind v4. Currently an informational shell (landing + three persona area pages); no database, no auth, no mutations yet.

Packages never import app code. Apps never import each other (there is only one).

**Packages ship raw TypeScript.** `main`/`types` point at `src/index.ts` with no build step, so a consuming app must transpile workspace sources itself (`transpilePackages` in Next.js). Keep this consistent or give every package a real build — do not mix.

App tsconfigs must `extends` the root [tsconfig.json](tsconfig.json) so path aliases and strictness stay uniform.

## The domain model in one paragraph

`Competition` is the root, with a `format` discriminator of `tournament | league | dropin`. A `Session` is one date of play — a tournament has one, a league has one per week, a drop-in has an open-ended series. `Timeslot` hangs off a session, so each week has its own independent grid. `Participant` replaces "team" because a drop-in's participants are individuals; `Attendance` tracks who registered, waitlisted, checked in, or no-showed. `Match` holds `MatchSet[]` so a best-of-three has somewhere to live. `Transaction` is an append-only ledger of fees the organizer collects.

Full rationale: [docs/DOMAIN.md](docs/DOMAIN.md). Schema: [packages/core/sql/0001_initial.sql](packages/core/sql/0001_initial.sql).

**The model must hold all three formats.** `packages/core/test/formats.test.ts` proves it. If a change breaks that suite, the model has regressed to being tournament-shaped — which is the exact failure this project exists to fix.

## Known pitfalls

[docs/PITFALLS.md](docs/PITFALLS.md) lists every trap inherited from the predecessor codebase, with the audit finding id. Read it before implementing scheduling or auth. Rewriting from scratch does not avoid these — several are the kind of mistake you walk into precisely because you do not know about them.

## Database

**Neon** (serverless Postgres), settled. `@neondatabase/serverless` is the client.

Neon is a database, not a backend platform — no auth, no row-level security by default, no realtime, no file storage. Everything Supabase would have handled is application code here, and **authorization is the highest-risk part of this build** because the predecessor's two critical findings were both auth failures.

Consequences to hold onto:

- The authorization boundary is application code. Rule 6 below is not negotiable.
- Live scores use polling, not subscriptions. Do not add a realtime layer for one gym.
- `created_by` and `processed_by` are bare `uuid` columns. They get foreign keys once the auth decision lands.
- Neon serverless is HTTP-based; a query is a round trip. Batch reads rather than looping queries, and use a transaction for multi-statement writes (rule 5).

## Open decisions

[docs/DECISIONS.md](docs/DECISIONS.md) tracks what is settled and what is not. **Which auth library to use on Neon is still open, and blocks `apps/organizer`.** Hand-rolling it is not on the table — that is what produced C1 and C2.

## Conventions

- Workspace globs live in **both** [package.json](package.json) and [pnpm-workspace.yaml](pnpm-workspace.yaml); update both.
- Every workspace is `"private": true` and Apache-2.0.
- Formatting and linting are Biome, configured in [biome.json](biome.json). Single quotes, semicolons, 100 columns, 2-space indent.
- Relative imports are **extensionless** (`./types/index`, not `./types/index.js`). `moduleResolution: Bundler` allows it and Vite resolves it natively; explicit `.js` specifiers that map to `.ts` sources are the fragile path under Vitest.
- Type-only imports use `import type` — `verbatimModuleSyntax` is on, so this is enforced.
- `noUncheckedIndexedAccess` is on: indexing an array yields `T | undefined`. Handle it or assert with `!` (Biome's `noNonNullAssertion` is disabled for this reason).
