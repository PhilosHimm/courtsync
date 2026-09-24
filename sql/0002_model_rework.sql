-- CourtSync model rework.
--
-- One migration carrying the interlocking model changes decided in August
-- 2026 (docs/PLAN.md, Stage 1). They are one migration and not five because
-- they depend on each other: dropping `organization` changes what a
-- competition belongs to, and `venue` becomes what courts belong to, so a
-- schema carrying half of this is a schema that does not describe anything.
--
-- Nothing here adds a foreign key to `created_by` / `processed_by`. Those
-- stay opaque uuids until the auth work lands and there is a users table to
-- point at — see docs/DECISIONS.md and the note at the top of 0001.
--
-- Pre-first-deployment: there is no production data, so this drops and
-- rewrites rather than backfilling. Say so plainly here rather than leaving
-- the next reader to wonder where the migration of existing rows went.

-- ── who owns an event ──────────────────────────────────────────────────
-- `organization` is dropped. A club with several organizers is served by the
-- co-organizer role, not by a tenant table, and the tenant table was buying
-- nothing except a join on every query. An event now hangs off the user id
-- that created it.
--
-- The slug is unique per owner rather than globally: two organizers may both
-- run a "spring-classic" and neither should have to find that out.
alter table competition drop constraint competition_organization_id_fkey;
drop index idx_competition_org;
alter table competition drop constraint competition_organization_id_slug_key;
alter table competition drop column organization_id;
drop table organization;

alter table competition add column created_by uuid;
alter table competition add constraint competition_created_by_slug_key unique (created_by, slug);

-- ── where it is played ─────────────────────────────────────────────────
-- Venue is a real entity now, holding courts that outlive any one event. An
-- organizer sets their gym up once; every competition there reuses it. That
-- is also what makes per-court availability expressible at all — a window
-- belongs to a court, and a court had nowhere to live that lasted.
create table venue (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  address    text,
  created_by uuid,
  created_at timestamptz not null default now()
);

alter table competition drop column venue_name;
alter table competition add column venue_id uuid references venue(id) on delete set null;

-- Courts belong to the venue, not to the competition that happens to be
-- using them tonight. `on delete cascade` from the venue: a court without a
-- venue is not a thing.
alter table court drop constraint court_competition_id_fkey;
drop index idx_court_comp;
alter table court drop column competition_id;
alter table court add column venue_id uuid not null references venue(id) on delete cascade;

-- Which of the venue's courts this event actually has. A gym with four
-- courts where tonight's league only has two is the ordinary case, and
-- `court.is_active` cannot say it — that flag is about the court being out
-- of service, which is a fact about the venue rather than about one event.
create table competition_court (
  competition_id uuid not null references competition(id) on delete cascade,
  court_id       uuid not null references court(id) on delete cascade,
  primary key (competition_id, court_id)
);

-- "Court 3 is only ours until noon."
--
-- A window belongs to a court on a given session, because that is how the
-- constraint actually arrives: the far court is shared with a badminton club
-- on Tuesdays, not in the abstract. Absolute timestamps for the same reason
-- timeslots use them — sorting or comparing on a display string is C4.
--
-- No rows for a court means no restriction. That is deliberate: the common
-- case is a court that is available all session, and making an organizer
-- enter a window to say "no limit" would be a form nobody fills in
-- correctly.
create table court_window (
  id         uuid primary key default gen_random_uuid(),
  court_id   uuid not null references court(id) on delete cascade,
  session_id uuid not null references session(id) on delete cascade,
  start_at   timestamptz not null,
  end_at     timestamptz not null,
  check (end_at > start_at)
);

-- ── many days ──────────────────────────────────────────────────────────
-- A tournament may run over more than one day. The session table already
-- allowed it; nothing in the schema said so and the one-row-per-tournament
-- comment in 0001 said the opposite. Sequence becomes unique per competition
-- so "day 2" means one thing.
comment on table session is
  'One date of play. A tournament has one row per day (multi-day supported), '
  'a league one per week, a drop-in one per occurrence.';

alter table session add constraint session_competition_sequence_key
  unique (competition_id, sequence);

-- ── a match can now be delayed or called off ───────────────────────────
-- Both are things that happen to a real gym: a match pushed back behind an
-- overrunning one, and a match that will not be played at all. Neither had a
-- status, so both were being recorded as `scheduled` — a schedule that lies
-- about what is happening is worse than one that admits it.
-- Note for whoever edits this next: a value added here cannot be USED later
-- in the same transaction. Nothing below needs it, and nothing added below
-- may. Postgres will reject an insert of 'delayed' in this file, not when
-- you deploy it.
alter type match_status add value 'delayed';
alter type match_status add value 'cancelled';

-- ── how this event scores ──────────────────────────────────────────────
-- Set formats, the tiebreaker order and the forfeit policy are per
-- competition. All three were engine constants that an organizer could not
-- reach, and all three genuinely differ between events — they are usually
-- written on the rules sheet taped to the scorer's table.
create type match_phase as enum ('pool', 'playoff');

-- Matches the engine's `ForfeitPolicy` exactly, including the spelling, so
-- there is no mapping layer between the column and the code that reads it.
create type forfeit_policy as enum ('setsOnly', 'winOnly', 'asScored');

alter table competition add column forfeit_policy forfeit_policy not null default 'setsOnly';

-- The organizer's tiebreaker order, most significant first. Text rather than
-- an enum array so a reordering is a data change and not a migration; the
-- values are validated against `TIEBREAKER_ORDER` in application code.
-- Null means "the engine's default order", which is not the same as an empty
-- array and is why this is nullable rather than defaulted.
alter table competition add column tiebreaker_order text[];

-- One row per set, per phase. `set_number` is 1-based and ordered, so a
-- best-of-three to 25/25/15 is three rows rather than one row with a
-- `sets` count and a target that has to be the same for all of them.
--
-- No rows for a phase means the engine's default for that phase. Same
-- reasoning as court windows: the default is the common case.
create table competition_set_format (
  id             uuid primary key default gen_random_uuid(),
  competition_id uuid not null references competition(id) on delete cascade,
  phase          match_phase not null,
  set_number     int not null,
  target         int not null,
  win_by         int not null default 2,
  -- Null is a real value: play on until `win_by` is satisfied, no ceiling.
  cap            int,
  unique (competition_id, phase, set_number),
  check (set_number > 0),
  check (target > 0),
  check (win_by > 0),
  check (cap is null or cap >= target)
);

-- ── what a score used to say ───────────────────────────────────────────
-- Append-only, like the transaction ledger and for the same reason (rule 8):
-- an organizer who changes a score at 4pm has to be able to say what it was
-- at 3pm and who changed it. Corrections are new rows; nothing here is ever
-- updated or deleted.
--
-- The previous points are nullable because the first recording of a set is
-- an edit from nothing, and writing 0-0 there would be a score nobody
-- played.
create table match_set_edit (
  id             uuid primary key default gen_random_uuid(),
  match_id       uuid not null references match(id) on delete cascade,
  set_number     int not null,
  previous_home  int,
  previous_away  int,
  next_home      int not null,
  next_away      int not null,
  reason         text,
  edited_by      uuid,
  edited_at      timestamptz not null default now(),
  check (set_number > 0),
  check (next_home >= 0 and next_away >= 0),
  check ((previous_home is null) = (previous_away is null))
);

-- ── indexes ────────────────────────────────────────────────────────────
-- Same lesson as 0001 (H5): the column everything filters by gets an index.
create index idx_competition_created_by  on competition (created_by);
create index idx_competition_venue       on competition (venue_id);
create index idx_venue_created_by        on venue (created_by);
create index idx_court_venue             on court (venue_id);
create index idx_competition_court_comp  on competition_court (competition_id);
create index idx_competition_court_court on competition_court (court_id);
create index idx_court_window_session    on court_window (session_id, court_id);
create index idx_court_window_court      on court_window (court_id, start_at);
create index idx_set_format_comp         on competition_set_format (competition_id, phase, set_number);
create index idx_match_set_edit_match    on match_set_edit (match_id, set_number, edited_at);
