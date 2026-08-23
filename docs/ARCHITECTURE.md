# CourtSync Architecture

CourtSync is organized as a pnpm monorepo with deployable applications in `apps/` and shared libraries in `packages/`.

## Apps

- `apps/tournament` contains tournament scoring and results functionality.
- `apps/scheduler` contains tournament scheduling and bracket planning functionality.
- `apps/coordinator` contains pickup game proposal and coordination functionality.

## Shared packages

- `packages/core` hosts shared domain types, constants, and utility functions.
- `packages/ui-components` hosts reusable UI components.
- `packages/shared-hooks` hosts reusable React hooks.

## Dependency direction

Apps depend on shared packages. Shared packages should not depend on app code.
