# PRD reconciliation — August 2026

A full product requirements document was written for CourtSync in August 2026 — "an open-source, mobile-first volleyball coordination platform" — covering tournaments, drop-ins, scheduling, scoring, standings, exports, offline storage, a design system and a six-phase roadmap. This file records how that PRD lands against this codebase, so every ask ends up in exactly one of four places: already built, built now, blocked, or declined with the decision that declines it. Nothing is silently dropped.

> **Superseded in part, August 2026.** A 70-question working session with the
> project owner took several of the asks below the other way — player accounts,
> Storybook, cached offline reads, `delayed`/`cancelled` statuses, configurable
> tiebreakers, per-court availability, a real `Venue`, multi-day tournaments and
> public indexable pages are all now in. Each reversal is recorded with its
> reasoning in [DECISIONS.md](DECISIONS.md); the build order is in
> [PLAN.md](PLAN.md). This file is kept as the record of how the PRD read against
> the codebase when it arrived, not as a current statement of scope.

Where the PRD and this repository disagree, [PRODUCT.md](../PRODUCT.md), [SCOPE.md](SCOPE.md) and [DECISIONS.md](DECISIONS.md) remain the source of truth. A PRD is a proposal; those files are the record of proposals already weighed.

## Already built before the PRD arrived

Most of the PRD's functional core (§7, §12) is the scheduling engine, implemented and specified by the suites in `test/`:

| PRD ask | Where it lives |
| --- | --- |
| Round-robin pool play (§7.2) | `generatePoolPlay`, `roundRobinRounds` |
| Pool play into single elimination (§7.2) | `seedBrackets`, `advanceBracket` |
| Best-of-three, configurable set targets (§7.2) | `setFormatFor`, `setFormatOf`, `POOL_PLAY_SETS` / `PLAYOFF_SETS` |
| Manual team seeding (§7.2) | `Participant.seed`, read by `drawPools` |
| Automatic pool standings (§7.2, §7.5) | `computeStandings` — wins, sets, points, differentials, penalties |
| Automatic bracket advancement (§7.2) | `advanceBracket`, plus `bracketDrift` for corrected scores |
| Tiebreaker sequence (§7.5) | `TIEBREAKER_ORDER` is the PRD's recommended order: match wins, head-to-head, set differential, point differential — with a deterministic final key instead of "manual resolution", because a re-run that ranks differently is audit finding H9 |
| Score edits without losing history (§7.5, §12) | Standings recomputed on read; the fee ledger is append-only |
| Drop-in capacity, waitlist, attendance (§7.6) | `Attendance`, `generateDropInRotation`, `promoteFromWaitlist` |
| Referee / scorekeeper staffing (§5) | `assignReferees` |
| Minimum rest between matches (§7.4) | `PoolPlayInput.minRestSlots` |
| Deterministic, inspectable schedules (§7.4, §14) | Rule 9 — pure functions, output is plain data, and the purity sweep proves it |

The PRD's "deterministic greedy approach… prioritize understandable results" describes what the generators already do.

## Built now, from the PRD's unmet asks

Two asks were genuinely in scope, unblocked, and missing. Both are pure functions, both serve all three formats, and both landed spec-first:

- **Schedule conflict identification (§7.4, §8.4, §12).** The generators are conflict-free by construction, but nothing re-checked a schedule after the organizer moved a match by hand — which is the tournament persona's peak moment. `auditSchedule` reports court double-bookings, participants (including referees) in two places at once, rest violations and unplaced matches, split into blocking conflicts and warnings so a publish flow can gate on one without nagging about the other. Spec: `test/scheduling/schedule-audit.test.ts`.
- **Data portability (§12).** CSV exports for the entry list, rosters, the schedule, results, standings and drop-in attendance: `participantsToCsv`, `rosterToCsv`, `scheduleToCsv`, `resultsToCsv`, `standingsToCsv`, `attendanceToCsv` in `src/lib/core/export`. The record outliving the session is the product's second claim (PRODUCT.md), and an export the organizer can walk away with is half of that claim. Spec: `test/core/export.test.ts`.

## Blocked on the open auth decision

Everything in the PRD that saves, publishes, or belongs to somebody waits on the one open decision in [DECISIONS.md](DECISIONS.md) — which auth library sits on Neon. That includes: event create/edit/duplicate/archive/delete and draft→published states (§12), shareable event URLs (§12), the guided setup wizard (§8.1, §10 — already listed as a gap on the tournament area page), join/leave/waitlist self-service (§8.2), score entry screens (§8.3), announcements (§7.6), and organizer dashboards (§9). The engine behind all of it is finished; none of the mutating surface can be written first, because on Neon the authorization boundary is application code (rule 6) and there is no RLS underneath to catch a missed check.

## Asked for, but already decided the other way

Each of these was weighed before the PRD and declined on the record. The PRD does not reopen them — reopening needs a reason the original decision did not consider (SCOPE.md).

| PRD ask | Standing decision |
| --- | --- |
| Supabase for persistence and auth (§13, §14, Phase 4) | **Neon**, decided in DECISIONS.md with Supabase as the explicitly considered alternative. The consequence — authorization lives in application code — is recorded there and in CLAUDE.md rule 6. |
| IndexedDB, local-first storage, offline behavior (§13, §14, §17) | PRODUCT.md, Operating Context: connectivity is assumed reliable, **there is no offline requirement, and no local queue-and-sync store is planned**. The PRD's "local-first reliability" premise is the one part of its problem statement this product does not share. |
| Repository interfaces over swappable storage adapters (§13) | The engine is already isolated from storage — it is pure functions with no I/O — which is the substance of the ask. An IndexedDB adapter is ruled out with offline storage above. |
| Player accounts, My schedule, profiles, saved teams, notifications (§5, §9, §17) | SCOPE.md: **no accounts for players**. Players and spectators are a read-only audience (PRODUCT.md); whoever runs the session enters the data. |
| `Standing` as a stored core entity (§13) | Rule 1 / audit finding H9: standings are computed, never stored. The PRD's entity list would reintroduce the exact denormalization bug this schema exists to prevent. |
| Repository restructure into `app/`, `domain/`, `repositories/` (§19) | DECISIONS.md, *Flattened to a single npm package*: the boundaries live under `src/lib/` in one compilation unit, and reversing that is config with no code payoff. |
| Storybook, contribution guide, issue templates (§14, §16, Phase 3) | DECISIONS.md: contributor infrastructure is deferred until an organizer has run a real event — contributors follow users. CI is the exception and already exists. |
| "Payment collection should not be implemented… may support a future fee field" (§7.6) | Backwards, and settled the other way: payment **tracking** is in scope and built (`Competition.registrationFee`, the append-only `Transaction` ledger, `summarizePayments`); payment **processing** is permanently out (SCOPE.md). |
| Organizations with many members, multi-org administration (§13) | `Organization` exists as one row for one person's club. Multi-user membership waits on auth; enterprise administration is a PRD non-goal and out of scope here too. |
| Portfolio-first framing and success metrics (§1, §16, §18) | SCOPE.md, non-goals: **not a portfolio showcase first**. The portfolio value is a byproduct of an organizer actually using it. |
| Match statuses `delayed` and `cancelled` (§12) | Not adopted now. The schema has `scheduled / live / final / forfeit`; widening the enum is a schema change with no organizer behind it yet — it meets neither question SCOPE.md asks before adding something. Recorded here so the ask is findable when a real organizer needs it. |
| Playwright end-to-end tests, Vercel deployment (§14) | Undecided rather than declined — nothing in DECISIONS.md settles deployment or browser testing. Neither is taken up here: both belong with the functional build they would exercise. |

## Where the PRD and this repository already agree

The PRD's own deferrals (§4, §7.2, §20) — Swiss system, double elimination, ranking-based seeding, payment processing, native apps, public discovery, chat, AI scheduling, realtime sync — match SCOPE.md's cuts or postdate the same reasoning. Its risk table's first mitigation ("start with one well-defined format, make rules configurable later") is how the engine was actually built, and its warning against collecting sensitive player data is why a roster row is a name and a jersey number, not a person.
