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
npm test                       # vitest run — the pure suites, no database needed
npm run test:db                # the data layer against a real Postgres (TEST_DATABASE_URL)
npm run test:e2e               # the built app in a real browser, with axe (TEST_DATABASE_URL)
npm run typecheck
npm run lint                   # biome check .
npm run lint:fix               # biome check --write .
npm run build

npm test -- test/scheduling    # one directory
npm test -- test/core/formats  # one file
```

Test totals are not written down here: they went stale every time they were.
Run the suites and read the numbers.

## Seeing it work

`npm run dev`, then `/demo/tournament`: the engine running in the browser on
invented data, saving nothing. The real app — `/events`, `/e/[id]` — needs the
environment below.

## Environment

The app refuses to start with anything missing, and names everything that is
(`src/lib/db/env.ts`, checked at boot from `src/instrumentation.ts`). Nothing has a
default — CLAUDE.md rule 7. `next build` needs none of it.

| Variable | Where it comes from | What it is |
| --- | --- | --- |
| `DATABASE_URL` | Vercel → Neon integration | The Neon Postgres connection string |
| `NEON_AUTH_BASE_URL` | Vercel → Neon integration (Neon Auth enabled) | The Neon Auth endpoint for the project |
| `NEON_AUTH_COOKIE_SECRET` | You, in Vercel's environment variables | At least 32 random characters, e.g. `openssl rand -hex 32` |
| `APP_URL` | Optional on Vercel | The public origin. Defaults to `https://$VERCEL_PROJECT_PRODUCTION_URL`, which Vercel sets |
| `EMAIL_PROVIDER`, `RESEND_API_KEY`, `EMAIL_FROM` | Optional | Turn on email delivery. All three, or none |
| `SMS_PROVIDER`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `SMS_FROM` | Optional | Turn on SMS. All four, or none |
| `CRON_SECRET` | Required with either provider | Guards `/api/notifications/deliver`. Set the same value as a GitHub Actions secret, plus an `APP_URL` repository variable, to turn on the five-minute delivery workflow (`.github/workflows/deliver-notifications.yml`) |

With no provider configured, notifications are still queued and shown in-app;
nothing is sent. Enable Twilio's Advanced Opt-Out so "STOP" replies unsubscribe.

Delivery is scheduled from GitHub Actions rather than Vercel Cron: the Hobby plan
allows a cron at most once a day and rejects the whole deployment otherwise.

**Before the first deploy with this code:** the three required variables must be set
in the Vercel project, and the migrations in `sql/` applied to the Neon database in
order (`psql "$DATABASE_URL" -f sql/0001_initial.sql` and so on). A deploy without
them fails at boot, by design.

## Database

`sql/` holds the schema as numbered migrations, applied in order. Neon serverless
Postgres in production; any Postgres 16 locally.

A `DATABASE_URL` on `localhost` is served with `pg` over TCP instead of Neon's
WebSocket driver (`src/lib/db/client.ts`), so the app runs against a local Postgres
for development and for the browser suite.

`npm run test:db` and `npm run test:e2e` need `TEST_DATABASE_URL`: a Postgres the
suites may create databases on. Each data-layer suite gets its own database, cloned
from a template built from `sql/`; the browser suite rebuilds `courtsync_e2e`.

```bash
# one-off, with Docker
docker run -d --name courtsync-pg -p 5432:5432 \
  -e POSTGRES_USER=courtsync -e POSTGRES_HOST_AUTH_METHOD=trust postgres:16
export TEST_DATABASE_URL=postgres://courtsync@localhost:5432/courtsync
npm run test:db && npm run build && npm run test:e2e
```

The browser suite covers everything a person without an account touches. Organizer
flows need a Neon Auth session, which it cannot mint; they are covered against
Postgres by `npm run test:db`.

## Before your first commit

- Confirm `.env` files are ignored: `git status --short` should never list one
- `npm run lint && npm run typecheck && npm test` all clean

## CI

[`.github/workflows/ci.yml`](../.github/workflows/ci.yml) runs on every pull request and on pushes to `main`:

- **verify** — `lint`, `typecheck`, `test`, `build`, in that order, installed with `npm ci` so a lockfile that disagrees with `package.json` fails rather than resolving something else
- **data layer · browser** — a throwaway Postgres 16 service, then `test:db`, `build` and `test:e2e`
- **secret scan** — gitleaks over the **full history**, not just the tip. A credential that was committed and later deleted is still reachable in history, so scanning only the tip would report it clean

Running the same four commands locally before pushing is the fastest way to keep CI green.
