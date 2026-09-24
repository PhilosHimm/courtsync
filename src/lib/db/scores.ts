import { createHash, randomBytes } from 'node:crypto';
import type { UUID } from '@/lib/core';
import { driftAfter, formatOf } from '@/lib/event/engine';
import { describeScoreChange, scoreEdits } from '@/lib/event/score-history';
import type { DriftedSlot, EnteredSet, ScoreWarning } from '@/lib/scheduling';
import { checkScore } from '@/lib/scheduling';
import type { Actor } from './authz';
import { requireOrganizer } from './authz';
import { ForbiddenError, NotFoundError } from './errors';
import { advanceStoredBrackets, appendEdits, matchRowId, writeSets } from './schedule';
import { readSnapshot } from './snapshot';
import { withTransaction } from './tx';
import type { Db, Queryable } from './types';

/**
 * Score entry (#22), by an organizer or through a per-match link.
 *
 * A scorekeeper is a volunteer handed a phone for twenty minutes, so there is
 * no account: an unguessable link scoped to one match. The link is a
 * capability and this is exactly the path rule 6 exists for — so the token
 * is checked here, in the same transaction as the write, against the match
 * being written, and it grants nothing else. Only a hash of the token is
 * stored.
 */

/** Who is entering the score. */
export type Scorer = { kind: 'organizer'; actor: Actor } | { kind: 'link'; token: string };

export type ScoreResult =
  | { kind: 'invalid'; errors: string[] }
  /** A recorded score would change: say what, and what it moves, before saving. */
  | { kind: 'confirm'; changes: string[]; warnings: ScoreWarning[]; drift: DriftedSlot[] }
  | {
      kind: 'saved';
      warnings: ScoreWarning[];
      drift: DriftedSlot[];
      /** Bracket tiers that could not advance on this result (H15). */
      stalled: Array<{ tier: string; reason: string }>;
    };

export const hashToken = (token: string): string =>
  createHash('sha256').update(token).digest('hex');

export async function recordScore(
  db: Db,
  scorer: Scorer,
  competitionId: UUID,
  matchKey: string,
  sets: EnteredSet[],
  options: { now: string; confirm?: boolean; reason?: string },
): Promise<ScoreResult> {
  return withTransaction(db, async (tx) => {
    let viaLinkId: UUID | undefined;
    let editedBy: UUID | undefined;
    if (scorer.kind === 'organizer') {
      await requireOrganizer(tx, scorer.actor, competitionId);
      editedBy = scorer.actor.userId;
    } else {
      const link = await resolveScoreLink(tx, scorer.token);
      // Scoped to one match. A link for another match — or another event —
      // is refused as firmly as no link at all.
      if (!link || link.competitionId !== competitionId || link.matchKey !== matchKey) {
        throw new ForbiddenError(
          'This score link does not cover that match, or it has been revoked.',
        );
      }
      viaLinkId = link.linkId;
    }

    // Two phones entering the same match at once must not interleave.
    await tx.query('select id from match where competition_id = $1 and match_key = $2 for update', [
      competitionId,
      matchKey,
    ]);
    const snapshot = await readSnapshot(tx, competitionId);
    const match = snapshot.matches.find((m) => m.id === matchKey);
    if (!match) throw new NotFoundError('Match');
    if (!match.homeParticipantId || !match.awayParticipantId) {
      return { kind: 'invalid', errors: ['This match does not have both teams yet.'] };
    }
    if (match.status === 'cancelled') {
      return {
        kind: 'invalid',
        errors: ['This match was cancelled. Reinstate it before entering a score.'],
      };
    }

    const format = formatOf(snapshot, match);
    const check = checkScore({ sets, format });
    if (check.errors.length > 0) return { kind: 'invalid', errors: check.errors };

    const edits = scoreEdits({
      matchId: matchKey,
      previous: match.sets,
      next: sets,
      editedAt: options.now,
      ...(options.reason ? { reason: options.reason } : {}),
      ...(editedBy ? { editedBy } : {}),
      ...(viaLinkId ? { viaLinkId } : {}),
    });

    const decided = !check.warnings.some((w) => w.kind === 'undecided');
    const nextMatch = {
      ...match,
      status: decided ? ('final' as const) : ('live' as const),
      sets: sets.map((s, i) => ({
        id: `${matchKey}-s${i + 1}`,
        matchId: matchKey,
        setNumber: i + 1,
        homePoints: s.home,
        awayPoints: s.away,
      })),
    };
    const drift = match.poolId
      ? driftAfter(
          snapshot,
          snapshot.matches.map((m) => (m.id === matchKey ? nextMatch : m)),
        )
      : [];

    if (edits.length === 0)
      return { kind: 'saved', warnings: check.warnings, drift: [], stalled: [] };

    // A correction to a recorded score is confirmed first, with what it
    // changes and which quarterfinals it moves (#22).
    if (match.sets.length > 0 && !options.confirm) {
      return {
        kind: 'confirm',
        changes: describeScoreChange(match.sets, sets),
        warnings: check.warnings,
        drift,
      };
    }

    await writeSets(tx, competitionId, matchKey, sets);
    await tx.query('update match set status = $3 where competition_id = $1 and match_key = $2', [
      competitionId,
      matchKey,
      nextMatch.status,
    ]);
    await appendEdits(tx, competitionId, edits);
    const stalled = match.bracket ? await advanceStoredBrackets(tx, competitionId) : [];
    return { kind: 'saved', warnings: check.warnings, drift, stalled };
  });
}

/**
 * Issue a score link for one match. Any earlier link for the same match is
 * revoked: the phone that had it has been handed back.
 *
 * Returns the token once. It is never stored and cannot be shown again.
 */
export async function issueScoreLink(
  db: Db,
  actor: Actor,
  competitionId: UUID,
  matchKey: string,
  now: string,
): Promise<{ token: string; linkId: UUID }> {
  return withTransaction(db, async (tx) => {
    await requireOrganizer(tx, actor, competitionId);
    const matchId = await matchRowId(tx, competitionId, matchKey);
    await tx.query(
      'update score_link set revoked_at = $2 where match_id = $1 and revoked_at is null',
      [matchId, now],
    );
    // 192 bits from the OS CSPRNG, URL-safe. Unguessable by construction.
    const token = randomBytes(24).toString('base64url');
    const { rows } = await tx.query<{ id: string }>(
      'insert into score_link (match_id, token_hash, created_by) values ($1, $2, $3) returning id',
      [matchId, hashToken(token), actor.userId],
    );
    const linkId = rows[0]?.id;
    if (!linkId) throw new Error('Issuing a score link returned no row.');
    return { token, linkId };
  });
}

export async function revokeScoreLinks(
  db: Db,
  actor: Actor,
  competitionId: UUID,
  matchKey: string,
  now: string,
): Promise<number> {
  return withTransaction(db, async (tx) => {
    await requireOrganizer(tx, actor, competitionId);
    const matchId = await matchRowId(tx, competitionId, matchKey);
    const revoked = await tx.query(
      'update score_link set revoked_at = $2 where match_id = $1 and revoked_at is null',
      [matchId, now],
    );
    return revoked.rowCount ?? 0;
  });
}

/** What a token grants, or null for a token that is unknown or revoked. */
export async function resolveScoreLink(
  q: Queryable,
  token: string,
): Promise<{ linkId: UUID; competitionId: UUID; matchKey: string } | null> {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return null;
  const { rows } = await q.query<{ id: string; competition_id: string; match_key: string }>(
    `select l.id, m.competition_id, m.match_key
       from score_link l join match m on m.id = l.match_id
      where l.token_hash = $1 and l.revoked_at is null`,
    [hashToken(token)],
  );
  const row = rows[0];
  return row
    ? { linkId: row.id, competitionId: row.competition_id, matchKey: row.match_key }
    : null;
}

/** What a scorekeeper's page shows: the one match, and nothing else of the event. */
export async function scoreLinkView(db: Queryable, token: string) {
  const link = await resolveScoreLink(db, token);
  if (!link) return null;
  const snapshot = await readSnapshot(db, link.competitionId);
  const match = snapshot.matches.find((m) => m.id === link.matchKey);
  if (!match) return null;
  const name = (id: string | null | undefined) =>
    snapshot.participants.find((p) => p.id === id)?.name ?? 'To be decided';
  const court = snapshot.courts.find((c) => c.id === match.courtId)?.name ?? null;
  const slot = snapshot.timeslots.find((t) => t.id === match.timeslotId) ?? null;
  return {
    competitionId: link.competitionId,
    eventName: snapshot.competition.name,
    timeZone: snapshot.competition.timeZone ?? 'UTC',
    matchKey: match.id,
    home: name(match.homeParticipantId),
    away: name(match.awayParticipantId),
    court,
    startAt: slot?.startAt ?? null,
    status: match.status,
    sets: match.sets.map((s) => ({ home: s.homePoints, away: s.awayPoints })),
    format: formatOf(snapshot, match),
  };
}
