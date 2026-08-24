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

`pnpm test` runs the active suites: the domain fixtures in `@courtsync/core` and the match-id helpers in `@courtsync/scheduling`.

Most scheduling suites are `describe.skip`. That is deliberate — they are written specifications for functions that throw `NotImplementedError`. Vitest reports them as skipped, not failed.

## Database

No database is required to run the tests; everything is pure functions over in-memory fixtures.

The schema lives at [`packages/core/sql/0001_initial.sql`](../packages/core/sql/0001_initial.sql) and targets **Neon** serverless Postgres. Which auth library sits on top is still open and blocks `apps/organizer` — see [DECISIONS.md](DECISIONS.md).

## Before your first commit

- Confirm `.env` files are ignored: `git status --short` should never list one
- `pnpm lint && pnpm typecheck && pnpm test` all clean
