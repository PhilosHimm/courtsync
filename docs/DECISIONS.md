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

### Contributor infrastructure deferred
Public and Apache-2.0 from day one, because that costs nothing and keeps options open. Issue templates, code of conduct, labelled good-first-issues and PR review turnaround wait until an organizer has run a real event on it. Contributors follow users.

### Biome over ESLint + Prettier
One dependency, one config, no plugin resolution. At a few hours a week the config surface matters more than ecosystem breadth. Tradeoff: no Next-specific lint rules. Revisit if `apps/organizer` needs them.

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

Since each format belongs to a different persona, choosing a format is choosing whose problem gets solved first.

The tournament organizer is the obvious answer — that format is closest to what the predecessor built. But they are also the slowest persona to learn from, because they only run an event a few times a year.

| Persona | Real observations in 6 months |
| --- | --- |
| Tournament organizer | 1 |
| League convener | ~20 |
| Drop-in host | ~25 |

The weekly personas also produce the strongest signal available: **did they use it again the following week without being asked?** A tournament organizer cannot generate that at all.

Serving the drop-in host first also means real users arrive in weeks rather than months, which makes the auth and authorization work urgent rather than precautionary.

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
