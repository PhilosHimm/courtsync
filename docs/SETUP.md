# CourtSync Setup

## Requirements

- Node.js 20+
- pnpm 10+

## Install

```bash
pnpm install
```

## Commands

```bash
pnpm dev                                  # apps/organizer at localhost:3000
pnpm test                                 # every workspace
pnpm typecheck
pnpm lint                                 # biome check .
pnpm lint:fix                             # biome check --write .
pnpm format

pnpm --filter @courtsync/core test        # one workspace
pnpm --filter @courtsync/scheduling test:watch
```

`pnpm dev` runs the informational shell only — a landing page and one page per persona (`/tournaments`, `/leagues`, `/dropins`). No database, no auth, no forms that submit anywhere. See [CLAUDE.md](../CLAUDE.md)'s Current state section for exactly what that does and doesn't mean.

## What you should see

`pnpm test` runs 159 tests and skips none: 40 in `@courtsync/core` and 119 in `@courtsync/scheduling`, covering pool play, referees, standings, bracket seeding and advancement, drop-in rotation and league fixtures — plus boundary cases and end-to-end runs of a full tournament, a league season and a drop-in night.

The scheduling engine is complete and pure — no database, no clock, no randomness. Same input, same output, every time.

## Database

No database is required to run the tests; everything is pure functions over in-memory fixtures.

The schema lives at [`packages/core/sql/0001_initial.sql`](../packages/core/sql/0001_initial.sql) and targets **Neon** serverless Postgres. Which auth library sits on top is still open and blocks `apps/organizer` — see [DECISIONS.md](DECISIONS.md).

## Before your first commit

- Confirm `.env` files are ignored: `git status --short` should never list one
- `pnpm lint && pnpm typecheck && pnpm test` all clean

## CI

[`.github/workflows/ci.yml`](../.github/workflows/ci.yml) runs on every pull request and on pushes to `main`:

- **verify** — `lint`, `typecheck`, `test`, `build`, in that order, with `--frozen-lockfile` so a lockfile that disagrees with `package.json` fails rather than resolving something else
- **secret scan** — gitleaks over the **full history**, not just the tip. A credential that was committed and later deleted is still in history, which is exactly how the predecessor project leaked a live database URL

Running the same four commands locally before pushing is the fastest way to keep CI green.
