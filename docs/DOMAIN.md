# Domain model

The types live in [`src/lib/core/types/`](../src/lib/core/types/). The schema is [`sql/0001_initial.sql`](../sql/0001_initial.sql). This document explains *why* the model has the shape it does.

The model is the only genuinely irreversible decision in the project. Everything else can be rewritten in an afternoon; a schema that three formats depend on cannot.

## The two changes that matter

Both predecessor models were **tournament-shaped**, and neither could hold a weekly league.

### 1. `Competition` replaces `Tournament` as the root

A root entity named `Tournament` bakes in assumptions that are wrong for two of the three formats: that there are pools, that there is a bracket, that it happens on one day. The predecessor model hard-coded `bracket?: 'gold' | 'silver' | 'bronze'` directly on the match.

`Competition` carries a `format` discriminator instead. Pools become optional. `bracket` and `roundLabel` become free text, because a tournament says "gold", a league says "Week 3", and a drop-in says nothing.

### 2. `Session` — one date of play

This single entity is what makes leagues and drop-ins expressible at all.

| Format | Sessions |
| --- | --- |
| Tournament | Exactly one |
| League | One per week, for a season |
| Drop-in | One per occurrence, open-ended |

Crucially, `Timeslot` hangs off a **session**, not off the competition. A league's week 3 gets its own grid of courts and times, independent of week 4. Without this, a season is a single undifferentiated pile of matches.

## Entity reference

```
Organization
└── Competition            format: tournament | league | dropin
    ├── Session            one date of play
    │   ├── Timeslot       schedulable slot on that date
    │   └── Attendance     who registered / waitlisted / showed up
    ├── Court
    ├── Pool               tournaments only, usually
    ├── Participant        a team, or an individual for drop-ins
    │   └── Transaction    append-only fee ledger
    └── Match
        └── MatchSet       one row per set
```

`Standing` is **not** in this tree. It is computed, never stored.

## Design decisions, and what each prevents

### Participant, not Team

A drop-in's participants are people who form sides on the night. Modelling them as one-person teams would work but reads badly everywhere and makes attendance awkward. `kind: 'team' | 'individual'` is honest about the difference.

### Standings are computed, never stored

The predecessor kept `wins`, `losses`, `points_for` and `points_against` as columns on the team row. They drifted out of sync with the matches they were supposed to summarize, and correcting a score did not correct the standings. That is audit finding H9.

There is no standings table and `Participant` has no such fields. `test/core/formats.test.ts` asserts their absence so the shortcut cannot creep back.

### MatchSet exists because volleyball has sets

scoop stored one `score_a` / `score_b` pair per match. A match that goes 25–20, 22–25, 15–13 had nowhere to live — and pool play in the original spec is two sets, while playoffs are best-of-three with a shorter decider. One score pair cannot represent either properly.

Set rules for both phases are in `src/lib/core/constants/index.ts`, carried over from the Tournament Scheduler MVP spec.

### Timeslots are timestamps, not labels

`startAt` and `endAt` are `timestamptz`. The predecessor formatted a 12-hour label and then sorted matches by re-parsing it, so `"12:00 AM"` sorted before `"12:00 PM"` and a tournament's final appeared above its opening match (C4). Format for display; sort on the timestamp.

### Attendance is a first-class entity

Capacity, waitlist and no-shows are the drop-in organizer's actual daily problem — not schedule generation. A drop-in is not a tournament with one pool, and pretending otherwise is how the format would get half-supported.

A database check constraint enforces that `waitlist_pos` is set exactly when `status = 'waitlist'`.

### Transactions are an append-only ledger

Payment tracking exists because organizers chase registration fees in spreadsheets. CourtSync records what the organizer collected — it never processes payments or touches a gateway.

Corrections are written as an `adjustment` row rather than by updating or deleting history, because an organizer has to be able to explain every number to a team captain who thinks they already paid.

### Free-text bracket and roundLabel

Tempting to make these enums. Don't. `'gold' | 'silver' | 'bronze'` on the match entity is precisely the tournament assumption that made the old model unable to hold a league.

## The model's definition of done

[`test/core/formats.test.ts`](../test/core/formats.test.ts) builds a 12-team tournament, a 10-week league season, and a recurring drop-in with a waitlist — all against the same types. If that suite cannot be made to pass, the model has regressed to tournament-shaped, which is the exact failure this project exists to fix.

The fixture builders in [`src/lib/core/testing/fixtures.ts`](../src/lib/core/testing/fixtures.ts) are also the fastest way to understand the model: they are the three formats written out concretely.

## Portability

The target is **Neon** serverless Postgres. The SQL is plain Postgres with nothing provider-specific, so it would run elsewhere unchanged.

`created_by` and `processed_by` are bare `uuid` columns with no foreign key. Neon ships no auth of its own, so which table user ids reference depends on the auth library, which is still open — see [DECISIONS.md](DECISIONS.md). Treat them as opaque until then, and add the constraint in a follow-up migration.
