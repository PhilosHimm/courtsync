-- CourtSync initial schema.
--
-- Target: Neon (serverless Postgres). Plain Postgres with nothing
-- provider-specific in it.
--
-- `created_by` and `processed_by` are bare uuid columns with no foreign key.
-- Neon ships no auth of its own, so which table user ids reference depends on
-- the auth library chosen (see docs/DECISIONS.md — still open). Add the
-- constraint in a follow-up migration once that lands:
--
--   alter table organization
--     add constraint organization_created_by_fkey
--     foreign key (created_by) references <users table>(id);
--
-- Until then, treat those columns as opaque identifiers and do NOT rely on
-- referential integrity for them.

create extension if not exists pgcrypto;

-- ── enums ──────────────────────────────────────────────────────────────
create type competition_format as enum ('tournament', 'league', 'dropin');
create type match_status       as enum ('scheduled', 'live', 'final', 'forfeit');
create type participant_kind   as enum ('team', 'individual');
create type attendance_status  as enum ('registered', 'waitlist', 'checked_in', 'no_show');
create type payment_method     as enum ('cash', 'check', 'credit_card', 'etransfer', 'other');
create type transaction_type   as enum ('payment', 'refund', 'adjustment');

-- ── who runs it ────────────────────────────────────────────────────────
create table organization (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  created_by uuid,
  created_at timestamptz not null default now()
);

-- ── the thing being run ────────────────────────────────────────────────
-- Root entity. Replaces `tournament`: a league has no pools and twelve
-- dates, a drop-in has no fixed teams. Rooting at `tournament` is what made
-- the previous model unable to express either.
create table competition (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references organization(id) on delete cascade,
  name              text not null,
  slug              text not null,
  format            competition_format not null,
  venue_name        text,
  registration_fee  numeric(10, 2),
  game_duration_min int not null default 45,
  buffer_min        int not null default 5,
  created_at        timestamptz not null default now(),
  unique (organization_id, slug)
);

-- ── one date of play ───────────────────────────────────────────────────
-- tournament -> 1 row.  league -> one per week.  dropin -> one per occurrence.
create table session (
  id             uuid primary key default gen_random_uuid(),
  competition_id uuid not null references competition(id) on delete cascade,
  name           text,
  play_date      date not null,
  start_time     time not null,
  end_time       time not null,
  sequence       int,
  check (end_time > start_time)
);

create table court (
  id             uuid primary key default gen_random_uuid(),
  competition_id uuid not null references competition(id) on delete cascade,
  name           text not null,
  is_active      boolean not null default true
);

-- Timeslots hang off a session, not the competition, so a league's week 3
-- has its own grid independent of week 4.
--
-- start_at/end_at are timestamptz, never display strings. Audit finding C4:
-- sorting matches by a 12-hour label put "12:00 AM" before "12:00 PM" and a
-- tournament's final above its opening match.
create table timeslot (
  id         uuid primary key default gen_random_uuid(),
  session_id uuid not null references session(id) on delete cascade,
  start_at   timestamptz not null,
  end_at     timestamptz not null,
  check (end_at > start_at)
);

create table pool (
  id             uuid primary key default gen_random_uuid(),
  competition_id uuid not null references competition(id) on delete cascade,
  name           text not null
);

-- ── who plays ──────────────────────────────────────────────────────────
-- Replaces `team`. A drop-in's participants are people, not teams.
--
-- Deliberately carries NO wins/losses/points_for/points_against. Audit
-- finding H9 traces directly to those denormalized columns drifting out of
-- sync with the matches they summarized. Standings are computed on read.
create table participant (
  id             uuid primary key default gen_random_uuid(),
  competition_id uuid not null references competition(id) on delete cascade,
  kind           participant_kind not null default 'team',
  name           text not null,
  seed           int,
  contact_name   text,
  contact_email  text,
  contact_phone  text,
  registered_at  timestamptz not null default now(),
  notes          text
);

-- A team's roster: names on a sheet, not people with accounts.
-- No player id, no login, no history across competitions — SCOPE.md rules out
-- player profiles and player accounts. This is what an organizer needs to
-- print a scoresheet and check who turned up.
create table team_player (
  id             uuid primary key default gen_random_uuid(),
  participant_id uuid not null references participant(id) on delete cascade,
  name           text not null,
  jersey_number  int
);

create table pool_participant (
  pool_id        uuid references pool(id) on delete cascade,
  participant_id uuid references participant(id) on delete cascade,
  primary key (pool_id, participant_id)
);

-- ── who showed up ──────────────────────────────────────────────────────
-- Capacity, waitlist and no-shows. This is the drop-in organizer's actual
-- pain, and the reason drop-ins are a distinct format rather than a
-- tournament with one pool.
create table attendance (
  id             uuid primary key default gen_random_uuid(),
  session_id     uuid not null references session(id) on delete cascade,
  participant_id uuid not null references participant(id) on delete cascade,
  status         attendance_status not null default 'registered',
  waitlist_pos   int,
  recorded_at    timestamptz not null default now(),
  unique (session_id, participant_id),
  check ((status = 'waitlist') = (waitlist_pos is not null))
);

-- ── matches ────────────────────────────────────────────────────────────
-- bracket/round_label are free text, not enums: tournaments use
-- gold/silver/bronze, leagues use "Week 3", drop-ins use neither.
create table match (
  id                  uuid primary key default gen_random_uuid(),
  competition_id      uuid not null references competition(id) on delete cascade,
  session_id          uuid not null references session(id) on delete cascade,
  pool_id             uuid references pool(id) on delete set null,
  court_id            uuid references court(id) on delete set null,
  timeslot_id         uuid references timeslot(id) on delete set null,
  home_participant_id uuid references participant(id) on delete set null,
  away_participant_id uuid references participant(id) on delete set null,
  ref_participant_id  uuid references participant(id) on delete set null,
  bracket             text,
  round_label         text,
  status              match_status not null default 'scheduled',
  -- a participant cannot play itself, nor referee its own match
  check (home_participant_id is null
      or away_participant_id is null
      or home_participant_id <> away_participant_id),
  check (ref_participant_id is null
      or (ref_participant_id <> coalesce(home_participant_id, ref_participant_id)
      and ref_participant_id <> coalesce(away_participant_id, ref_participant_id)))
);

-- Set-level scoring. scoop had one score pair per match, so 25-20, 22-25,
-- 15-13 had nowhere to live.
create table match_set (
  id          uuid primary key default gen_random_uuid(),
  match_id    uuid not null references match(id) on delete cascade,
  set_number  int not null,
  home_points int not null default 0,
  away_points int not null default 0,
  unique (match_id, set_number),
  check (set_number > 0),
  check (home_points >= 0 and away_points >= 0)
);

-- ── money the organizer collects ───────────────────────────────────────
-- Append-only ledger. Correct mistakes with an 'adjustment' row, never by
-- updating or deleting history: an organizer has to be able to explain
-- every number to a team captain.
create table transaction (
  id               uuid primary key default gen_random_uuid(),
  participant_id   uuid not null references participant(id) on delete cascade,
  type             transaction_type not null,
  amount           numeric(10, 2) not null,
  payment_method   payment_method,
  reference_number text,
  processed_at     timestamptz not null default now(),
  processed_by     uuid,
  receipt_url      text,
  notes            text,
  check (amount > 0)
);

-- ── indexes ────────────────────────────────────────────────────────────
-- Audit finding H5: no index on the tenant key meant every hot query was a
-- sequential scan.
create index idx_competition_org     on competition (organization_id);
create index idx_session_comp        on session (competition_id, sequence);
create index idx_court_comp          on court (competition_id);
create index idx_timeslot_session    on timeslot (session_id, start_at);
create index idx_pool_comp           on pool (competition_id);
create index idx_participant_comp    on participant (competition_id);
create index idx_team_player_part    on team_player (participant_id);
create index idx_attendance_session  on attendance (session_id, status);
create index idx_match_comp          on match (competition_id);
create index idx_match_session       on match (session_id);
create index idx_match_timeslot      on match (timeslot_id);
create index idx_match_ref           on match (ref_participant_id);
create index idx_match_set_match     on match_set (match_id);
create index idx_transaction_part    on transaction (participant_id, processed_at);
