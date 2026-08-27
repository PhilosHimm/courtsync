# CourtSync Setup

## Requirements

- Node.js 20+

npm ships with Node, and nothing else is needed. (Until the flatten this was a pnpm
workspace and `npm install` could not install it at all — see [DECISIONS.md](DECISIONS.md).)

## Install

```bash
npm install
```

## Commands

```bash
npm run dev                    # localhost:3000
npm test                       # vitest run, whole suite
npm run test:watch
npm run typecheck
npm run lint                   # biome check .
npm run lint:fix               # biome check --write .
npm run format
npm run build

npm test -- test/scheduling    # one directory
npm test -- test/core/formats  # one file
```

`npm run dev` runs the informational shell only — a landing page and one page per persona (`/tournaments`, `/leagues`, `/dropins`). No database, no auth, no forms that submit anywhere. See [CLAUDE.md](../CLAUDE.md)'s Current state section for exactly what that does and doesn't mean.

## What you should see

`npm test` runs 182 tests and skips none: 40 in `test/core/`, 123 in `test/scheduling/`, and 19 in `test/personas.test.ts`, covering pool play, referees, standings, bracket seeding and advancement, drop-in rotation and league fixtures — plus boundary cases and end-to-end runs of a full tournament, a league season and a drop-in night.

The scheduling engine is complete and pure — no database, no clock, no randomness. Same input, same output, every time.

## Database

No database is required to run the tests; everything is pure functions over in-memory fixtures.

The schema lives at [`sql/0001_initial.sql`](../sql/0001_initial.sql) and targets **Neon** serverless Postgres. Which auth library sits on top is still open and blocks every mutating path — see [DECISIONS.md](DECISIONS.md).

## Before your first commit

- Confirm `.env` files are ignored: `git status --short` should never list one
- `npm run lint && npm run typecheck && npm test` all clean

## CI

[`.github/workflows/ci.yml`](../.github/workflows/ci.yml) runs on every pull request and on pushes to `main`:

- **verify** — `lint`, `typecheck`, `test`, `build`, in that order, installed with `npm ci` so a lockfile that disagrees with `package.json` fails rather than resolving something else
- **secret scan** — gitleaks over the **full history**, not just the tip. A credential that was committed and later deleted is still reachable in history, so scanning only the tip would report it clean

Running the same four commands locally before pushing is the fastest way to keep CI green.
