import type {
  Announcement,
  Attendance,
  AttendanceStatus,
  Competition,
  CompetitionFormat,
  Court,
  CourtWindow,
  EventStatus,
  ForfeitPolicy,
  Match,
  MatchPhase,
  MatchSetEdit,
  MatchStatus,
  Participant,
  ParticipantKind,
  PaymentMethod,
  Session,
  TeamPlayer,
  Tiebreaker,
  Timeslot,
  Transaction,
  TransactionType,
  UUID,
  Venue,
} from '@/lib/core';
import type { EventSnapshot } from '@/lib/event/snapshot';
import { NotFoundError } from './errors';
import { clock, compact, iso, isoOrUndefined, money } from './rows';
import type { Queryable } from './types';

/**
 * Load one event whole, as domain types.
 *
 * Every table is read with one query filtered on the competition — never a
 * query per session or per match. Neon serverless is a round trip per query,
 * so a loop of reads is a page that takes seconds (docs/DECISIONS.md: batch
 * reads). No authorization here: callers decide who may see what, and the
 * public loader strips what a public page must not carry.
 */
export async function readSnapshot(q: Queryable, competitionId: UUID): Promise<EventSnapshot> {
  const [
    competitionRows,
    courtRows,
    windowRows,
    sessionRows,
    slotRows,
    poolRows,
    participantRows,
    playerRows,
    matchRows,
    attendanceRows,
    transactionRows,
    formatRows,
    editRows,
    announcementRows,
  ] = await Promise.all([
    q.query<CompetitionRow>(
      `select c.*, v.id as v_id, v.name as v_name, v.address as v_address,
              v.created_by as v_created_by, v.created_at as v_created_at
         from competition c left join venue v on v.id = c.venue_id
        where c.id = $1`,
      [competitionId],
    ),
    q.query<CourtRow>(
      `select ct.id, ct.venue_id, ct.name, ct.is_active
         from court ct join competition_court cc on cc.court_id = ct.id
        where cc.competition_id = $1`,
      [competitionId],
    ),
    q.query<WindowRow>(
      `select w.id, w.court_id, w.session_id, w.start_at, w.end_at
         from court_window w join session s on s.id = w.session_id
        where s.competition_id = $1
        order by w.start_at, w.id`,
      [competitionId],
    ),
    q.query<SessionRow>(
      `select id, competition_id, name, play_date::text as play_date, start_time::text as start_time,
              end_time::text as end_time, sequence, cancelled_at, cancel_reason
         from session where competition_id = $1
        order by sequence nulls last, play_date, id`,
      [competitionId],
    ),
    q.query<SlotRow>(
      `select t.id, t.session_id, t.start_at, t.end_at
         from timeslot t join session s on s.id = t.session_id
        where s.competition_id = $1
        order by t.start_at, t.id`,
      [competitionId],
    ),
    q.query<PoolRow>(
      `select p.id, p.name,
              coalesce(array_agg(pp.participant_id order by pt.seed nulls last, pt.name, pt.id)
                       filter (where pp.participant_id is not null), '{}') as participant_ids
         from pool p
         left join pool_participant pp on pp.pool_id = p.id
         left join participant pt on pt.id = pp.participant_id
        where p.competition_id = $1
        group by p.id, p.name
        order by p.name, p.id`,
      [competitionId],
    ),
    q.query<ParticipantRow>(
      `select id, competition_id, kind, name, seed, contact_name, contact_email, contact_phone,
              registered_at, notes, user_id
         from participant where competition_id = $1
        order by seed nulls last, registered_at, name, id`,
      [competitionId],
    ),
    q.query<PlayerRow>(
      `select tp.id, tp.participant_id, tp.name, tp.jersey_number
         from team_player tp join participant p on p.id = tp.participant_id
        where p.competition_id = $1
        order by tp.participant_id, tp.name, tp.id`,
      [competitionId],
    ),
    q.query<MatchRow>(
      `select m.id as row_id, m.match_key, m.competition_id, m.session_id, m.pool_id, m.court_id,
              m.timeslot_id, m.home_participant_id, m.away_participant_id, m.ref_participant_id,
              m.bracket, m.round_label, m.status,
              coalesce(json_agg(json_build_object(
                'setNumber', ms.set_number, 'homePoints', ms.home_points, 'awayPoints', ms.away_points
              ) order by ms.set_number) filter (where ms.id is not null), '[]') as sets
         from match m left join match_set ms on ms.match_id = m.id
        where m.competition_id = $1
        group by m.id
        order by m.match_key`,
      [competitionId],
    ),
    q.query<AttendanceRow>(
      `select a.id, a.session_id, a.participant_id, a.status, a.waitlist_pos, a.recorded_at
         from attendance a join session s on s.id = a.session_id
        where s.competition_id = $1
        order by a.recorded_at, a.id`,
      [competitionId],
    ),
    q.query<TransactionRow>(
      `select t.* from transaction t join participant p on p.id = t.participant_id
        where p.competition_id = $1
        order by t.processed_at, t.id`,
      [competitionId],
    ),
    q.query<SetFormatRow>(
      `select id, competition_id, phase, set_number, target, win_by, cap
         from competition_set_format where competition_id = $1
        order by phase, set_number`,
      [competitionId],
    ),
    q.query<EditRow>(
      `select e.id, m.match_key, e.set_number, e.previous_home, e.previous_away, e.next_home,
              e.next_away, e.reason, e.edited_by, e.via_link_id, e.edited_at
         from match_set_edit e join match m on m.id = e.match_id
        where m.competition_id = $1
        order by e.edited_at, m.match_key, e.set_number, e.id`,
      [competitionId],
    ),
    q.query<AnnouncementRow>(
      `select id, competition_id, session_id, body, created_by, created_at
         from announcement where competition_id = $1
        order by created_at desc, id`,
      [competitionId],
    ),
  ]);

  const c = competitionRows.rows[0];
  if (!c) throw new NotFoundError('Event');

  const competition: Competition = compact({
    id: c.id,
    name: c.name,
    slug: c.slug,
    format: c.format,
    createdBy: c.created_by ?? undefined,
    venueId: c.venue_id ?? undefined,
    registrationFee: money(c.registration_fee),
    gameDurationMin: c.game_duration_min,
    bufferMin: c.buffer_min,
    forfeitPolicy: c.forfeit_policy,
    tiebreakerOrder: c.tiebreaker_order ?? undefined,
    status: c.status,
    publishedAt: isoOrUndefined(c.published_at),
    archivedAt: isoOrUndefined(c.archived_at),
    description: c.description ?? undefined,
    poolCount: c.pool_count ?? undefined,
    bracketTiers: c.bracket_tiers ?? undefined,
    minRestMin: c.min_rest_min,
    leagueLegs: c.league_legs,
    playersPerSide: c.players_per_side ?? undefined,
    capacity: c.capacity ?? undefined,
    skillLabel: c.skill_label ?? undefined,
    timeZone: c.time_zone,
    createdAt: iso(c.created_at),
  });

  const venue: Venue | null = c.v_id
    ? compact({
        id: c.v_id,
        name: c.v_name ?? '',
        address: c.v_address ?? undefined,
        createdBy: c.v_created_by ?? undefined,
        createdAt: iso(c.v_created_at),
      })
    : null;

  const courts: Court[] = courtRows.rows
    .map((r) => ({ id: r.id, venueId: r.venue_id, name: r.name, isActive: r.is_active }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }) || cmp(a.id, b.id));

  const courtWindows: CourtWindow[] = windowRows.rows.map((r) => ({
    id: r.id,
    courtId: r.court_id,
    sessionId: r.session_id,
    startAt: iso(r.start_at),
    endAt: iso(r.end_at),
  }));

  const sessions: Session[] = sessionRows.rows.map((r) =>
    compact({
      id: r.id,
      competitionId: r.competition_id,
      name: r.name ?? undefined,
      playDate: r.play_date,
      startTime: clock(r.start_time),
      endTime: clock(r.end_time),
      sequence: r.sequence ?? undefined,
      cancelledAt: isoOrUndefined(r.cancelled_at),
      cancelReason: r.cancel_reason ?? undefined,
    }),
  );

  const timeslots: Timeslot[] = slotRows.rows.map((r) => ({
    id: r.id,
    sessionId: r.session_id,
    startAt: iso(r.start_at),
    endAt: iso(r.end_at),
  }));

  const participants: Participant[] = participantRows.rows.map((r) =>
    compact({
      id: r.id,
      competitionId: r.competition_id,
      kind: r.kind,
      name: r.name,
      seed: r.seed ?? undefined,
      contactName: r.contact_name ?? undefined,
      contactEmail: r.contact_email ?? undefined,
      contactPhone: r.contact_phone ?? undefined,
      registeredAt: iso(r.registered_at),
      notes: r.notes ?? undefined,
    }),
  );

  const matches: Match[] = matchRows.rows.map((r) => ({
    id: r.match_key,
    competitionId: r.competition_id,
    sessionId: r.session_id,
    poolId: r.pool_id,
    courtId: r.court_id,
    timeslotId: r.timeslot_id,
    homeParticipantId: r.home_participant_id,
    awayParticipantId: r.away_participant_id,
    refParticipantId: r.ref_participant_id,
    bracket: r.bracket,
    roundLabel: r.round_label,
    status: r.status,
    sets: r.sets.map((s) => ({
      id: `${r.match_key}-s${s.setNumber}`,
      matchId: r.match_key,
      setNumber: s.setNumber,
      homePoints: s.homePoints,
      awayPoints: s.awayPoints,
    })),
  }));

  return {
    competition,
    venue,
    courts,
    courtWindows,
    sessions,
    timeslots,
    pools: poolRows.rows.map((r) => ({
      id: r.id,
      name: r.name,
      participantIds: r.participant_ids,
    })),
    participants,
    teamPlayers: playerRows.rows.map(
      (r): TeamPlayer =>
        compact({
          id: r.id,
          participantId: r.participant_id,
          name: r.name,
          jerseyNumber: r.jersey_number ?? undefined,
        }),
    ),
    matches,
    attendance: attendanceRows.rows.map(
      (r): Attendance =>
        compact({
          id: r.id,
          sessionId: r.session_id,
          participantId: r.participant_id,
          status: r.status,
          waitlistPos: r.waitlist_pos ?? undefined,
          recordedAt: iso(r.recorded_at),
        }),
    ),
    transactions: transactionRows.rows.map(
      (r): Transaction =>
        compact({
          id: r.id,
          participantId: r.participant_id,
          type: r.type,
          amount: money(r.amount) ?? 0,
          paymentMethod: r.payment_method ?? undefined,
          referenceNumber: r.reference_number ?? undefined,
          processedAt: iso(r.processed_at),
          processedBy: r.processed_by ?? undefined,
          receiptUrl: r.receipt_url ?? undefined,
          notes: r.notes ?? undefined,
        }),
    ),
    setFormats: formatRows.rows.map((r) => ({
      id: r.id,
      competitionId: r.competition_id,
      phase: r.phase,
      setNumber: r.set_number,
      target: r.target,
      winBy: r.win_by,
      cap: r.cap,
    })),
    // Built field by field rather than through `compact`: a null previous
    // score is a real value here (the first entry of a set), and a null
    // session on an announcement means "the whole event".
    scoreEdits: editRows.rows.map((r) => {
      const edit: MatchSetEdit = {
        id: r.id,
        matchId: r.match_key,
        setNumber: r.set_number,
        previousHome: r.previous_home,
        previousAway: r.previous_away,
        nextHome: r.next_home,
        nextAway: r.next_away,
        editedAt: iso(r.edited_at),
      };
      if (r.reason) edit.reason = r.reason;
      if (r.edited_by) edit.editedBy = r.edited_by;
      if (r.via_link_id) edit.viaLinkId = r.via_link_id;
      return edit;
    }),
    announcements: announcementRows.rows.map((r) => {
      const announcement: Announcement = {
        id: r.id,
        competitionId: r.competition_id,
        sessionId: r.session_id,
        body: r.body,
        createdAt: iso(r.created_at),
      };
      if (r.created_by) announcement.createdBy = r.created_by;
      return announcement;
    }),
  };
}

const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

interface CompetitionRow {
  id: string;
  name: string;
  slug: string;
  format: CompetitionFormat;
  created_by: string | null;
  venue_id: string | null;
  registration_fee: unknown;
  game_duration_min: number;
  buffer_min: number;
  forfeit_policy: ForfeitPolicy;
  tiebreaker_order: Tiebreaker[] | null;
  status: EventStatus;
  published_at: unknown;
  archived_at: unknown;
  description: string | null;
  pool_count: number | null;
  bracket_tiers: string[] | null;
  min_rest_min: number;
  league_legs: number;
  players_per_side: number | null;
  capacity: number | null;
  skill_label: string | null;
  time_zone: string;
  created_at: unknown;
  v_id: string | null;
  v_name: string | null;
  v_address: string | null;
  v_created_by: string | null;
  v_created_at: unknown;
}
interface CourtRow {
  id: string;
  venue_id: string;
  name: string;
  is_active: boolean;
}
interface WindowRow {
  id: string;
  court_id: string;
  session_id: string;
  start_at: unknown;
  end_at: unknown;
}
interface SessionRow {
  id: string;
  competition_id: string;
  name: string | null;
  play_date: string;
  start_time: string;
  end_time: string;
  sequence: number | null;
  cancelled_at: unknown;
  cancel_reason: string | null;
}
interface SlotRow {
  id: string;
  session_id: string;
  start_at: unknown;
  end_at: unknown;
}
interface PoolRow {
  id: string;
  name: string;
  participant_ids: string[];
}
interface ParticipantRow {
  id: string;
  competition_id: string;
  kind: ParticipantKind;
  name: string;
  seed: number | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  registered_at: unknown;
  notes: string | null;
  user_id: string | null;
}
interface PlayerRow {
  id: string;
  participant_id: string;
  name: string;
  jersey_number: number | null;
}
interface MatchRow {
  row_id: string;
  match_key: string;
  competition_id: string;
  session_id: string;
  pool_id: string | null;
  court_id: string | null;
  timeslot_id: string | null;
  home_participant_id: string | null;
  away_participant_id: string | null;
  ref_participant_id: string | null;
  bracket: string | null;
  round_label: string | null;
  status: MatchStatus;
  sets: Array<{ setNumber: number; homePoints: number; awayPoints: number }>;
}
interface AttendanceRow {
  id: string;
  session_id: string;
  participant_id: string;
  status: AttendanceStatus;
  waitlist_pos: number | null;
  recorded_at: unknown;
}
interface TransactionRow {
  id: string;
  participant_id: string;
  type: TransactionType;
  amount: unknown;
  payment_method: PaymentMethod | null;
  reference_number: string | null;
  processed_at: unknown;
  processed_by: string | null;
  receipt_url: string | null;
  notes: string | null;
}
interface SetFormatRow {
  id: string;
  competition_id: string;
  phase: MatchPhase;
  set_number: number;
  target: number;
  win_by: number;
  cap: number | null;
}
interface EditRow {
  id: string;
  match_key: string;
  set_number: number;
  previous_home: number | null;
  previous_away: number | null;
  next_home: number | null;
  next_away: number | null;
  reason: string | null;
  edited_by: string | null;
  via_link_id: string | null;
  edited_at: unknown;
}
interface AnnouncementRow {
  id: string;
  competition_id: string;
  session_id: string | null;
  body: string;
  created_by: string | null;
  created_at: unknown;
}
