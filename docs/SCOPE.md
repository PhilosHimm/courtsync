# Scope

What CourtSync builds, and — more importantly — what it deliberately does not. For who it's for and why, see [PRODUCT.md](../PRODUCT.md); this document exists to say no.

Scope creep is cheap when an agent writes the code. Every row below was a deliberate cut, not an oversight.

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
- Player accounts, for coordinating one's own attendance (added August 2026)
- Notification delivery — email and SMS for cancellations, changes and waitlist promotions

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
| ~~**Accounts for players**~~ | **Reversed, August 2026.** Players now get accounts — see [DECISIONS.md](DECISIONS.md). The original reasoning (a whole auth surface for unproven benefit) is recorded there alongside what the reversal costs. Player *profiles, stats and history* remain out of scope: an account coordinates your own attendance, it does not accumulate a record. |
| **Anything for scale** | Caching, queues, sharding, multi-region. There are zero users. |

## Non-goals as a project

- **Not a business.** Free, open source, Apache-2.0, no revenue, no pricing page.
- **Not seeking contributors yet.** The repo is public, but issue templates, a code of conduct, and PR review turnaround are deliberately deferred until an organizer has run a real event on it. Contributors follow users.
- **Not a portfolio showcase first.** The portfolio value is a byproduct of it actually being used. Building for the demo rather than the organizer inverts that.

## The bar for adding something

Before adding a feature, answer two questions:

1. **Which persona is this for?** ([PRODUCT.md](../PRODUCT.md) has all three.) If the answer is "all of them", be suspicious — they have genuinely different rhythms, and something that serves all three equally is often serving none of them well.
2. **Which real person asked for it, and when?**

"It would be cool" and "it is easy for an agent to add" are not answers. Neither is "a real product would have it."
