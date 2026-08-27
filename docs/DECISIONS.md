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

**CI is the exception, and it is not deferred.** It is not contributor infrastructure — it is a review tool for the person already here. Most code in this repo is agent-generated and reviewed rather than hand-written, which only works if correctness is machine-checkable; 182 tests that run solely on one laptop are a claim rather than a fact. See [`.github/workflows/ci.yml`](../.github/workflows/ci.yml).

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
