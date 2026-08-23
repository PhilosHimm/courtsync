# Contributing to CourtSync

Thanks for contributing to CourtSync.

## Development setup

1. Install [pnpm](https://pnpm.io/).
2. Install dependencies:
   ```bash
   pnpm install
   ```
3. Run workspace checks:
   ```bash
   pnpm lint
   pnpm test
   ```

## Monorepo layout

- `apps/tournament`: tournament scoring experience
- `apps/scheduler`: tournament scheduling experience
- `apps/coordinator`: pickup game coordination experience
- `packages/core`: shared types, constants, utilities
- `packages/ui-components`: shared UI components
- `packages/shared-hooks`: shared React hooks

## Pull requests

- Keep changes focused and minimal.
- Add or update tests for changed behavior.
- Ensure lint, typecheck, and tests pass before opening PRs.
