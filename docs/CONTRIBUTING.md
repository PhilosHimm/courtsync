# Contributing to CourtSync

Thanks for contributing to CourtSync.

## Development setup

1. Install [Node.js](https://nodejs.org/) 20 or newer. npm comes with it.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Run the checks:
   ```bash
   npm run lint
   npm run typecheck
   npm test
   ```

Full command list in [SETUP.md](SETUP.md).

## Layout

One Next.js app at the repo root:

- `src/app`: routes (App Router)
- `src/components`: shared React components
- `src/lib/core`: domain types, constants, utilities, test fixtures
- `src/lib/scheduling`: pool play, league fixtures, drop-in rotation, referees, seeding, standings
- `test/core`, `test/scheduling`: Vitest suites mirroring the two `src/lib` directories
- `sql/`: Postgres schema

`src/lib/` must not import from `src/app` or `src/components`, and `core` must not import `scheduling`. Nothing enforces this mechanically since the flatten — see [ARCHITECTURE.md](ARCHITECTURE.md).

## Pull requests

- Keep changes focused and minimal.
- **One format per PR.** Tournament, league and drop-in changes go in separate pull requests. A change that genuinely serves all three — auth, the domain model, the schema, CI, the design system — is one PR. [CLAUDE.md](../CLAUDE.md) has the file-by-file breakdown.
- Add or update tests for changed behavior.
- Never weaken an existing scheduling assertion to make a test pass — many encode real defects from the predecessor codebase ([PITFALLS.md](PITFALLS.md)). If one looks wrong, say so and stop.
- Ensure lint, typecheck, and tests pass before opening PRs.
