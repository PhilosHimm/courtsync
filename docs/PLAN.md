# Implementation plan — the functional build

Written August 2026, from the PRD, the competitive research behind it
([docs/research/competitive-landscape-2026.md](research/competitive-landscape-2026.md)),
and a 70-question working session with the project owner. It supersedes nothing:
[PRODUCT.md](../PRODUCT.md), [SCOPE.md](SCOPE.md) and [DECISIONS.md](DECISIONS.md)
remain the source of truth, and the decisions taken in that session are recorded
there rather than only here. This file says what gets built, in what order, and why
that order.

The engine is finished. Everything below is the application around it.

## What the research changed

Three findings from the competitive report that the PRD did not carry forward, and
that change decisions rather than decorate them.

**Javelin Sports is a direct, funded competitor for the drop-in persona**, in
Canada specifically, with a discovery feed, in-app payments and per-game chat.
That is network-effect territory, and a solo free tool does not win it by being
slightly better. It is the strongest argument yet for the build order chosen here:
the tournament organizer has no equivalent incumbent aimed at *local* one-day
events — the volleyball-specific platforms in that space (SportsEngine AES,
SportWrench, VBSchedule) are all sold to clubs and governing bodies, and the report
notes the general platforms are "heavy and overkill for single-tournament local
organizers". That gap is real and it is where this product starts.

**The report independently reaches PRODUCT.md's positioning.** Its closing section
names "unified treatment of tournaments, leagues, and drop-ins with consistent
scheduling and court management" as the strategic position — arrived at from a
survey of twenty products rather than from this repository's own reasoning. Two
independent derivations of the same claim is the best evidence this project has for
anything. It also means the league is not optional: dropping it, as the PRD's §7.1
proposed, would discard the differentiator both documents identify.

**One recommendation is rejected outright.** §4.7 advises precomputing standings
"to avoid heavy recomputation on each view". That is audit finding H9 — the
predecessor denormalized wins, losses and points onto the team row and they drifted
out of sync with the matches they summarized. Rule 1 stands: standings are computed,
never stored. The performance concern it raises is real for thousands of matches and
imaginary for a gym with four courts.

The report also flags privacy controls for minors (§4.6). Youth volleyball is most
of the market it surveys, and it bears directly on the decision to publish rosters —
see *Public pages* below.

## The decisions, in one table

| Area | Decided |
| --- | --- |
| Canon | Decision records govern; the PRD supplies asks, not authority |
| Goal | Working tool first, polish and documentation after |
| Personas | All three keep their interface; **tournament organizer first** |
| Database | Neon, confirmed. Supabase considered and declined again |
| Auth | Managed, users in the same Postgres — see [DECISIONS.md](DECISIONS.md) |
| Players | **Get accounts.** Reverses SCOPE.md; recorded there |
| Scorekeepers | Per-match link, no login |
| Roles | Organizer (owner), co-organizer, player |
| Organizations | Dropped. Events hang off a user id |
| Offline | Cached reads survive a dropout; writes require a connection |
| Backup | Whole-event JSON export and import |
| Storage | Direct queries, no repository layer. Numbered SQL migrations |
| Divisions | Separate competitions, grouped for a combined view |
| Sessions | Multi-day tournaments supported |
| Venue | Promoted to a real entity with reusable courts |
| Courts | Carry their own availability windows |
| Slots | Generated from a pattern, then editable; length varies by stage |
| Moving a match | Tap the match, pick a valid slot. Suggestions provided |
| Publishing | Visibility only. Blocking conflicts warn and can be overridden |
| Regeneration | Never touches a match that has been played |
| No-shows | Withdraw the team, keep the grid, forfeit their matches |
| Scoring | Final set scores. Validation warns, never blocks |
| Set formats | Per competition, by stage |
| Score edits | Confirmation plus a recorded change history |
| Match status | Adds `delayed` and `cancelled` |
| Forfeits | Policy is per event: forfeit score, or win-with-no-points |
| Tiebreakers | **Organizer reorders them** |
| Standings | Per-row reasoning, order shown, last score time, changed rows marked |
| Drop-in | Self check-in with host override; walk-ins added by name |
| Waitlist | Automatic promotion, with notification |
| Notifications | In-app, email and SMS |
| Public pages | Fully public and indexable |
| Public names | Rosters and attendance shown as first name plus initial |
| Live scores | Polling on a timer |
| Analytics | Aggregate and privacy-preserving only |
| Views | Match list, court timeline, my schedule, team view |
| Filters | Team search, court, status. Day and week are navigation |
| Bracket | Stage-by-stage navigation on mobile |
| Status display | Text label plus colour, never colour alone |
| Accessibility | Keyboard and semantics committed; axe in CI |
| Design system | Apple's stays; documented in Storybook |
| Print | Generated PDF |
| Testing | Playwright on core flows |
| Deployment | Vercel, public |

## Scope reality

This is larger than the PRD's own MVP, not smaller. The PRD recommended stopping
after its Phase 3; the decisions above land past its Phase 5, and the research
report's Phase 3 as well. Player accounts, email and SMS delivery, public indexable
pages, four schedule views, configurable tiebreakers, per-court scheduling, an edit
history, Storybook, generated PDFs and Playwright are each defensible and together
substantial.

Stated plainly so it is a choice rather than a drift: at several days a week this is
many months of work. The sequencing below exists to make that survivable — every
stage ends somewhere shippable, and no stage requires the next one to be useful.

## Sequencing

### Stage 0 — foundations (no code)

Decision records updated with the reversals, the research report committed, the auth
library chosen. Done alongside this plan.

### Stage 1 — the model and the data layer

The schema changes are one migration, not five, because they interlock: dropping
`Organization` changes what a competition belongs to, and `Venue` becomes what
courts belong to.

1. Migration: drop `Organization`; add `Venue`; courts gain a venue and availability
   windows; sessions become plural per tournament; add `delayed` and `cancelled`;
   add the score-edit history table; add per-competition format and tiebreaker
   settings.
2. Auth wired, users in Postgres, foreign keys finally added to `created_by` and
   `processed_by` — the follow-up DECISIONS.md has been waiting on.
3. Authorization at the data layer (rule 6), transactions on multi-statement writes
   (rule 5), `assertRowsAffected` on bulk writes (rule 4).

Shippable as: nothing a user sees. This is the only stage without a visible
deliverable, which is why it is one stage rather than three.

### Stage 2 — the tournament organizer, end to end

The persona chosen first, and the one with the most engine behind it already.

4. Event CRUD, four starter templates, archive and delete, JSON backup.
5. The setup wizard: basics, format, teams, courts and time, schedule, review.
   Saves on each step change.
6. The schedule board: court timeline, tap-to-move with suggested slots, the audit's
   conflicts, the withdraw-a-team flow.
7. Score entry via per-match links, with the confirmation and history.
8. Standings with reasoning, and the bracket with stage navigation.

Shippable as: an organizer can run a whole tournament. This is the first point at
which the product exists.

### Stage 3 — everyone who is not the organizer

9. Public event pages, indexable, with names reduced to first-plus-initial
   server-side.
10. Polling for live scores; the match list and team views.
11. Player accounts, my schedule, the profile and notification preferences.

Shippable as: the organizer stops answering "when do we play?" by text message.

### Stage 4 — the drop-in host

12. Sessions, capacity, waitlist with automatic promotion, self check-in with host
    override, walk-ins by name.
13. Notification delivery — email and SMS, with consent and unsubscribe. The first
    thing here that costs money and collects a phone number.
14. Announcements and cancellation.

### Stage 5 — the league convener

15. Seasons, weekly fixtures, rescheduling a week, cumulative standings.

### Stage 6 — quality

16. Keyboard and semantics pass, axe in CI.
17. Storybook documenting the existing Apple-derived system.
18. Playwright on the core flows.
19. PDF schedule and bracket.
20. Aggregate analytics.

### Running in parallel, unblocked

None of this needs auth, persistence or a decision from Stage 0. It can start
immediately and should, because it is all engine work and the engine is where this
project's rules bite hardest:

- `suggestSlots` — where a match could legally move.
- Standings: per-row reasoning, configurable tiebreaker order.
- Per-competition set formats and the forfeit policy.
- Court availability windows across all three generators.
- `auditSchedule` extended to flag a match outside its court's window.

Every one follows the loop in [CLAUDE.md](../CLAUDE.md): declare it throwing
`NotImplementedError`, write the spec as a skipped suite, un-skip, implement,
delete the throw. **Configurable tiebreakers is the riskiest edit in the codebase** —
`computeStandings` carries 30 tests and `seedBrackets`, the bracket templates and
`bracketDrift` all read its output order. It gets its own PR and its own review.

## How this splits into pull requests

[CLAUDE.md](../CLAUDE.md) requires one format per PR, with shared work landing
first and separately. Applied here:

- Stage 1 is entirely shared — schema, auth, data layer. One PR each, in order.
- Stage 2 is tournament PRs, each building on the shared layer beneath it.
- Stages 4 and 5 are drop-in and league PRs respectively.
- The parallel engine work is shared except court windows, which touches all three
  generators and therefore lands as one shared PR rather than three format PRs.
- Stage 6 is shared throughout.

## Deferred, with the reason

Named here so they are findable rather than forgotten. Everything in this list comes
from the research report or the PRD and was not taken up.

| Deferred | Why |
| --- | --- |
| Swiss format, double elimination | The PRD defers both; no organizer has asked |
| Ranking-based seeding | H9 territory — a manual rank must never outrank a played record |
| iCal and calendar feeds | Genuinely useful, and cheap once events persist. First candidate after Stage 5 |
| Embeddable widgets, mapping, discovery feed | Growth features. There are no users to grow yet |
| Chat, leaderboards, achievements, player pages | SCOPE.md rules these out as a different product |
| Payment processing, cost splitting, platform fees | Permanent. CourtSync records what was collected and never touches money |
| Wave scheduling, AI scheduling | The greedy scheduler is understandable, which the PRD itself argues matters more |
| Per-player stats (kills, blocks, digs) | Out of scope; a roster here is a name on a sheet |
| Multi-tenant organizations | Dropped deliberately; revisit if a real club needs it |
| Realtime subscriptions | Polling is sanctioned and sufficient for one gym |
| Precomputed standings | Rejected. This is H9 |
