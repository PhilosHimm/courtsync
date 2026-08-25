# Decisions

What is settled, what is not, and why. Update this rather than re-litigating in a session.

---

## Settled

### One app, three personas, three formats
A tournament organizer, a league convener and a drop-in host — three different people with three different rhythms, sharing one data model because they share the same material: courts, time slots, participants, matches.

One app rather than three, because the underlying scheduling and scoring is the same work. But they are served **one at a time**, not all at once. Pickup coordination is out of scope entirely. See [SCOPE.md](SCOPE.md).

### `apps/organizer`, not `apps/tournament`
Leagues and drop-ins are not tournaments. A workspace named after one format biases every decision made inside it.

### Scheduling is a package, not an app
Its value is pure functions with no persistence. Shipping it as a second deployable would mean maintaining two organizer UIs and asking users which to open.

### Clean git history — nothing is imported
No `subtree`, no `filter-repo`, no `merge --allow-unrelated-histories`. Predecessor code is reference material, not a source to merge from. All 75 source commits were solo-authored so nothing needs attribution, and a committed credential never reaches this repo by construction.

### Standings computed, never stored
Audit finding H9. See [DOMAIN.md](DOMAIN.md).

### Contributor infrastructure deferred — but not CI
Public and Apache-2.0 from day one, because that costs nothing and keeps options open. Issue templates, code of conduct, labelled good-first-issues and PR review turnaround wait until an organizer has run a real event on it. Contributors follow users.

**CI is the exception, and it is not deferred.** It is not contributor infrastructure — it is a review tool for the person already here. Most code in this repo is agent-generated and reviewed rather than hand-written, which only works if correctness is machine-checkable; 159 tests that run solely on one laptop are a claim rather than a fact. See [`.github/workflows/ci.yml`](../.github/workflows/ci.yml).

The secret scan runs over full history rather than the diff, because the predecessor's leaked database URL was committed and then deleted — deleting it changed nothing.

### Biome over ESLint + Prettier
One dependency, one config, no plugin resolution. At a few hours a week the config surface matters more than ecosystem breadth. Tradeoff: no Next-specific lint rules — not yet needed; `apps/organizer` is JSX and CSS, and Biome 2.x lints both.

Two rules are switched off repo-wide, in `biome.json`, with reasons rather than silently disabled: `complexity.noImportantStyles` (the global `prefers-reduced-motion` override in `globals.css` needs `!important` to reliably beat component-level animation classes — that's the correct pattern, not a smell) and `suspicious.noArrayIndexKey` (every current list in `apps/organizer` is a fixed-length decorative array that never reorders — revisit this the moment a genuinely dynamic, reorderable list appears). `css.parser.tailwindDirectives` is on so Biome parses Tailwind v4's `@theme`/`@import "tailwindcss"` instead of erroring on them.

### `apps/organizer`: Next.js 16, Tailwind v4, next/font
Matches what the predecessor (`scoopvolleyball`) already ran, and what the app's own `README.md` and this repo's docs assumed before any code existed. Tailwind v4 needs no `tailwind.config.js` — theme tokens live in `globals.css` via `@theme`. Fonts are wired through `next/font/google` (self-hosted, no external request, no CLS) rather than a `<link>` tag.

The organizer app declares its own `@/*` → `./src/*` path alias, which locally overrides (does not merge with) the root `tsconfig.json`'s inherited `paths`. That's fine here: `@courtsync/core` and `@courtsync/scheduling` resolve through pnpm's workspace symlinks in `node_modules`, not through tsconfig `paths` at all, so nothing is lost by not inheriting them.

### Vitest per package
Each workspace owns its config and `test` script; the root fans out with `pnpm -r --if-present`.

---

### Neon is the database provider

Decided August 2026. Supabase was the other candidate and was recommended, on the grounds that its Auth + RLS would have made findings C1 and C2 structurally impossible. Neon was chosen instead: it is what the predecessor projects already ran on, and it is plain Postgres with nothing proprietary in the schema.

**The consequence has to be stated plainly.** Neon is a database, not a backend platform. There is no RLS-by-default safety net, so the authorization boundary lives in application code — which is exactly where C1 happened. The rules in [CLAUDE.md](../CLAUDE.md) tighten accordingly, and auth is now the single highest-risk area of the build rather than something the platform handles.

What Neon does not provide, and what replaces it:

| Supabase would have given | On Neon |
| --- | --- |
| Auth + RLS | See the open auth decision below. Do **not** hand-roll. |
| Realtime channels | Polling. Fine for one gym; revisit only if an organizer complains. |
| Storage buckets | Payment receipt uploads need somewhere to live — deferred until receipts are actually built. |

---

## Open

### 🔴 Which auth library on Neon?

**Blocking for `apps/organizer`.** The schema is unaffected — `created_by` and `processed_by` are bare `uuid` columns — but nothing that mutates data can be written until this is settled.

Candidates:

- **Neon Auth** — Neon's own managed auth, which syncs users into a table in your database. Closest thing to the Supabase experience and worth evaluating first, since it keeps identity in the same Postgres the rest of the app queries.
- **A real auth library** — Auth.js, Clerk, or similar. Well-trodden, more moving parts.
- **Hand-rolled** — ❌ not an option. This is precisely what produced C1 and C2. A committed default password and a session cookie that *was* the password.

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

`PROVENANCE.md` is more useful with clickable links. Five of the six are safe to flip. `scoopvolleyball` is **not**, until its committed `.env` is scrubbed from history. Naming without linking is an acceptable fallback.

---

## Reversed

### `apps/coordinator` — cut entirely
Briefly planned as a second app for pickup coordination, then parked, then removed. A separate private project supersedes it.

### `packages/shared-hooks` — deleted
Speculative. Nothing needed it. Recreate if and when something does.

### `apps/scheduler` — never built
Folded into `packages/scheduling` before any code was written.
