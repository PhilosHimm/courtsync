# Scope

What CourtSync is, and — more importantly — what it is not.

Scope creep is cheap when an agent writes the code. This document is the thing that says no.

## Three personas, one per format

Each format is run by a different kind of person with a different job. They are not one operator wearing three hats, and designing as if they were is how a product ends up fitting none of them.

What they share is the material: courts, time slots, participants, matches. That is why one data model serves all three. What differs is the rhythm of the work, and that drives almost every product decision.

### The tournament organizer

Runs a one-day event — typically 8 to 16 teams, pool play into a bracket. Might be a campus rec coordinator, a club director, or someone who volunteered and regretted it.

Their work is front-loaded and then frantic. The schedule gets built in a spreadsheet the week before; on the day, two teams no-show and the whole grid needs re-jigging while forty people stand around waiting. **They touch the tool a handful of times a year**, so it has to be obvious on each return — nothing can rely on remembered muscle memory.

Peak need: generate a schedule quickly, then change it under pressure without breaking referee assignments.

### The league convener

Runs a season — one night a week for eight to twelve weeks, fixed teams. Often a club captain or a facility's programs person.

Their work is thin but relentless. Fixtures spread across the whole season, standings updated after every night, and a team emails on Tuesday to say they cannot make week six. **They touch the tool weekly**, so it becomes routine — speed on repeated tasks matters more than discoverability.

Peak need: fixtures that survive rescheduling, and standings that stay correct without manual upkeep.

### The drop-in host

Runs a recurring session — individuals, not teams, sides formed on the night. Usually facility or community-centre staff.

Their work happens *during* play, on a phone, standing on the sideline. Who registered, who is on the waitlist, who actually turned up, and how to rotate twenty people through two courts so nobody sits out twice in a row. **They touch the tool every session, mid-session**, so it has to work one-handed and tolerate being interrupted.

Peak need: capacity and attendance, then a fair rotation.

### Everyone else

Players and spectators get read-only views — schedules, live scores, standings — because the three personas above need them to have those views. They are not who the product is designed for.

## How the formats differ

| | Tournament | Weekly league | Drop-in |
| --- | --- | --- | --- |
| **Sessions** | One day | One per week, a season | Recurring, open-ended |
| **Participants** | Registered teams, pooled | Fixed rosters | Individuals |
| **Core need** | Schedule generation, day-of adjustments | Fixtures, standings upkeep, rescheduling | Capacity, waitlist, attendance, court rotation |
| **Usage rhythm** | A few times a year | Weekly | Every session, during play |

All three share the model. **Only one persona gets served first** — see [DECISIONS.md](DECISIONS.md). Building for three at once means finishing none.

## In scope

- Competition setup: courts, sessions, timeslots, participants
- Schedule generation for all three formats
- Referee assignment, balanced across participants
- Score entry, set by set
- Computed standings with deterministic tiebreakers
- Playoff brackets: seeding and advancement
- Drop-in attendance, capacity and waitlist
- Payment tracking — recording what the organizer collected
- Public read-only views of schedule, scores and standings

## Out of scope

Each of these was considered and rejected. Reopening one requires a reason, not an impulse.

| Not building | Why |
| --- | --- |
| **Pickup game coordination** (propose times, vote, confirm) | A separate private project owns this. It is a different persona — a friend group, not an organizer. |
| **Payment processing** | CourtSync records what the organizer collected. It never touches money, holds funds, or integrates a gateway. That is a compliance burden with no user benefit here. |
| **Player profiles, stats, highlights, social** | Different persona again. Side-Out Studios did this and is complete. |
| **Native mobile apps** | Responsive web works on a phone at a gym. |
| **Multi-sport** | Volleyball only until one of the three personas actually uses it. Generalizing before validating is how the predecessor repos died. |
| **Realtime everything** | Live scores may justify it eventually. Polling is fine for one gym. |
| **Accounts for players** | Whoever is running the session enters the data. Player self-service is a whole auth surface for unproven benefit. |
| **Anything for scale** | Caching, queues, sharding, multi-region. There are zero users. |

## Non-goals as a project

- **Not a business.** Free, open source, Apache-2.0, no revenue, no pricing page.
- **Not seeking contributors yet.** The repo is public, but issue templates, a code of conduct, and PR review turnaround are deliberately deferred until an organizer has run a real event on it. Contributors follow users.
- **Not a portfolio showcase first.** The portfolio value is a byproduct of it actually being used. Building for the demo rather than the organizer inverts that.

## The bar for adding something

Before adding a feature, answer two questions:

1. **Which of the three personas is this for?** If the answer is "all of them", be suspicious — the three have genuinely different rhythms, and something that serves all three equally is often serving none of them well.
2. **Which real person asked for it, and when?**

"It would be cool" and "it is easy for an agent to add" are not answers. Neither is "a real product would have it."
