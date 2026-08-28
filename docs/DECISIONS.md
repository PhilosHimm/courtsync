# Decisions

What is settled, what is not, and why. Update this rather than re-litigating in a session.

---

## Settled

### One app, three personas, three formats
A tournament organizer, a league convener and a drop-in host — three different people with three different rhythms, sharing one data model because they share the same material: courts, time slots, participants, matches.

One app rather than three, because the underlying scheduling and scoring is the same work. But they are served **one at a time**, not all at once. Pickup coordination is out of scope entirely. See [SCOPE.md](SCOPE.md).

### `organizer`, not `tournament`
Leagues and drop-ins are not tournaments. Naming the app after one format biases every decision made inside it. The directory is gone (see *Flattened to a single npm package* below) but the reasoning still governs naming everywhere else.

### Scheduling is a library, not an app
Its value is pure functions with no persistence. Shipping it as a second deployable would mean maintaining two organizer UIs and asking users which to open. It lives at `src/lib/scheduling` and is imported, never served.

### Clean git history — nothing is imported
No `subtree`, no `filter-repo`, no `merge --allow-unrelated-histories`. Predecessor code is reference material, not a source to merge from. All 75 source commits were solo-authored so nothing needs attribution, and a committed credential never reaches this repo by construction.

### Standings computed, never stored
Audit finding H9. See [DOMAIN.md](DOMAIN.md).

### Contributor infrastructure deferred — but not CI
Public and Apache-2.0 from day one, because that costs nothing and keeps options open. Issue templates, code of conduct, labelled good-first-issues and PR review turnaround wait until an organizer has run a real event on it. Contributors follow users.

**CI is the exception, and it is not deferred.** It is not contributor infrastructure — it is a review tool for the person already here. Most code in this repo is agent-generated and reviewed rather than hand-written, which only works if correctness is machine-checkable; 274 tests that run solely on one laptop are a claim rather than a fact. See [`.github/workflows/ci.yml`](../.github/workflows/ci.yml).

The secret scan runs over full history rather than the diff: a credential that was committed and later deleted is still reachable in history, so scanning the diff would clear it.

### Biome over ESLint + Prettier
One dependency, one config, no plugin resolution. At a few hours a week the config surface matters more than ecosystem breadth. Tradeoff: no Next-specific lint rules — not yet needed; the app is JSX and CSS, and Biome 2.x lints both.

Two rules are switched off repo-wide, in `biome.json`, with reasons rather than silently disabled: `complexity.noImportantStyles` (the global `prefers-reduced-motion` override in `globals.css` needs `!important` to reliably beat component-level animation classes — that's the correct pattern, not a smell) and `suspicious.noArrayIndexKey` (every current list in `src/app` and `src/components` is a fixed-length decorative array that never reorders — revisit this the moment a genuinely dynamic, reorderable list appears). `css.parser.tailwindDirectives` is on so Biome parses Tailwind v4's `@theme`/`@import "tailwindcss"` instead of erroring on them.

### The app: Next.js 16, Tailwind v4, next/font
Matches what the predecessor (`scoopvolleyball`) already ran, and what the app's own `README.md` and this repo's docs assumed before any code existed. Tailwind v4 needs no `tailwind.config.js` — theme tokens live in `globals.css` via `@theme`. Fonts are wired through `next/font/google` (self-hosted, no external request, no CLS) rather than a `<link>` tag.

### Apple's design language
The app's visual system is Apple's, specified in [DESIGN-apple.md](../DESIGN-apple.md) and expressed as Tailwind v4 `@theme` tokens whose names match that document, so the two can be diffed. Alternating full-bleed tiles with the surface change as the only divider; one accent (Action Blue) carrying every interactive element; two button grammars and nothing between them; body copy at 17px; exactly one drop-shadow.

It replaced a committed dark "gym at night" identity built on Big Shoulders and IBM Plex. That palette is gone rather than kept beside it — two identities in one shell is how a design system stops being one.

Three things the source system does not settle, decided here:

- **There is no product photography.** Apple's system is photography-first and this product has no photographs, will not stage any, and may not present invented data as real (PRODUCT.md). The artifact that receives the reverent treatment is the one thing the product actually makes: the court x timeslot schedule grid. It is the only element permitted the system drop-shadow, and it always sits on a light surface so the shadow has something to do.
- **SF Pro cannot be licensed off-platform.** The stacks lead with `-apple-system`, so Apple devices resolve the real face and never download a webfont; everyone else gets Inter with the substitution corrections the source document prescribes — `ss03`, and body leading tightened from 1.47 to 1.44 for Inter's taller x-height.
- **`ink-muted-48` (#7a7a7a) is defined but unused.** It fails WCAG AA for normal text (4.29:1 on white, 3.94:1 on parchment). It was specified for disabled states and legal boilerplate; every place this app wanted a quiet tone is real reading text, which uses `ink-muted-80` (12.6:1) instead.

### One format per pull request

Tournament, league and drop-in changes go in separate PRs. The three personas have different rhythms and will be reviewed, deployed and reverted on different schedules — a drop-in host waiting on a bracket fix to land is the coupling this prevents. A change that genuinely serves all three (auth, users, security, the domain model, the schema, CI, the design system) is one PR, because splitting those by format gives three PRs that only work once all three merge.

The rule and the file-by-file breakdown are in [CLAUDE.md](../CLAUDE.md); the buckets are not obvious, since `round-robin.ts` is shared by pool play and league fixtures and `standings.ts` by tournaments and leagues.

**The branch this rule landed on is the one exception, deliberately.** `claude/test-coverage-analysis-d6ev2j` carries a coverage sweep and the decisions that came out of it, and it spans all three formats plus shared code. It was left whole rather than split: no PR had been opened, nobody had reviewed it, and rebuilding four stacked branches to satisfy a rule written halfway through it would have been churn with no reader. Recorded here so the next session reads it as a grandfathered exception rather than as precedent.

### Bracket shape: byes, rematches, tiers

Decided August 2026, after a coverage review found that `seedBrackets` had only ever been run on one shape — two pools, eight teams, one tier — and that everything outside it was unspecified rather than merely untested.

Five decisions, all now held by `test/scheduling/bracket-shapes.test.ts`:

- **An under-filled bracket gives byes to the top overall seeds.** A field of five, six or seven still fills all eight slots; the missing opponents leave byes, and the bye walks its seed into the semifinal. Before this a six-team field produced a quarterfinal with both sides empty and the bracket stalled short of a final.
- **A bye is a quarterfinal with a null away side**, not a fabricated forfeit. A forfeit would show as one in standings and match history, and M5 exists precisely because a fabricated result corrupted a tiebreak. `advanceBracket` resolves the slot without a result being recorded.
- **"No opponent" and "opponent not yet known" are different states.** A semifinal waiting on an unplayed quarterfinal also has one side filled; walking that team into the final would hand somebody a title they had not played for. Only a slot whose feeding matches are settled can resolve as a bye.
- **Quarterfinal rematches are avoided where a swap exists, not guaranteed away.** Cross-seeding two even pools still guarantees no rematch. At other pool counts the seeder swaps the lower halves of two pairings when that strictly reduces rematches — no team changes seed and no seed changes half. Where the field makes rematches unavoidable (six of eight qualifiers from one pool), the rematch stands rather than the seeding being bent to hide it.
- **Tiers are allocated per pool, remainder by record.** Each pool sends `floor(8 / poolCount)` to gold; leftover slots go to the best remaining records. A pool that happened to draw the strong teams should not fill gold and leave another pool's winner playing silver — but the part that is not fixed by pool is still settled by results, which is what keeps H9 intact. Allocation runs first, then each tier is seeded as if it were a standalone bracket.

**Rejected:** shrinking the bracket to fit the field (the q1..q4 slot set stops being fixed, and every consumer has to handle a varying match count); generalising cross-seeding to N pools (more work than the guarantee is worth before anyone has run an event); a straight cut down the overall ranking for tiers (the pool-strength problem above).

### The organizer owns the bracket's shape, never its contents

Decided August 2026, from a working document written against a real two-pool
one-day format and its predecessor dashboard. The persona is the tournament
organizer; the request came from the person who runs that event.

The published rules sheet states the draw: Q1 = A-3rd v B-2nd,
Q2 = A-2nd v B-3rd, Q3 = A-1st v B-4th, Q4 = B-1st v A-4th. `seedBrackets`
cross-seeds two even pools and produces a different pattern, so an organizer
running the app would have been running a bracket other than the one they
published.

`SeedingInput.templates` takes a declared shape per tier. Six decisions,
held by `test/scheduling/bracket-template.test.ts`:

- **A template says "third in pool A", never "the Spikers".** Positions
  resolve against standings computed on the same call, so correcting a pool
  score still moves the bracket. That is the line H9 draws — a manually
  entered rank must never override a record that was actually played — and a
  declared shape stays on the right side of it.
- **Positions read the standings array as handed in.** `computeStandings`
  applies head-to-head before the differentials, so a team can finish above
  one it trails on points. "Second in pool A" means the second row of the
  table the organizer is reading, and re-deriving the order inside the seeder
  would quietly disagree with it.
- **All tiers or none.** A templated tier and an automatic tier would each
  allocate from the whole field, and a team could land in two brackets.
- **`poolOrder` is explicit.** A template says "pool 1"; inferring that from
  `standingsByPool`'s key order would make a bracket depend on how a caller
  happened to build a record.
- **Rematch avoidance does not run over a declared draw.** A swap the
  organizer did not ask for is a second seeder disagreeing with the first,
  which is H8.
- **Everything invalid raises.** A pool position that does not exist, a
  finishing position deeper than the pool has, a team drawn twice. A silently
  empty side would be a bye nobody drew, which is worse than not starting
  because it looks like a bracket.

**Rejected:** a "Set Bracket" panel where the organizer types team names into
placeholder matches, which is what the predecessor dashboard needed. Here
that is what H9 forbids and what `seedBrackets` already does correctly.

`bracketDrift` is the other half of the same request. Pool scores get
corrected after the bracket is on the wall, and the working document's answer
was "allow it, with a warning". The edit stands — refusing it would leave the
standings knowingly wrong — and `bracketDrift` reports which quarterfinals
moved. Only quarterfinals: everything downstream is seeded empty and filled
by `advanceBracket`, so reporting those would make every correction look like
it moved the final.

### A break is a gap, a penalty is an input, a format is derived

Three smaller decisions from the same document, all shaped by the same
instinct — do not add a row, a column or a copy for something already
implied by data that exists.

- **The mid-day break is derived from the grid, not seeded as a row.** A
  break row would be a match that is not a match, and everything that counts,
  schedules, referees or scores matches would need a special case one of them
  would forget. `findBreaks` reads the gap out of `Timeslot` timestamps, and
  the demo's break knob widens a real gap rather than remembering a number
  the board then repeats back.
- **The reffing penalty is an input to `computeStandings`, not a column.**
  Standings are computed on read and never stored (rule 1), so clearing a
  penalty is deleting a key and leaves no trace — which is what "one-off
  clearable override" has to mean when an organizer penalizes the wrong team
  and takes it back a minute later. Only `pointDifferential` moves; wins,
  sets and points stay as what was played, so the rest of the table still
  checks against a scoresheet. `Standing.pointAdjustment` reports the ruling
  separately, and a non-finite adjustment raises rather than poisoning every
  tiebreak it touches.
- **Set format is derived from the match, not stored on it.** A `format`
  column beside a round label is a second place one fact can live and
  disagree, which is C3. `setFormatFor` generates its labels from
  `POOL_PLAY_SETS` and `PLAYOFF_SETS` rather than restating them, so editing
  those constants is a real change instead of a silent divergence; the
  deciding set carries its switch point, derived as half the target because
  the switch is a rule of the sport rather than a knob.
- **"Self ref" is only ever a bracket match.** `assignReferees` staffs pool
  play and reports what it could not staff. Labelling an unstaffed pool match
  self-reffed would turn a shortfall the organizer needs to see into a line
  that reads like somebody chose it. Nothing staffs bracket matches yet, and
  that gap is listed on the tournament area page rather than hidden behind
  the label.

**Deferred, both blocked on the same thing.** The working document also asked
for a spreadsheet importer and for tournament metadata to move from a
hardcoded registry into the database. Neither can be built here: there is no
data layer, and the auth decision below blocks writing one. The importer is
additionally the wrong shape for this codebase — its stated goal was to stop
maintaining a separate scheduler, and `drawPools` + `generatePoolPlay` are
already that native path. What is actually missing is the setup wizard, which
is listed as a gap on the tournament area page.

### What an organizer can customize about a team

Decided August 2026. `Participant` was a name, one contact triple, free-text notes, and a `seed` column that existed in the type and the migration from the start and that **nothing ever read**.

- **`seed` is the pool draw's input, not the bracket's.** Bracket seeding is computed from standings and always will be — that is H9, and a manually entered rank must never override a record that was actually played. But before anyone has played there is no record, and a draw that ignores the organizer's ranking is how the two strongest teams land in one pool and one goes home before the bracket. `drawPools` reads it; `seedBrackets` still does not.
- **The organizer decides the pool count.** `drawPools` validates it against `MIN_TEAMS_PER_POOL` and `MAX_TEAMS_PER_POOL` and refuses loudly rather than quietly re-splitting the field. `suggestPoolCount` exists so a form can pre-fill the number — it is what `PREFERRED_POOL_SIZES` is for — but it is a suggestion, never a decision.
- **Distribution is a snake**, 1→A 2→B 3→C 4→C 5→B 6→A. Seed totals come out level when the field divides evenly. Balancing the running totals instead would be fairer on uneven pools; the snake was chosen because it is the draw every organizer already recognizes and can check by eye.
- **A partially seeded field is the normal case.** Seeded teams take the top positions in seed order, then everyone else follows by name. Name rather than `registeredAt`: both are deterministic, but only one is predictable to somebody reading the entry list.
- **Teams carry a roster of plain names.** `team_player` holds a name and an optional jersey number against a participant. No player id, no login, no history across competitions — SCOPE.md rules out player profiles and player accounts, and a name on a scoresheet stays on the right side of that. **Nothing in `src/lib/scheduling` reads it**; a roster is recorded, not scheduled.
- **A division is its own competition.** A rec draw and a competitive draw are two `Competition` rows. Costs nothing in the model and keeps standings and brackets naturally separate. The tradeoff, accepted: the organizer sets up twice and there is no combined view.
- **Teams do not persist across competitions.** `carryForwardParticipants` copies last season's rows into a new competition so the convener does not retype twenty teams, but the rows stay independent. A team that plays four seasons is four rows, so renaming or dropping one is a decision about this season only.
- **The carry-forward drops `seed`.** Last season's ranking is not this season's, and `drawPools` now reads that column — a stale seed carried forward would shape a new draw with a number nobody re-entered. `id` and `registeredAt` are dropped too: both belong to the write, and minting a uuid or reading the clock would make the transform impure (rule 9).

**Rejected:** deleting `seed` (it had a real job, just not the one its name suggests); players as `Participant` rows with `kind: 'individual'` linked to a team (a drop-in side is assembled fresh each round and a team roster is stable for a season — one type meaning both would mean neither); a division field on the participant (every scheduling function would need a division filter it does not have); a `team` entity above `participant` for cross-season history (that is the team stats SCOPE.md rules out).

### Playoffs play a third set

`computeStandings` takes `splitSetsDecidedByTotalPoints`, which resolves a 1-1 set split on total points across both sets. That is a pool-play rule and stays the default, because `POOL_PLAY_SETS` is two sets with no decider.

Playoffs pass it `false`. `PLAYOFF_SETS` declares three sets, so a 1-1 split means the decider has not been played rather than that the match needs settling on aggregate points. This agrees with `advanceBracket`, which refuses to advance a tied elimination match (H15) — the two now say the same thing about what "1-1" means. An undecided match still counts toward set and point differentials; undecided is not unplayed.

**Rejected:** applying the pool-play rule everywhere and deleting the flag. Deciding a knockout match on aggregate points is the kind of surprise organizers get told about.

### Vitest, one config
One [vitest.config.ts](../vitest.config.ts) at the root covers `test/**/*.test.ts`. It restates the `@/*` alias because Vitest does not read tsconfig `paths`.

### Flattened to a single npm package
Was: a pnpm workspace — `apps/organizer` plus `packages/core`, `packages/scheduling`, `packages/ui-components`, wired together with `workspace:*` and `transpilePackages`.

Now: one Next.js app at the repo root. `packages/core/src` → `src/lib/core`, `packages/scheduling/src` → `src/lib/scheduling`, the two `test/` directories → `test/core` and `test/scheduling`, `packages/core/sql` → `sql/`. Bare `@courtsync/*` specifiers became `@/lib/*` path aliases. `packages/ui-components` was deleted — it contained `export {}` and nothing imported it.

**Why.** `workspace:*` is a pnpm protocol that npm cannot resolve, so `npm install` failed outright on a repo with one deployable and no published packages. The workspace split was buying separate `package.json` files, separate tsconfigs and separate Vitest configs, and paying for it with a package manager requirement — for a project that has never been deployed and has one app.

**What was given up.** The dependency boundary is no longer mechanical. Under pnpm, `core` could not resolve `scheduling` because it was not in its `dependencies`; now they are directories in one compilation unit and only review stops a wrong-direction import. If that slips, add a lint rule — do not go back to workspaces. The three-way split also stopped being a real constraint the moment it stopped being publishable, which it always was (`"private": true` everywhere).

Reversing this means re-introducing per-directory `package.json` files and a workspace manifest. Nothing in `src/lib` depends on being flat, so the cost is config, not code.

---

### Neon is the database provider

Decided August 2026. Supabase was the other candidate and was recommended, on the grounds that its Auth + RLS would have made the authorization boundary the platform's problem rather than the application's. Neon was chosen instead: it is what the predecessor projects already ran on, and it is plain Postgres with nothing proprietary in the schema.

**The consequence has to be stated plainly.** Neon is a database, not a backend platform. There is no RLS-by-default safety net, so the authorization boundary lives in application code. The rules in [CLAUDE.md](../CLAUDE.md) tighten accordingly, and auth is now the single highest-risk area of the build rather than something the platform handles.

What Neon does not provide, and what replaces it:

| Supabase would have given | On Neon |
| --- | --- |
| Auth + RLS | See the open auth decision below. Do **not** hand-roll. |
| Realtime channels | Polling. Fine for one gym; revisit only if an organizer complains. |
| Storage buckets | Payment receipt uploads need somewhere to live — deferred until receipts are actually built. |

---

## Open

### 🔴 Which auth library on Neon?

**Blocking for the functional build.** The schema is unaffected — `created_by` and `processed_by` are bare `uuid` columns — but nothing that mutates data can be written until this is settled.

Candidates:

- **Neon Auth** — Neon's own managed auth, which syncs users into a table in your database. Closest thing to the Supabase experience and worth evaluating first, since it keeps identity in the same Postgres the rest of the app queries.
- **A real auth library** — Auth.js, Clerk, or similar. Well-trodden, more moving parts.
- **Hand-rolled** — ❌ not an option. Session handling and credential checks written by hand are where authorization bugs get shipped, and there is no RLS underneath to catch one.

**Once decided:** record which table user ids reference, and add the foreign keys to `created_by` / `processed_by` in a follow-up migration.

### 🟡 Which persona ships first?

**Moot for the scheduling engine — all three formats are implemented.** The engine is pure functions with no auth or database dependency, so there was no reason to build only one third of it. This decision now applies only to which persona gets a working *interface* first.

The argument recorded when this was open, still relevant for the UI:

| Persona | Real observations in 6 months |
| --- | --- |
| Tournament organizer | 1 |
| League convener | ~20 |
| Drop-in host | ~25 |

The weekly personas produce the strongest signal available: **did they use it again the following week without being asked?** A tournament organizer cannot generate that at all — they run an event a few times a year, so a build aimed at them is a build with one observation in it.

The build order chosen was tournament → drop-in → league, which is the reverse of that argument. Recorded rather than quietly re-litigated: the tournament path was closest to what the predecessor already proved out, and building it first meant working from the largest body of existing specification.

### 🟢 Do the archived predecessor repos go public?

`PROVENANCE.md` is more useful with clickable links. Five of the six are safe to flip. `scoopvolleyball` is **not**, until its history has been reviewed and cleaned. Naming without linking is an acceptable fallback.

---

## Reversed

### `apps/coordinator` — cut entirely
Briefly planned as a second app for pickup coordination, then parked, then removed. A separate private project supersedes it.

### `packages/shared-hooks` — deleted
Speculative. Nothing needed it. Recreate if and when something does.

### `apps/scheduler` — never built
Folded into `src/lib/scheduling` before any code was written.
