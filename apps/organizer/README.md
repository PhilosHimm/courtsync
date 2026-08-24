# Organizer App

The CourtSync web application. **Not built yet** — this workspace is empty.

One app serving three personas, one per format: a **tournament organizer** running a one-day event, a **league convener** running a season, and a **drop-in host** running a recurring session. They share the same material — courts, time slots, participants, matches — but work at very different rhythms. Full detail in [PRODUCT.md](../../PRODUCT.md).

Build for one of them first. All three at once means finishing none.

## Before starting this

Two things should happen first:

1. **Choose an auth library.** The database is settled — Neon serverless Postgres — but Neon ships no auth, so this is still open and it blocks every mutating path ([docs/DECISIONS.md](../../docs/DECISIONS.md)). Hand-rolling it is not an option; that is exactly what produced findings C1 and C2.
2. **Implement the scheduling package.** An app with no schedule generation has nothing to show an organizer.

## When it is built

- Extend the root [tsconfig.json](../../tsconfig.json) so path aliases and strictness stay uniform
- Add `transpilePackages` for `@courtsync/core` and `@courtsync/scheduling` — packages ship raw TypeScript
- Add `@neondatabase/serverless` and read `DATABASE_URL` from the environment. **No fallback value, ever** — fail at boot if it is missing
- Add `dev`, `build`, `lint`, `test` and `typecheck` scripts; the root scripts pick them up via `--if-present`
- Restore the root `dev` script once there is something to run

## Authorization is the review gate

Neon has no row-level security to catch a missed check, so application code is the entire defence. Every mutating server action calls its authorization check as the **first statement**, with no exceptions — a route matcher is not a boundary, because Next.js registers server action ids globally.

## Reference, not a source

`scoopvolleyball` is a useful reference for app structure, admin flows and score entry. It is **not** a source to copy from — see [docs/PITFALLS.md](../../docs/PITFALLS.md) for what went wrong in it, particularly C1 and C2 on authorization.
