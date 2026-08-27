# Provenance

CourtSync carries no git history from its predecessors. This document is the record instead — what came before, what carried forward, and what was deliberately left behind.

Several volleyball projects preceded this one, built between January 2025 and August 2026. Most had twelve commits or fewer. **None was ever deployed to real users.** Each restarted rather than building on the last: the scheduler's algorithms never reached scoop's database, and scoop rebuilt scheduling from scratch and ended up with a weaker version.

Consolidating them is the first time the work compounds instead of resetting. That, rather than tidiness, is the reason this repository exists.

---

## The predecessors

### scoopvolleyball → the closest thing to a basis
46 commits · Next 16, React 19, Neon Postgres

The only one with real persistence, an admin console, live scores, playoff brackets, and a written architecture audit.

**Carried forward:** the audit (see below), the documentation discipline, the theme-token module shape, the general application structure as a reference for the app.

**Left behind:** the flat two-table schema, the hand-rolled auth, the entire ice-cream brand identity, the ImageKit gallery, and `lib/schedule-template.ts` — the version audit findings H6 and H10 condemn.

### Volleyball-tournament-scheduler → the algorithms
12 commits · ~2,100 lines of constraint-based scheduling

Never deployed, but the strongest technical asset of the lot. Pool assignment, rest windows, referee rotation with load balancing, a drag-and-drop schedule board.

**Carried forward:** the algorithms are the reference implementation for `src/lib/scheduling`, and its entity model was the starting point for `src/lib/core`.

**Left behind:** the `Tournament` root entity, which could not express a league.

### Volleyballgameplatform → a UI kit
4 commits · Figma Make export · 49 Radix/shadcn primitives

**Carried forward:** potentially the UI primitives, if the app wants a Radix base. Nothing else.

**Left behind:** the application itself. It was a pickup-coordination product — a different persona from an organizer — and out of scope here.

### Facilitated-dropin and drop-in-sports-app → the idea, not the code
5 and 2 commits · 261 lines between them · CRA

`Facilitated-dropin` literally contained `drop-in-sports-app` nested inside it, plus 292 committed `node_modules` files.

**Carried forward: the idea only.** These are where the drop-in format came from, and the drop-in path in `src/lib/scheduling` is their descendant even though not one line survives. Lineage of ideas is worth recording; lineage of files is not.

### Side-Out Studios (ITM445) → untouched
A live volleyball coverage site with real published content — the only one of them ever deployed. Different persona (players tracking themselves), coursework, complete. Deliberately not disturbed.

---

## The audit is the most valuable inheritance

`scoopvolleyball/BACKEND_AUDIT.md` — 536 lines, 4 critical and 18 high findings, none of them ever fixed.

In a rewrite it stops being a fix-list and becomes a **specification**. Findings marked `[V]` were verified by executing a faithful re-implementation and reproducing the arithmetic, which means each one is a test case with a known-correct expected answer, already written up.

They now live as:

- [`docs/PITFALLS.md`](PITFALLS.md) — every trap, with its finding id
- `test/scheduling/` — the verified findings as executable specs
- The architectural rules in [`CLAUDE.md`](../CLAUDE.md) — each one prevents a specific finding

Several findings are already structurally impossible in the new model: C3 by the shared id helpers, C4 by storing timestamps rather than labels, H4 and H5 by the single schema with real constraints and indexes.

---

## Specs that carried forward

Four written specs preceded this repository, kept in Notion:

- **Volleyball Tournament Management System — Combined MVP Spec** — the best domain artifact of the lot. Its SQL, with UUID keys, real foreign keys and `match_set`, is the direct ancestor of `sql/0001_initial.sql`. It also introduced payment tracking and the Supabase direction.
- **Volleyball Tournament Scheduler — MVP Spec** — superseded by the Combined spec, but kept unique detail that survived: the five-step creation wizard, the pool auto-creation heuristic, the referee assignment algorithm, and the scoring and tiebreaker rules now in `src/lib/core/constants/`.
- **Tournament Payment Tracker — MVP Spec** — fully absorbed into the Combined spec.
- **VBall App - Complete Build Prompt** — the Propose & Decide product. Out of scope here.

---

## What changed in the model, and why

The predecessor schemas were tournament-shaped and could not hold a weekly league. Two changes fixed that: `Competition` replaced `Tournament` as the root entity with a format discriminator, and `Session` was introduced as one date of play so a league season is a sequence of them rather than an undifferentiated pile of matches.

Full reasoning in [`DOMAIN.md`](DOMAIN.md).
