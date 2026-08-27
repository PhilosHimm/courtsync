# CourtSync Architecture

A single Next.js application at the repo root, installed with plain `npm`. Domain and scheduling code live under `src/lib/` as ordinary directories.

## Dependency flow

```
src/app, src/components  ->  src/lib/scheduling  ->  src/lib/core
```

One-way, always. `src/lib/` never imports application code.

Until the flatten this was enforced mechanically: `core` and `scheduling` were separate pnpm packages, and `core` simply could not resolve `scheduling`. Now they are directories in one compilation unit and nothing stops a wrong-direction import but review. If that starts slipping, an `import/no-restricted-paths`-style rule is the fix, not a return to workspaces.

## Layout

| Directory | Purpose | State |
| --- | --- | --- |
| `src/app`, `src/components` | The web app: setup, admin console, score entry, public views | Informational shell (landing + 3 persona pages); no database, no auth |
| `src/lib/core` | Domain types, constants, pure utils, test fixtures | Implemented |
| `src/lib/scheduling` | Pool play, league fixtures, drop-in rotation, referees, seeding, standings | Implemented |
| `test/core`, `test/scheduling` | Vitest suites mirroring the two `src/lib` directories | 163 tests, none skipped |
| `test/personas.test.ts` | Holds the area pages’ status copy to what the engine exports | 19 tests |
| `sql/` | Postgres schema | One migration |

## Why scheduling is a library rather than a route

Its value is pure functions with no persistence and no I/O — which makes it independently testable, and testable is what allows generated code to be reviewed at a glance rather than line by line. Keeping it out of `src/app` keeps it callable from a route handler, a server action, or a test without dragging React along.

## No build step

`src/lib` is compiled by whoever consumes it — Next for the app, Vitest for the tests. There is no intermediate `dist`, no `transpilePackages`, and one [tsconfig.json](../tsconfig.json) covering every file in the repo.

The `@/*` → `src/*` alias is declared in two places, because Vitest does not read tsconfig `paths`: `compilerOptions.paths` in [tsconfig.json](../tsconfig.json), and `resolve.alias` in [vitest.config.ts](../vitest.config.ts). They must agree.

## Testing strategy

Tests are the review mechanism, not an afterthought. Code is largely agent-generated; the human reviews decisions and reads test results rather than auditing every line.

Every suite in `test/scheduling/` is active and passing — 123 tests across nine files, none skipped. `test/core/` adds 40 more, for 163, and `test/personas.test.ts` adds 19: 182 in total.

That last file is not a scheduling spec. The area pages state, in numbers, what is finished, and those claims had gone stale — every persona still advertised pool play, league fixtures and the drop-in rotation as future work months after all three shipped. It asserts the copy names only functions the engine really exports and still admits what is missing. Understating what is built is as dishonest as overstating it.

Three kinds of suite: per-function specs, `edge-cases.test.ts` for degenerate input, and `integration.test.ts` for whole competitions. The last of those is where interface seams surface — a shape that looks right in a unit test but does not fit the next function along.

Many assertions encode real defects from the predecessor codebase, cross-referenced to audit finding ids. [docs/PITFALLS.md](PITFALLS.md) explains each. Never weaken one to get a pass.

These tests are the specification for scheduling behaviour, not a regression net bolted on afterwards — each function was written against its suite. Three of them shaped their implementation rather than merely passing it: H6 forced round-based placement over greedy earliest-slot, H7 forced least-loaded referee selection over first-available, and H9 forced a hand-written sort because pairwise head-to-head is not transitive.

## Data layer

One schema: [sql/0001_initial.sql](../sql/0001_initial.sql), on **Neon** serverless Postgres. Plain Postgres, nothing provider-specific. Neon has no auth or row-level security of its own, so authorization is application code — see [PITFALLS.md](PITFALLS.md) for why that matters here.

Standings are computed on read. There is no standings table, and there should never be one.
