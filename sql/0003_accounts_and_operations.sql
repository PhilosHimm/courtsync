-- CourtSync accounts, roles and the operations the app performs.
--
-- Pre-first-deployment, like 0002: no production data exists, so columns
-- that must be NOT NULL are added NOT NULL directly rather than backfilled.
--
-- ── who is signed in ───────────────────────────────────────────────────
-- Neon Auth (docs/DECISIONS.md) holds identities; this table is the app's
-- own row for each of them, created on first sign-in.
--
-- Why a table of our own rather than foreign keys straight into Neon Auth's
-- schema: that schema belongs to a beta SDK (`@neondatabase/auth` 0.x) and is
-- not ours to depend on column by column. The decision record asked to verify
-- that its user table is "queryable enough to hang foreign keys off"; a
-- mirror row keyed by the auth id is the answer that does not need the
-- verification to come out well. Every `created_by` / `processed_by` /
-- `edited_by` now references a real table in this database — the follow-up
-- 0001 has carried since it was written.
--
-- `auth_user_id` is text: whatever the auth service calls a user, we store,
-- and never parse.
create table app_user (
  id            uuid primary key default gen_random_uuid(),
  auth_user_id  text not null unique,
  email         text,
  display_name  text,
  -- For SMS, and only with consent (see notification_preference).
  phone         text,
  created_at    timestamptz not null default now()
);

-- Deleting an account must not silently delete somebody's event, or orphan
-- it: `restrict` makes that a decision the account-deletion flow has to make
-- explicitly. History (who processed a payment, who edited a score) outlives
-- the account and keeps the row with the actor forgotten.
alter table competition
  add constraint competition_created_by_fkey
  foreign key (created_by) references app_user(id) on delete restrict;
alter table venue
  add constraint venue_created_by_fkey
  foreign key (created_by) references app_user(id) on delete restrict;
alter table transaction
  add constraint transaction_processed_by_fkey
  foreign key (processed_by) references app_user(id) on delete set null;
alter table match_set_edit
  add constraint match_set_edit_edited_by_fkey
  foreign key (edited_by) references app_user(id) on delete set null;

-- ── who else may run it ────────────────────────────────────────────────
-- The owner is `competition.created_by`; this table holds everyone else.
-- A club with several organizers is served by this role rather than by the
-- tenant table 0002 dropped. Scorekeepers are deliberately not here — they
-- have no account, only a per-match link (score_link below).
create type member_role as enum ('co_organizer');

create table competition_member (
  competition_id uuid not null references competition(id) on delete cascade,
  user_id        uuid not null references app_user(id) on delete cascade,
  role           member_role not null default 'co_organizer',
  added_at       timestamptz not null default now(),
  primary key (competition_id, user_id)
);

-- ── an event's life ────────────────────────────────────────────────────
-- Publishing is visibility only: an organizer keeps editing everything
-- afterwards, because event day means changing things under pressure.
-- Archive is the default "delete"; a hard delete is a real DELETE.
create type event_status as enum ('draft', 'published', 'archived');

alter table competition
  add column status        event_status not null default 'draft',
  add column published_at  timestamptz,
  add column archived_at   timestamptz,
  add column description   text;

-- ── how this event is run ──────────────────────────────────────────────
-- Settings every generator reads, per competition. Each is a decision the
-- organizer typed in; nothing here is derived.
alter table competition
  add column pool_count        int check (pool_count is null or pool_count > 0),
  add column bracket_tiers     text[],
  -- Rest is asked for in minutes and converted to slots against the real
  -- slot timestamps (restSlotsForMinutes), never against a nominal length.
  add column min_rest_min      int not null default 0 check (min_rest_min >= 0),
  add column players_per_side  int check (players_per_side is null or players_per_side > 0),
  add column capacity          int check (capacity is null or capacity > 0),
  add column skill_label       text,
  -- The venue's IANA zone. Sessions are typed as wall-clock dates and times
  -- there; timeslots store the absolute instants they name (C4). Storing
  -- 9:00 as 09:00Z made every comparison with the real clock wrong by the
  -- gym's UTC offset. Checked against the tz database in application code.
  add column time_zone         text not null default 'UTC';

-- ── the engine's match ids ─────────────────────────────────────────────
-- A match row's key is the id `src/lib/scheduling/match-ids.ts` minted for
-- it — never a concatenation built anywhere else (C3). The uuid primary key
-- stays for foreign keys; the key is what the engine and the app speak.
-- Unique per competition, because slugs are unique per owner only.
alter table match add column match_key text not null;
alter table match add constraint match_competition_key_key unique (competition_id, match_key);

-- ── scorekeepers ───────────────────────────────────────────────────────
-- A volunteer handed a phone for twenty minutes gets an unguessable link
-- scoped to one match, revocable. The link is a capability, so only a hash
-- of its token is stored: a database dump must not hand out score access.
create table score_link (
  id          uuid primary key default gen_random_uuid(),
  match_id    uuid not null references match(id) on delete cascade,
  token_hash  text not null unique,
  created_by  uuid references app_user(id) on delete set null,
  created_at  timestamptz not null default now(),
  revoked_at  timestamptz
);

-- A removed set is an edit to nothing — the mirror of the first entry being
-- an edit from nothing. Writing 0-0 there would be a score nobody played.
alter table match_set_edit
  alter column next_home drop not null,
  alter column next_away drop not null,
  add constraint match_set_edit_next_pair check ((next_home is null) = (next_away is null)),
  add column via_link_id uuid references score_link(id) on delete set null;

-- ── players ────────────────────────────────────────────────────────────
-- A drop-in player who joined with an account. Null for everyone else,
-- including walk-ins, who are a name and nothing more.
alter table participant
  add column user_id uuid references app_user(id) on delete set null;

-- "My schedule" for a team player: the teams a signed-in player follows.
-- Deliberately a follow, not a membership — an account coordinates your own
-- attendance and accumulates no record (SCOPE.md).
create table participant_follow (
  user_id        uuid not null references app_user(id) on delete cascade,
  participant_id uuid not null references participant(id) on delete cascade,
  followed_at    timestamptz not null default now(),
  primary key (user_id, participant_id)
);

-- ── cancelling a night, telling people ─────────────────────────────────
alter table session
  add column cancelled_at  timestamptz,
  add column cancel_reason text;

create table announcement (
  id             uuid primary key default gen_random_uuid(),
  competition_id uuid not null references competition(id) on delete cascade,
  -- Null for an announcement about the whole event.
  session_id     uuid references session(id) on delete cascade,
  body           text not null check (length(body) between 1 and 2000),
  created_by     uuid references app_user(id) on delete set null,
  created_at     timestamptz not null default now()
);

-- ── notifications ──────────────────────────────────────────────────────
-- Consent is per channel and timestamped, because an SMS without recorded
-- consent is a legal problem, not a courtesy problem. Off by default.
create type notification_channel as enum ('email', 'sms');

create table notification_preference (
  user_id                 uuid primary key references app_user(id) on delete cascade,
  email_opt_in            boolean not null default false,
  sms_opt_in              boolean not null default false,
  email_consent_at        timestamptz,
  sms_consent_at          timestamptz,
  -- One-click unsubscribe works without signing in, so it is a capability
  -- too: hash only.
  unsubscribe_token_hash  text unique,
  updated_at              timestamptz not null default now(),
  check (not email_opt_in or email_consent_at is not null),
  check (not sms_opt_in or sms_consent_at is not null)
);

-- An outbox. A schedule edit at 8:52 must not fire forty texts: messages to
-- one person that share a digest key within the rate window are coalesced
-- into one before anything is sent.
create table notification (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references app_user(id) on delete cascade,
  channel        notification_channel not null,
  competition_id uuid references competition(id) on delete cascade,
  digest_key     text not null,
  subject        text not null,
  body           text not null,
  created_at     timestamptz not null default now(),
  not_before     timestamptz not null default now(),
  sent_at        timestamptz,
  failed_at      timestamptz,
  error          text
);

-- ── did anyone come back? ──────────────────────────────────────────────
-- Aggregate page counts and nothing else: no cookie, no user, no per-person
-- path. `path` is a route pattern (/e/[id]), never a concrete URL.
create table page_view_daily (
  day    date not null,
  path   text not null,
  views  int not null default 0 check (views >= 0),
  primary key (day, path)
);

-- ── indexes ────────────────────────────────────────────────────────────
create index idx_competition_member_user on competition_member (user_id);
create index idx_competition_status      on competition (status);
create index idx_match_key               on match (competition_id, match_key);
create index idx_score_link_match        on score_link (match_id);
create index idx_participant_user        on participant (user_id);
create index idx_participant_follow_part on participant_follow (participant_id);
create index idx_announcement_comp       on announcement (competition_id, created_at);
create index idx_notification_pending    on notification (not_before) where sent_at is null and failed_at is null;
create index idx_notification_user       on notification (user_id, digest_key, created_at);
