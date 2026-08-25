# Known pitfalls

Every trap here was hit by a predecessor project and documented in scoopvolleyball's `BACKEND_AUDIT.md` (536 lines, 4 critical + 18 high findings). Ids like `C1` and `H7` refer to that document.

**Rewriting from scratch does not avoid these.** Several are the kind of mistake you walk into *because* you do not know about them. A few are already prevented structurally — those are marked. The rest are live.

Findings marked `[V]` in the original audit were verified by executing a faithful re-implementation and reproducing the arithmetic, not merely traced in source. Those became the test suites in `packages/scheduling/test/`.

---

## Security

### C1 — Route matchers are not an authorization boundary 🔴 live

None of the 24 exported server actions checked authorization. Middleware matched `/admin/:path*`, but Next.js registers server action ids **globally, not per route**, so a POST to any public route carrying `Next-Action: <id>` never passed through that matcher. Action ids are recoverable from client chunks.

Anyone could call `deleteTournament` or `updateMatchScore` against a live event.

**Rule:** every mutating path checks authorization itself, as its first statement. Middleware is defence in depth, never the boundary.

On Neon this is the whole defence — there is no row-level security underneath to catch a missed check. That makes this the single most important review gate in the project.

### C2 — The session cookie was the password 🔴 live

`ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "REDACTED"` — a fallback secret committed in the clear. The session cookie stored that same value, with no `secure` flag, and the check was `session === ADMIN_PASSWORD` against a repo-visible literal. Trivially forgeable with curl.

**Rule:** no fallback secrets, ever. Fail at boot if a required secret is missing. Store a random signed session id, never the secret itself. Set `secure` in production.

### Committed `.env` 🔴 live

`.env` was tracked despite being in `.gitignore` — added before the ignore rule could apply. It carried a live database URL and a real private API key.

**Rule:** get `.gitignore` right before the first `git add`. Read `git status --short` every time. Run `gitleaks detect` before any push.

---

## Correctness

### C3 — Divergent id schemes, and silent zero-row writes ✅ prevented

Three code paths created playoff matches with three different id formats (`slug-gold-q1`, `slug-q1`, `slug-m13`). The seeder only recognized the first, so imported brackets never populated — and because the update affected zero rows *without raising*, nothing ever surfaced it. The `already_seeded` guard never tripped, so it re-failed silently on every subsequent score entry.

**Prevented by:** `packages/scheduling/src/match-ids.ts` — one helper per id kind, plus `assertRowsAffected`. Covered by `test/match-ids.test.ts`, which is active.

### C4 — A display string used as a sort key ✅ prevented

`formatTime12h` did `% (24*60)` with nothing bounding day length, and matches were sorted by re-parsing the 12-hour label. `parseTime12h("12:00 AM") = 0`, so late matches sorted *ahead of* the morning opener. A realistic 14-team configuration put the semifinals and final at 1:15 AM and 2:15 AM, both sorting before every pool match.

**Prevented by:** `Timeslot.startAt` / `endAt` are `timestamptz`. Sort on those.

**Still live:** nothing stops someone formatting a label and sorting by it in the UI layer. Do not.

### H3 — No transactions anywhere 🔴 live

Not one multi-statement write was wrapped. A team-slot swap could destroy a participant's name partway through.

**Rule:** any write touching more than one row or table goes in a transaction.

### H9 — Denormalized standings drifted, and ties were nondeterministic 🔴 live

`wins`, `losses`, `points_for` and `points_against` lived on the team row and fell out of sync with the matches they summarized. Seeding also ignored actual records when ranking across pools, and a full tie resolved nondeterministically — so re-running the seed produced a different bracket.

**Rule:** standings are computed on read, never stored. The final tiebreaker must be a stable key (participant id), never `Math.random()` and never insertion order.

Spec: `packages/scheduling/test/standings.test.ts`.

### H6 — Round-robin front-loading `[V]` 🔴 live

The fixture ordering handed team 1 of every pool *n−1* consecutive matches at the start of the day, then nothing for the rest of it.

Spec: `packages/scheduling/test/pool-play.test.ts`.

### H7 — Unbalanced referee allocation `[V]` ✅ prevented

In a 4-team pool, team `a4` never refereed a single match. Balance is a requirement, not a nicety — organizers hear about it immediately.

**Prevented by:** least-loaded-first selection in `assignReferees`, rather than first-available.

**It came back once during implementation, which is worth knowing.** Load was being read off `refCounts`, the per-pool reporting structure. That structure only holds pool members, so any candidate reached through the cross-pool fallback was never counted — and a candidate with no count looks permanently idle, so the same person was picked every time. Identical symptom, completely different line of code.

The lesson generalises past referees: **a structure built for reporting is the wrong thing to make decisions from.** Load is now tracked flat across every possible candidate, and `refCounts` reports. Covered by `edge-cases.test.ts`.

Spec: `packages/scheduling/test/referees.test.ts`.

### H8 — Two contradictory seeding implementations `[V]` 🔴 live

Two code paths produced different brackets from identical standings.

**Rule:** one implementation of anything that produces a bracket.

### H14 — One-way advancement 🔴 live

Correcting a quarterfinal score never updated the semifinal already populated from it. Scores get corrected constantly during a real event.

### H15 — A tied elimination match deadlocked the bracket `[V]` 🔴 live

Nothing surfaced the problem; the bracket simply stopped advancing.

**Rule:** a tie in an elimination match is invalid input. Raise, do not ignore.

Spec for H8, H14, H15: `packages/scheduling/test/seeding.test.ts`.

### H10 — Multi-tier round labels broke every consumer `[V]` 🔴 live

Labels were generated inconsistently across tiers, and every UI that grouped on them broke.

### M5 — Forfeits distorted the tiebreaker 🔴 live

A forfeit injected a fabricated ±42 point differential into the only tiebreaker that mattered.

**Rule:** a forfeit is a win/loss with no points attached.

---

## Data layer

### H4 — Two conflicting schema definitions ✅ prevented

The migration script and the runtime table creation disagreed; production almost certainly had no foreign keys at all.

**Prevented by:** one schema, `packages/core/sql/0001_initial.sql`, with real constraints.

### H5 — No index on the tenant key ✅ prevented

Every hot query was a sequential scan.

**Prevented by:** indexes at the bottom of the migration.

### H18 — Module-level cache was not cluster-safe 🔴 live

An in-process `Map` cache assumed a single instance, and writes clobbered concurrent field updates.

**Rule:** no module-level mutable caches. Serverless runtimes give you many instances.

---

## Process

### H17 — Undo was a lossy snapshot 🔴 live

An undo feature snapshotted state and restored it wholesale, losing any write that landed in between.

**Rule:** if undo is needed, make it an event log, not a snapshot. Or do not build it.

### The meta-finding

The audit existed, was thorough, was correct — and nothing in it was ever fixed. Writing this document is not the same as acting on it.
