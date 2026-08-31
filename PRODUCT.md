# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Three primary users, one per format. They are not one operator wearing three hats — they are different people doing different jobs, and the rhythm of the work differs more than the feature list does.

**The tournament organizer.** Runs a one-day event, typically 8–16 teams, pool play into a bracket. A campus rec coordinator, a club director, or a volunteer. Their work is front-loaded and then frantic: the grid is built in the days before, and on the day two teams no-show and it has to be rebuilt while forty people wait. They touch the tool **a few times a year**, so nothing can rely on remembered muscle memory.

*Today they use Excel or Google Sheets.*

**The league convener.** Runs a season — one night a week for roughly eight to twelve weeks, fixed teams. Often a club captain or a facility's programs person. Their work is thin but relentless: fixtures spread across the season, standings updated after every night, and a team that cannot make week six. They touch the tool **weekly**, so speed on repeated tasks matters more than discoverability.

*Today they use a Facebook group or group chat.*

**The drop-in host.** Runs a recurring session — individuals rather than teams, sides formed on the night. Usually facility or community-centre staff. Their work happens *during* play, standing on the sideline with a phone: who registered, who is waitlisted, who actually turned up, and how to rotate twenty people through two courts so nobody sits out twice in a row. They touch the tool **every session, mid-session**.

*Today they use a paper signup sheet at the door.*

**Players and spectators** are a secondary audience. They see schedules, live scores and standings because the three primary users need them to, and they are not who the product is designed for. As of August 2026 they *do* have accounts — enough to find their next match and manage their own attendance at a drop-in, and no more. A player account is not a profile: there are no stats, no history across competitions and no social surface. See [docs/DECISIONS.md](docs/DECISIONS.md).

## Product Purpose

CourtSync runs organized volleyball on a set of courts: scheduling, scoring, standings, attendance, and tracking who has paid their registration fee.

It exists because the three people above are each doing this in a tool that was not built for it, and each loses something as a result — the spreadsheet cannot rebalance a schedule when a team drops, the Facebook thread buries week six's reschedule in the scroll, and the paper sheet is thrown away at the end of the night.

Success is behavioural, not commercial:

- **Primary:** an organizer runs an entire event on it without falling back to their spreadsheet, group chat, or paper sheet. Binary, observable in one session.
- **Repeat:** for the weekly formats, they use it again the following week without being asked.
- **Referral:** they mention it to another organizer unprompted.

The product is free and has no revenue model, so these replace the signal that payment would otherwise provide.

## Positioning

**One data model that holds all three formats.** A competition is the root, and a session is one date of play — a tournament has one, a league has twelve, a drop-in has an open-ended series. Courts, participants, matches and results are the same underneath.

This is a mechanism rather than a feature list, and it is the thing a neighbouring product cannot truthfully copy without a rewrite: a tournament-rooted product assumes pools, a bracket, and a single day. Adding a league to it is not a feature, it is a new schema.

The second, quieter claim is against the actual incumbents rather than against other software: **the record outlives the session.** A spreadsheet mostly survives, a Facebook thread does not, and a paper sheet is discarded. None of the three can answer "what happened last week" without a human remembering.

Deliberately *not* claimed: being cheaper, faster, or more featureful than a commercial tournament platform. That comparison has not been tested and must not be asserted.

## Operating Context

- **Where:** a gym, community centre, or school hall with a fixed number of courts and a fixed window of time.
- **How:** at a desk beforehand for setup; on a phone at courtside during play, particularly for the drop-in host.
- **Connectivity:** assumed reliable. Venue wifi or phone data is good enough that score entry can be an ordinary request and live scores can poll. **Writes require a connection** — there is no queue, no sync and no conflict resolution, and none is planned. Reads are cached, so a schedule already fetched stays readable through a dropout.
- **Money:** registration fees are collected in person — cash, e-transfer, and similar. CourtSync records what was collected. It never handles the money.
- **What it replaces:** a spreadsheet grid, a group-chat thread, and a paper signup sheet. Each of the three users is switching from something different, so there is no single migration story.

## Capabilities and Constraints

**Confirmed capabilities.** Competition setup (courts, sessions, time slots, participants); schedule generation for all three formats; referee assignment balanced across participants; set-by-set score entry; computed standings with deterministic tiebreakers; playoff seeding and advancement; drop-in attendance, capacity and waitlist; payment tracking; public read-only views of schedule, scores and standings.

**Terminology.** `Competition` (root, with a format of tournament / league / dropin), `Session` (one date of play), `Timeslot`, `Court`, `Pool`, `Participant` (a team or an individual), `Attendance`, `Match`, `MatchSet`, `Transaction`, `Standing`. Full rationale in [docs/DOMAIN.md](docs/DOMAIN.md).

**Technical constraints.** Responsive web. Neon serverless Postgres, which ships no auth, no row-level security, no realtime and no file storage — everything a backend platform would provide is application code here. A single TypeScript Next.js app, installed with npm; no build step between the domain code and the app that uses it.

**Explicitly out of scope.** Payment processing, native mobile apps, player accounts and self-service, multi-sport, pickup-game coordination, and realtime subscriptions. Reasons for each in [docs/SCOPE.md](docs/SCOPE.md).

**Explicitly undecided.**

**All three of the questions previously listed here were settled in August 2026** — the auth library, which persona is served first, and the accessibility requirement. See [docs/DECISIONS.md](docs/DECISIONS.md) for each, and [docs/PLAN.md](docs/PLAN.md) for what follows from them.

## Brand Commitments

- **Name:** CourtSync. Settled.
- **Licence:** Apache-2.0, open source, public repository.
- **Free permanently.** No revenue model, no pricing, no paid tier, no feature withheld behind one. This is a product commitment, not a launch stance.

No logo, wordmark, colour, typeface or voice has been established. Nothing visual is binding.

## Evidence on Hand

**There is none, and this matters.** CourtSync has never been deployed and has no users. Every earlier prototype was also never deployed to real users.

Consequently there are **no** real rosters, results, standings, attendance records, testimonials, user counts, uptime figures, or case studies. All fixture and demo data is invented. Nothing in this project may present invented data as real, and no future copy may imply usage that has not happened.

What does exist as material:

- Working scheduling logic from a predecessor project, usable as a reference implementation.
- Four written product specs, from which the scoring rules, tiebreaker order and setup-wizard flow were carried forward.
- A domain model and a test suite specifying scheduling behaviour, in this repository.

## Product Principles

1. **Serve one persona at a time.** The three share a data model, not a release. Building for all three at once means finishing none.
2. **The record has to outlive the session.** Every incumbent fails at this, and it is the clearest thing the product can be better at.
3. **Match the rhythm of the user.** Obvious on return for the once-a-year organizer; fast on repetition for the weekly one; usable one-handed mid-session for the drop-in host. The same screen cannot serve all three equally, and pretending otherwise serves none.
4. **Never invent a result.** Standings are computed from matches, the fee ledger is append-only, and corrections are recorded rather than overwritten. Whoever ran the session is the only source of what happened.
5. **Free and whole.** No capability is withheld, degraded, or reserved. There is no tier to upgrade to.

## Accessibility & Inclusion

**Committed, August 2026:** keyboard navigation, semantic structure, labelled form
controls, and status never carried by colour alone. Verified by an automated axe
check in CI.

WCAG 2.2 AA is the direction, not a claim. Nothing has been audited, and asserting
conformance that has not been verified would be the same dishonesty as overstating a
test count.

The one constraint that came from the real room rather than from a standard:
**one-handed phone use.** The drop-in host is holding a phone and watching a court,
so nothing that matters sits where a thumb cannot reach it.
