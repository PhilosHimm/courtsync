# Demo mode

Demo mode runs the finished scheduling engine in the browser, on invented data, with **no account, no database and nothing saved**. It exists so the one claim this project currently makes — that the engine is done — can be checked by anyone instead of taken on trust.

Routes:

| Route | What it runs |
| --- | --- |
| `/demo` | Front door, and the honest statement of what it is not |
| `/demo/tournament` | `drawPools` → `generatePoolPlay` → `assignReferees` → `computeStandings` → `seedBrackets` → `advanceBracket` |
| `/demo/league` | `generateLeagueFixtures` → `computeStandings` |
| `/demo/dropins` | `promoteFromWaitlist` → `generateDropInRotation` |

Nothing on those pages is a mockup. Every match id comes from [`src/lib/scheduling/match-ids.ts`](../src/lib/scheduling/match-ids.ts), every table comes from `computeStandings`, and every referee comes from `assignReferees`.

## Why it can ship before auth

[DECISIONS.md](DECISIONS.md) has the auth library still open, and [CLAUDE.md](../CLAUDE.md) rule 6 puts authorization at the data layer because nothing under the application will catch a missed check. Demo mode's answer is to have no data layer:

- Every page is a pure function of the query string. There is no write path, no session, and no row belonging to anybody.
- When auth lands it goes in front of the real app. **Demo mode must never be given an exception, a bypass, or a "demo user".** The moment it needs one, it has stopped being a demo.

If a future demo feature seems to need persistence, that is the signal it belongs in the real app behind auth, not here.

## Why the state lives in the URL

The link *is* the save file. Paste it into a message and the person who opens it sees the same schedule, on their machine, with nothing stored anywhere. That only works because the whole layer is deterministic — no `Date.now()`, no `Math.random()`, fixed dates, and scorelines hashed from the match id.

Two copy actions on every board:

- **Copy link** — the configuration and any corrections you made.
- **Copy data as JSON** — the generated schedule as real `Match` rows, which is the shape the app will eventually write.

The address bar is kept in step with `history.replaceState` as you change controls, so the browser's own copy works too.

## Honesty rules

[PRODUCT.md](../PRODUCT.md) forbids presenting invented data as real. Demo mode is where that stops being obvious, because the schedule genuinely is computed and the standings genuinely are correct. So:

- Every id is prefixed `demo-`, which travels with the JSON.
- Names are visibly placeholders: `Team A`, `Player 07`, `Demo Gym`, `Demo Open`.
- `DEMO_NOTICE` is rendered on every board.
- When the engine cannot do something — a day too short for the field, a weekly grid too small for the fixtures — the board says so. It never quietly drops matches to look tidier.

## Layout

```
src/lib/demo/         pure; may import scheduling and core, nothing else
  config.ts           query-string parsing. The demo's whole trust boundary
  data.ts             the invented competitions, teams, players, courts, timeslots
  results.ts          deterministic scorelines, and the corrections a visitor makes
  tournament.ts       \
  league.ts            } one builder per format, each driving the real engine
  dropin.ts           /
src/components/demo/  the boards, the controls, the share bar
src/app/demo/         one route per format; parses searchParams and hands it down
test/demo/            78 tests over the layer above
```

The dependency flow gains one link and keeps its direction:

```
src/app, src/components  ->  src/lib/demo  ->  src/lib/scheduling  ->  src/lib/core
```

`src/lib/demo` is never imported by `scheduling` or `core`, and never imports app code — `test/demo/scenarios.test.ts` asserts this by reading the sources.

## What it deliberately does not import

Not [`src/lib/core/testing/fixtures.ts`](../src/lib/core/testing/fixtures.ts). Those builders say on their first line that application code must never import them: they exist to prove the model holds all three formats, and their shapes are pinned by `test/core/formats.test.ts`. Sharing them would tie what a page renders to what a model regression test asserts, and the first product tweak to the demo would fail a suite about something else entirely.

## Hostile input

A query string is attacker-controlled text, and the engine throws on input it cannot schedule — `drawPools` refuses a pool count that would produce a pool of two. Every knob therefore **clamps rather than rejects**, and the pool count snaps to the nearest legal one. A demo that 500s on a hand-edited URL is worse than one that shows the nearest working schedule. `test/demo/config.test.ts` fuzzes every field of the field for this.

The declared playoff draw is the same rule in a shape clamping cannot express. `seedBrackets` raises on a template the field cannot fill — correctly, for an organizer filling in a form — so `canDeclareDraw` asks first, the demo seeds it automatically instead, and the board says which condition was not met. Nothing silently substitutes a different bracket.

## The tournament knobs that are not schedule shape

Three of the tournament controls exist to make engine behaviour visible rather than to change the schedule's shape, and each is deliberately a window rather than a copy:

- **Break, halfway** widens a real gap in the timeslot grid. The divider on the board is whatever `findBreaks` reads back out of those timestamps, so a break the data does not contain cannot appear. The knob is the whole gap, not extra on top of the turnaround buffer — the number typed and the number shown have to agree.
- **Penalty on the pool A leader** feeds `computeStandings` a point adjustment. The target is chosen from the table *before* the penalty, so the choice cannot depend on its own effect.
- **Playoff draw** switches between `seedBrackets` working the pairings out and an organizer-declared template. Both read the same standings; only the shape differs.

Correcting a result or applying a penalty can move the bracket, and `bracketDrift` compares the draw that was set against the one today's standings produce. The banner is the demo's version of what an organizer needs on the day: the edit is allowed, and the consequence is stated.

## Scope

[SCOPE.md](SCOPE.md) says plainly that building for the demo rather than the organizer inverts this project's priorities. Demo mode earns its place by being a window onto work that already existed and was already tested. It is not a place to add features. If something belongs in the product, build it in the product.
