/**
 * Export, restore and duplicate (#19) through a real Postgres.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { duplicateEvent, exportEvent, restoreBackup } from '@/lib/db/backup';
import { InvalidInputError, NotFoundError } from '@/lib/db/errors';
import { createEvent, listEvents, loadEvent } from '@/lib/db/events';
import { generateSchedule, seedPlayoffs } from '@/lib/db/schedule';
import { recordScore } from '@/lib/db/scores';
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

async function playedTournament(name: string) {
  const owner = await user(t.db, name);
  const id = await createEvent(
    t.db,
    owner.actor,
    tournamentInput({
      participants: tournamentInput().participants.map((p, i) => ({
        ...p,
        players: i === 0 ? ['Jordan Lee', 'Sam Rivera'] : [],
      })),
      sessions: [{ playDate: '2026-07-04', startTime: '09:00', endTime: '21:00' }],
    }),
  );
  await generateSchedule(t.db, owner.actor, id);
  const event = await loadEvent(t.db, owner.actor, id);
  for (const m of event.matches) {
    const homeWins = (m.homeParticipantId ?? '') < (m.awayParticipantId ?? '');
    await recordScore(
      t.db,
      { kind: 'organizer', actor: owner.actor },
      id,
      m.id,
      homeWins
        ? [
            { home: 21, away: 15 },
            { home: 21, away: 17 },
          ]
        : [
            { home: 15, away: 21 },
            { home: 17, away: 21 },
          ],
      { now },
    );
  }
  await seedPlayoffs(t.db, owner.actor, id);
  return { owner, id };
}

describe('export and restore', () => {
  it('round-trips a played tournament into a new private draft with every result', async () => {
    const { owner, id } = await playedTournament('backup-owner');
    const backup = await exportEvent(t.db, owner.actor, id, now);
    const restoredId = await restoreBackup(t.db, owner.actor, JSON.stringify(backup));
    const [original, restored] = await Promise.all([
      loadEvent(t.db, owner.actor, id),
      loadEvent(t.db, owner.actor, restoredId),
    ]);
    expect(restored.competition).toMatchObject({
      status: 'draft',
      slug: 'spring-open-2',
      createdBy: owner.id,
    });
    expect(restored.matches).toHaveLength(original.matches.length);
    expect(restored.matches.every((m) => m.id.startsWith('spring-open-2-'))).toBe(true);
    const sets = (s: typeof original) =>
      s.matches.map((m) => m.sets.map((x) => [x.homePoints, x.awayPoints])).sort();
    expect(sets(restored)).toEqual(sets(original));
    expect(restored.scoreEdits).toHaveLength(original.scoreEdits.length);
    expect(restored.teamPlayers.map((p) => p.name).sort()).toEqual(['Jordan Lee', 'Sam Rivera']);
    expect(restored.pools.map((p) => p.participantIds.length)).toEqual([4, 4]);
  });

  it('restores into another account, owned by whoever restored it', async () => {
    const { owner, id } = await playedTournament('backup-giver');
    const other = await user(t.db, 'backup-taker');
    const backup = await exportEvent(t.db, owner.actor, id, now);
    const restoredId = await restoreBackup(t.db, other.actor, JSON.stringify(backup));
    expect((await listEvents(t.db, other.actor)).map((e) => [e.id, e.role, e.slug])).toEqual([
      [restoredId, 'owner', 'spring-open'],
    ]);
  });

  it('refuses to export for a stranger, and to restore something that is not a backup', async () => {
    const { id } = await playedTournament('backup-private');
    const stranger = await user(t.db, 'backup-stranger');
    await expect(exportEvent(t.db, stranger.actor, id, now)).rejects.toBeInstanceOf(NotFoundError);
    await expect(restoreBackup(t.db, stranger.actor, '{"hello":1}')).rejects.toBeInstanceOf(
      InvalidInputError,
    );
    expect(await listEvents(t.db, stranger.actor)).toEqual([]);
  });
});

describe('duplicate', () => {
  it('carries teams, rosters, courts and days, and none of the results', async () => {
    const { owner, id } = await playedTournament('dup-owner');
    const copyId = await duplicateEvent(t.db, owner.actor, id, 'Spring Open 2027');
    const copy = await loadEvent(t.db, owner.actor, copyId);
    expect(copy.competition).toMatchObject({ name: 'Spring Open 2027', status: 'draft' });
    expect(copy.participants).toHaveLength(8);
    expect(copy.participants.every((p) => p.seed === undefined)).toBe(true);
    expect(copy.teamPlayers).toHaveLength(2);
    expect(copy.courts).toHaveLength(2);
    expect(copy.timeslots.length).toBeGreaterThan(0);
    expect([copy.matches, copy.pools, copy.scoreEdits]).toEqual([[], [], []]);
    // And it can be scheduled straight away.
    const report = await generateSchedule(t.db, owner.actor, copyId);
    expect(report.unplaced).toEqual([]);
  });
});
