# CourtSync Architecture

A pnpm monorepo: one application in `apps/`, shared libraries in `packages/`.

## Dependency flow

```
apps/organizer  ->  packages/scheduling  ->  packages/core
                ->  packages/ui-components
```

One-way, always. Packages never import application code.

## Workspaces

| Workspace | Purpose | State |
| --- | --- | --- |
| `apps/organizer` | The web app: setup, admin console, score entry, public views | Informational shell (landing + 3 persona pages); no database, no auth |
| `packages/core` | Domain types, constants, pure utils, SQL schema, test fixtures | Implemented |
| `packages/scheduling` | Pool play, league fixtures, drop-in rotation, referees, seeding, standings | Interfaces + specs; most implementations pending |
| `packages/ui-components` | Shared UI primitives | Empty |

## Why scheduling is a package rather than an app

Its value is pure functions with no persistence and no I/O — which makes it independently testable, and testable is what allows generated code to be reviewed at a glance rather than line by line. A second deployable would mean two organizer UIs and a question about which one to open.

## Raw TypeScript, no build step

Packages set `main` and `types` to `src/index.ts`. Consuming applications transpile workspace sources themselves (`transpilePackages` in Next.js). Keep this arrangement consistent across every package, or give every package a real build — do not mix the two.

Every workspace tsconfig extends the root [tsconfig.json](../tsconfig.json) so path aliases and strictness stay uniform.

## Testing strategy

Tests are the review mechanism, not an afterthought. Code is largely agent-generated; the human reviews decisions and reads test results rather than auditing every line.

Two kinds of suite live in `packages/scheduling/test/`:

- **Active** — must pass. Currently `match-ids.test.ts`.
- **`describe.skip`** — a written specification for a function that throws `NotImplementedError`. Implementing means un-skipping and making it pass.

Most assertions encode real defects from the predecessor codebase, cross-referenced to audit finding ids. [docs/PITFALLS.md](PITFALLS.md) explains each. Never weaken one to get a pass.

## Data layer

One schema: [packages/core/sql/0001_initial.sql](../packages/core/sql/0001_initial.sql), on **Neon** serverless Postgres. Plain Postgres, nothing provider-specific. Neon has no auth or row-level security of its own, so authorization is application code — see [PITFALLS.md](PITFALLS.md) C1 for why that matters here.

Standings are computed on read. There is no standings table, and there should never be one.
