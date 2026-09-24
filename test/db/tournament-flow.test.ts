/**
 * A whole tournament through the data layer, against a real Postgres:
 * create, generate, score pool play, seed the playoffs, score them, correct a
 * result, withdraw a team — with the refusals rule 6 requires along the way.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ForbiddenError, NotFoundError } from '@/lib/db/errors';
import { createEvent, loadEvent } from '@/lib/db/events';
import {
  generateSchedule,
  moveMatch,
  redrawPools,
  seedPlayoffs,
  setMatchStatus,
  slotSuggestions,
  withdrawTeam,
} from '@/lib/db/schedule';
import { issueScoreLink, recordScore, revokeScoreLinks, scoreLinkView } from '@/lib/db/scores';
import type { EventSnapshot } from '@/lib/event/snapshot';
import { tournamentInput, user } from './fixtures';
import { freshDatabase, type TestDatabase } from './harness';

let t: TestDatabase;
beforeAll(async () => {
  t = await freshDatabase();
});
afterAll(async () => {
  await t?.drop();
});

const now = '2026-07-04T14:00:00.000Z';
const straight = [
  { home: 21, away: 15 },
  { home: 21, away: 17 },
];

async function setup(name: string) {
  const owner = await user(t.db, `owner-${name}`);
  // 09:00–21:00: room for pool play and every playoff round.
  const id = await createEvent(
    t.db,
    owner.actor,
    tournamentInput({
      sessions: [{ playDate: '2026-07-04', startTime: '09:00', endTime: '21:00' }],
    }),
  );
  return { owner, id, load: () => loadEvent(t.db, owner.actor, id) };
}

async function scoreAllPoolMatches(
  owner: { actor: { userId: string } },
  id: string,
  event: EventSnapshot,
) {
  for (const match of event.matches.filter((m) => m.poolId)) {
    const homeWins = (match.homeParticipantId ?? '') < (match.awayParticipantId ?? '');
    const result = await recordScore(
      t.db,
      { kind: 'organizer', actor: owner.actor },
      id,
      match.id,
      homeWins ? straight : straight.map((s) => ({ home: s.away, away: s.home })),
      { now },
    );
    expect(result.kind).toBe('saved');
  }
}

describe('generating the schedule', () => {
  it('draws pools and writes pool play with a clean audit', async () => {
    const { owner, id, load } = await setup('generate');
    const report = await generateSchedule(t.db, owner.actor, id);
    expect(report.unplaced).toEqual([]);
    expect(report.conflicts).toEqual([]);
    const event = await load();
    expect(event.pools.map((p) => p.name)).toEqual(['A', 'B']);
    expect(event.matches).toHaveLength(12);
    expect(event.matches[0]!.id).toMatch(/^spring-open-pool-[ab]-\d+$/);
  });

  it('regenerating keeps a played match exactly as it was', async () => {
    const { owner, id, load } = await setup('regen');
    await generateSchedule(t.db, owner.actor, id);
    const first = (await load()).matches[0]!;
    await recordScore(t.db, { kind: 'organizer', actor: owner.actor }, id, first.id, straight, {
      now,
    });
    const report = await generateSchedule(t.db, owner.actor, id);
    expect(report.kept).toEqual([first.id]);
    const after = (await load()).matches.find((m) => m.id === first.id)!;
    expect(after).toMatchObject({
      status: 'final',
      courtId: first.courtId,
      timeslotId: first.timeslotId,
    });
    expect(after.sets.map((s) => [s.homePoints, s.awayPoints])).toEqual([
      [21, 15],
      [21, 17],
    ]);
  });

  it('refuses to redraw pools once a match is played', async () => {
    const { owner, id, load } = await setup('redraw');
    await generateSchedule(t.db, owner.actor, id);
    await redrawPools(t.db, owner.actor, id);
    expect((await load()).pools).toEqual([]);
    await generateSchedule(t.db, owner.actor, id);
    const match = (await load()).matches[0]!;
    await recordScore(t.db, { kind: 'organizer', actor: owner.actor }, id, match.id, straight, {
      now,
    });
    await expect(redrawPools(t.db, owner.actor, id)).rejects.toThrow(/started/);
  });

  it('refuses a stranger every schedule write', async () => {
    const { owner, id, load } = await setup('stranger-schedule');
    const stranger = await user(t.db, 'stranger-schedule');
    await generateSchedule(t.db, owner.actor, id);
    const event = await load();
    const match = event.matches[0]!;
    const attempts = [
      () => generateSchedule(t.db, stranger.actor, id),
      () => redrawPools(t.db, stranger.actor, id),
      () => moveMatch(t.db, stranger.actor, id, match.id, { courtId: null, timeslotId: null }),
      () => setMatchStatus(t.db, stranger.actor, id, match.id, 'cancelled'),
      () => withdrawTeam(t.db, stranger.actor, id, event.participants[0]!.id, now),
      () => seedPlayoffs(t.db, stranger.actor, id),
      () => slotSuggestions(t.db, stranger.actor, id, match.id),
      () => issueScoreLink(t.db, stranger.actor, id, match.id, now),
      () => revokeScoreLinks(t.db, stranger.actor, id, match.id, now),
      () =>
        recordScore(t.db, { kind: 'organizer', actor: stranger.actor }, id, match.id, straight, {
          now,
        }),
    ];
    for (const attempt of attempts) await expect(attempt()).rejects.toBeInstanceOf(NotFoundError);
    expect(await load()).toEqual(event);
  });
});

describe('moving a match', () => {
  it('saves the move and reports the conflict it creates', async () => {
    const { owner, id, load } = await setup('move');
    await generateSchedule(t.db, owner.actor, id);
    const event = await load();
    const [a, b] = event.matches.filter((m) => m.timeslotId === event.matches[0]!.timeslotId);
    const conflicts = await moveMatch(t.db, owner.actor, id, b!.id, {
      courtId: a!.courtId!,
      timeslotId: a!.timeslotId!,
    });
    expect(conflicts.map((c) => c.kind)).toContain('court-double-booked');
  });

  it('offers only slots that do not collide', async () => {
    const { owner, id, load } = await setup('suggest');
    await generateSchedule(t.db, owner.actor, id);
    const match = (await load()).matches[0]!;
    const suggestions = await slotSuggestions(t.db, owner.actor, id, match.id);
    expect(suggestions.length).toBeGreaterThan(0);
    for (const s of suggestions) {
      const conflicts = await moveMatch(t.db, owner.actor, id, match.id, s).then((c) =>
        c.filter((x) => x.severity === 'blocking'),
      );
      expect(conflicts).toEqual([]);
      break;
    }
  });

  it('refuses a court the event does not use', async () => {
    const { owner, id, load } = await setup('move-foreign');
    await generateSchedule(t.db, owner.actor, id);
    const match = (await load()).matches[0]!;
    const other = await setup('move-foreign-other');
    const foreignCourt = (await other.load()).courts[0]!.id;
    await expect(
      moveMatch(t.db, owner.actor, id, match.id, {
        courtId: foreignCourt,
        timeslotId: match.timeslotId!,
      }),
    ).rejects.toThrow(/court/);
  });
});

describe('scores', () => {
  it('asks for confirmation before changing a recorded score, then keeps the history', async () => {
    const { owner, id, load } = await setup('confirm');
    await generateSchedule(t.db, owner.actor, id);
    const match = (await load()).matches[0]!;
    const by = { kind: 'organizer' as const, actor: owner.actor };
    await recordScore(t.db, by, id, match.id, straight, { now });

    const corrected = [
      { home: 21, away: 15 },
      { home: 17, away: 21 },
    ];
    const pending = await recordScore(t.db, by, id, match.id, corrected, { now });
    expect(pending).toMatchObject({ kind: 'confirm', changes: ['Set 2: 21–17 → 17–21'] });
    expect((await load()).matches.find((m) => m.id === match.id)!.sets[1]!.homePoints).toBe(21);

    const saved = await recordScore(t.db, by, id, match.id, corrected, {
      now: '2026-07-04T15:00:00.000Z',
      confirm: true,
      reason: 'Sheet misread',
    });
    expect(saved.kind).toBe('saved');
    const history = (await load()).scoreEdits.filter((e) => e.matchId === match.id);
    expect(history.map((e) => [e.setNumber, e.previousHome, e.nextHome, e.reason ?? null])).toEqual(
      [
        [1, null, 21, null],
        [2, null, 21, null],
        [2, 21, 17, 'Sheet misread'],
      ],
    );
    expect(history.every((e) => e.editedBy === owner.id)).toBe(true);
  });

  it('refuses input that is not a score, and accepts an odd one with a warning', async () => {
    const { owner, id, load } = await setup('validate');
    await generateSchedule(t.db, owner.actor, id);
    const match = (await load()).matches[0]!;
    const by = { kind: 'organizer' as const, actor: owner.actor };
    expect(
      await recordScore(t.db, by, id, match.id, [{ home: -1, away: 21 }], { now }),
    ).toMatchObject({ kind: 'invalid' });
    const odd = await recordScore(
      t.db,
      by,
      id,
      match.id,
      [
        { home: 12, away: 10 },
        { home: 21, away: 18 },
      ],
      { now },
    );
    expect(odd.kind).toBe('saved');
    if (odd.kind === 'saved') expect(odd.warnings.map((w) => w.kind)).toEqual(['below-target']);
  });
});

describe('score links', () => {
  it('lets a link score its own match and nothing else, and stops working when revoked', async () => {
    const { owner, id, load } = await setup('links');
    await generateSchedule(t.db, owner.actor, id);
    const [mine, other] = (await load()).matches;
    const { token, linkId } = await issueScoreLink(t.db, owner.actor, id, mine!.id, now);

    const view = await scoreLinkView(t.db, token);
    expect(view).toMatchObject({ matchKey: mine!.id, eventName: 'Spring Open' });

    const scorer = { kind: 'link' as const, token };
    expect((await recordScore(t.db, scorer, id, mine!.id, straight, { now })).kind).toBe('saved');
    await expect(
      recordScore(t.db, scorer, id, other!.id, straight, { now }),
    ).rejects.toBeInstanceOf(ForbiddenError);

    const edits = (await load()).scoreEdits.filter((e) => e.matchId === mine!.id);
    expect(edits.every((e) => e.viaLinkId === linkId && e.editedBy === undefined)).toBe(true);

    await revokeScoreLinks(t.db, owner.actor, id, mine!.id, now);
    expect(await scoreLinkView(t.db, token)).toBeNull();
    await expect(
      recordScore(t.db, scorer, id, mine!.id, straight, { now, confirm: true }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('stores only a hash of the token', async () => {
    const { owner, id, load } = await setup('hash');
    await generateSchedule(t.db, owner.actor, id);
    const match = (await load()).matches[0]!;
    const { token } = await issueScoreLink(t.db, owner.actor, id, match.id, now);
    const { rows } = await t.pool.query('select token_hash from score_link');
    expect(rows.some((r: { token_hash: string }) => r.token_hash.includes(token))).toBe(false);
  });

  it('revokes the earlier link when a new one is issued for the same match', async () => {
    const { owner, id, load } = await setup('reissue');
    await generateSchedule(t.db, owner.actor, id);
    const match = (await load()).matches[0]!;
    const first = await issueScoreLink(t.db, owner.actor, id, match.id, now);
    await issueScoreLink(t.db, owner.actor, id, match.id, now);
    expect(await scoreLinkView(t.db, first.token)).toBeNull();
  });

  it('treats a malformed token as no token', async () => {
    expect(await scoreLinkView(t.db, "'; drop table match; --")).toBeNull();
  });
});

describe('playoffs', () => {
  it('seeds after pool play, advances winners, and refuses to reseed once started', async () => {
    const { owner, id, load } = await setup('playoffs');
    await generateSchedule(t.db, owner.actor, id);
    await expect(seedPlayoffs(t.db, owner.actor, id)).rejects.toThrow(/Every pool match/);
    await scoreAllPoolMatches(owner, id, await load());

    const report = await seedPlayoffs(t.db, owner.actor, id);
    expect(report.unplaced).toEqual([]);
    expect(report.conflicts.filter((c) => c.severity === 'blocking')).toEqual([]);
    let event = await load();
    const q1 = event.matches.find((m) => m.id === 'spring-open-gold-q1')!;
    expect(q1.homeParticipantId).toBeTruthy();

    const by = { kind: 'organizer' as const, actor: owner.actor };
    await recordScore(
      t.db,
      by,
      id,
      q1.id,
      [
        { home: 25, away: 20 },
        { home: 25, away: 20 },
      ],
      { now },
    );
    event = await load();
    expect(event.matches.find((m) => m.id === 'spring-open-gold-s1')!.homeParticipantId).toBe(
      q1.homeParticipantId,
    );

    await expect(seedPlayoffs(t.db, owner.actor, id)).rejects.toThrow(/started/);

    // Correcting the quarterfinal reshapes the semifinal (H14).
    const flipped = await recordScore(
      t.db,
      by,
      id,
      q1.id,
      [
        { home: 20, away: 25 },
        { home: 20, away: 25 },
      ],
      {
        now,
        confirm: true,
      },
    );
    expect(flipped.kind).toBe('saved');
    event = await load();
    expect(event.matches.find((m) => m.id === 'spring-open-gold-s1')!.homeParticipantId).toBe(
      q1.awayParticipantId,
    );
  });

  it('keeps a tied playoff score but does not advance on it (H15)', async () => {
    const { owner, id, load } = await setup('tied');
    await generateSchedule(t.db, owner.actor, id);
    await scoreAllPoolMatches(owner, id, await load());
    await seedPlayoffs(t.db, owner.actor, id);
    const by = { kind: 'organizer' as const, actor: owner.actor };
    const result = await recordScore(
      t.db,
      by,
      id,
      'spring-open-gold-q2',
      [
        { home: 25, away: 20 },
        { home: 20, away: 25 },
      ],
      { now },
    );
    expect(result.kind).toBe('saved');
    if (result.kind === 'saved') expect(result.warnings.map((w) => w.kind)).toContain('undecided');
    const event = await load();
    expect(event.matches.find((m) => m.id === 'spring-open-gold-q2')!.status).toBe('live');
    expect(
      event.matches.find((m) => m.id === 'spring-open-gold-s1')!.awayParticipantId ?? null,
    ).toBeNull();
  });

  it('shows which quarterfinals a corrected pool score moves', async () => {
    const { owner, id, load } = await setup('drift');
    await generateSchedule(t.db, owner.actor, id);
    await scoreAllPoolMatches(owner, id, await load());
    await seedPlayoffs(t.db, owner.actor, id);
    const event = await load();
    // Flip the pool-A winner's first result and the pool-A order changes.
    const poolA = event.pools.find((p) => p.name === 'A')!;
    const winner = poolA.participantIds.slice().sort()[0]!;
    const theirs = event.matches.filter(
      (m) =>
        m.poolId === poolA.id && (m.homeParticipantId === winner || m.awayParticipantId === winner),
    );
    const by = { kind: 'organizer' as const, actor: owner.actor };
    let result: Awaited<ReturnType<typeof recordScore>> | undefined;
    for (const match of theirs) {
      const winnerHome = match.homeParticipantId === winner;
      result = await recordScore(
        t.db,
        by,
        id,
        match.id,
        winnerHome ? straight.map((s) => ({ home: s.away, away: s.home })) : straight,
        { now, confirm: true },
      );
    }
    expect(result?.kind).toBe('saved');
    if (result?.kind === 'saved') expect(result.drift.length).toBeGreaterThan(0);
  });
});

describe('withdrawing a team', () => {
  it('forfeits their unplayed matches with history and moves nothing else', async () => {
    const { owner, id, load } = await setup('withdraw');
    await generateSchedule(t.db, owner.actor, id);
    const before = await load();
    const team = before.participants[0]!.id;
    const result = await withdrawTeam(t.db, owner.actor, id, team, now);
    expect(result.forfeited).toHaveLength(3);
    const after = await load();
    for (const match of after.matches) {
      const was = before.matches.find((m) => m.id === match.id)!;
      expect([match.courtId, match.timeslotId]).toEqual([was.courtId, was.timeslotId]);
      if (result.forfeited.includes(match.id)) {
        expect(match.status).toBe('forfeit');
        expect(match.sets).toHaveLength(2);
      }
    }
    const history = after.scoreEdits.filter((e) => result.forfeited.includes(e.matchId));
    expect(history).toHaveLength(6);
    expect(history.every((e) => e.reason === 'Team withdrawn — forfeit')).toBe(true);
  });
});
