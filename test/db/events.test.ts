/**
 * The events data layer, against a real Postgres.
 *
 * Rule 6 is the one this suite is mostly about: Neon has no row-level
 * security, so a missed authorization check in application code is a hole
 * with nothing underneath it. Every write here has a case proving a stranger
 * is refused.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  addCoOrganizer,
  createEvent,
  deleteEvent,
  listEvents,
  loadEvent,
  removeCoOrganizer,
  transitionEvent,
  updateBasics,
  updateFormatSettings,
} from '@/lib/db/events';
import { NotFoundError } from '@/lib/db/errors';
import { freshDatabase, type TestDatabase } from './harness';
import { tournamentInput, user } from './fixtures';

let t: TestDatabase;
beforeAll(async () => {
  t = await freshDatabase();
});
afterAll(async () => {
  await t?.drop();
});

describe('createEvent', () => {
  it('creates the event, its venue, courts, sessions, timeslots and entries in one go', async () => {
    const owner = await user(t.db, 'owner-create');
    const id = await createEvent(t.db, owner.actor, tournamentInput());
    const event = await loadEvent(t.db, owner.actor, id);

    expect(event.competition).toMatchObject({
      name: 'Spring Open',
      slug: 'spring-open',
      format: 'tournament',
      status: 'draft',
      createdBy: owner.id,
      timeZone: 'America/Toronto',
      poolCount: 2,
      bracketTiers: ['gold'],
    });
    expect(event.venue?.name).toBe('Riverside Gym');
    expect(event.courts.map((c) => c.name)).toEqual(['Court 1', 'Court 2']);
    expect(event.sessions).toHaveLength(1);
    expect(event.sessions[0]).toMatchObject({ playDate: '2026-07-04', startTime: '09:00', endTime: '17:00', sequence: 1 });
    // 09:00–17:00 at 45 + 15 is eight slots, starting 09:00 in Toronto = 13:00Z.
    expect(event.timeslots).toHaveLength(8);
    expect(event.timeslots[0]).toMatchObject({ startAt: '2026-07-04T13:00:00.000Z', endAt: '2026-07-04T13:45:00.000Z' });
    expect(event.participants.map((p) => p.name)).toEqual([
      'Spikers', 'Blockheads', 'Dig Deep', 'Setters', 'Aces', 'Net Gains', 'Side Out', 'Libero Club',
    ]);
  });

  it('gives a second event with the same name its own slug', async () => {
    const owner = await user(t.db, 'owner-slug');
    const first = await createEvent(t.db, owner.actor, tournamentInput());
    const second = await createEvent(t.db, owner.actor, tournamentInput());
    const [a, b] = await Promise.all([loadEvent(t.db, owner.actor, first), loadEvent(t.db, owner.actor, second)]);
    expect([a.competition.slug, b.competition.slug]).toEqual(['spring-open', 'spring-open-2']);
  });

  it('refuses an event with nothing sensible in it, saying why', async () => {
    const owner = await user(t.db, 'owner-invalid');
    await expect(
      createEvent(t.db, owner.actor, tournamentInput({ name: ' ', timeZone: 'Nowhere/Special' })),
    ).rejects.toThrow(/name[\s\S]*time zone/);
  });

  it('writes nothing when any part of it fails', async () => {
    // Rule 5: a duplicate court name is caught up front; a failure midway
    // (here, a session the database rejects) must leave no half-event behind.
    const owner = await user(t.db, 'owner-atomic');
    await expect(
      createEvent(t.db, owner.actor, tournamentInput({ sessions: [{ playDate: '2026-02-30', startTime: '09:00', endTime: '10:00' }] })),
    ).rejects.toThrow();
    expect(await listEvents(t.db, owner.actor)).toEqual([]);
    const { rows } = await t.pool.query('select count(*)::int as n from venue where created_by = $1', [owner.id]);
    expect(rows[0].n).toBe(0);
  });
});

describe('who may see and change an event', () => {
  it('shows a stranger nothing — not even that it exists', async () => {
    const owner = await user(t.db, 'owner-stranger');
    const stranger = await user(t.db, 'stranger');
    const id = await createEvent(t.db, owner.actor, tournamentInput());
    await expect(loadEvent(t.db, stranger.actor, id)).rejects.toBeInstanceOf(NotFoundError);
    expect(await listEvents(t.db, stranger.actor)).toEqual([]);
  });

  it('refuses every write from a stranger', async () => {
    const owner = await user(t.db, 'owner-writes');
    const stranger = await user(t.db, 'stranger-writes');
    const id = await createEvent(t.db, owner.actor, tournamentInput());
    const now = '2026-06-01T12:00:00Z';
    const attempts = [
      () => updateBasics(t.db, stranger.actor, id, { name: 'Mine now', timeZone: 'UTC' }),
      () =>
        updateFormatSettings(t.db, stranger.actor, id, {
          gameDurationMin: 30,
          bufferMin: 0,
          minRestMin: 0,
          forfeitPolicy: 'winOnly',
        }),
      () => transitionEvent(t.db, stranger.actor, id, 'publish', now),
      () => deleteEvent(t.db, stranger.actor, id, 'Spring Open'),
      () => addCoOrganizer(t.db, stranger.actor, id, 'stranger-writes@example.invalid'),
    ];
    for (const attempt of attempts) await expect(attempt()).rejects.toBeInstanceOf(NotFoundError);
    const event = await loadEvent(t.db, owner.actor, id);
    expect(event.competition).toMatchObject({ name: 'Spring Open', status: 'draft', forfeitPolicy: 'setsOnly' });
  });

  it('lets a co-organizer run the event but not delete it or change who runs it', async () => {
    const owner = await user(t.db, 'owner-co');
    const helper = await user(t.db, 'helper');
    const id = await createEvent(t.db, owner.actor, tournamentInput());
    await addCoOrganizer(t.db, owner.actor, id, 'HELPER@example.invalid');

    await updateBasics(t.db, helper.actor, id, { name: 'Spring Open II', timeZone: 'America/Toronto' });
    expect((await loadEvent(t.db, helper.actor, id)).competition.name).toBe('Spring Open II');
    expect((await listEvents(t.db, helper.actor)).map((e) => [e.id, e.role])).toEqual([[id, 'co_organizer']]);

    await expect(deleteEvent(t.db, helper.actor, id, 'Spring Open II')).rejects.toThrow(/owner/);
    await expect(addCoOrganizer(t.db, helper.actor, id, 'owner-co@example.invalid')).rejects.toThrow(/owner/);

    await removeCoOrganizer(t.db, owner.actor, id, helper.id);
    await expect(loadEvent(t.db, helper.actor, id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('answers an unknown email the same way as the owner’s own, so the form reveals nobody', async () => {
    const owner = await user(t.db, 'owner-probe');
    const id = await createEvent(t.db, owner.actor, tournamentInput());
    const unknown = await addCoOrganizer(t.db, owner.actor, id, 'nobody@example.invalid').catch((e: Error) => e.message);
    const self = await addCoOrganizer(t.db, owner.actor, id, 'owner-probe@example.invalid').catch((e: Error) => e.message);
    expect(unknown).toBe(self);
  });
});

describe('an event’s life', () => {
  it('publishes, unpublishes, archives and restores — restoring to a draft, never straight to public', async () => {
    const owner = await user(t.db, 'owner-life');
    const id = await createEvent(t.db, owner.actor, tournamentInput());
    const status = async () => (await loadEvent(t.db, owner.actor, id)).competition.status;

    await transitionEvent(t.db, owner.actor, id, 'publish', '2026-06-01T12:00:00Z');
    expect(await status()).toBe('published');
    expect((await loadEvent(t.db, owner.actor, id)).competition.publishedAt).toBe('2026-06-01T12:00:00.000Z');
    await expect(transitionEvent(t.db, owner.actor, id, 'publish', '2026-06-02T12:00:00Z')).rejects.toThrow();

    await transitionEvent(t.db, owner.actor, id, 'archive', '2026-06-03T12:00:00Z');
    expect(await status()).toBe('archived');
    await transitionEvent(t.db, owner.actor, id, 'restore', '2026-06-04T12:00:00Z');
    expect(await status()).toBe('draft');
  });

  it('deletes only with the name typed back, and takes everything with it', async () => {
    const owner = await user(t.db, 'owner-delete');
    const id = await createEvent(t.db, owner.actor, tournamentInput());
    await expect(deleteEvent(t.db, owner.actor, id, 'spring open')).rejects.toThrow(/exactly/);
    await deleteEvent(t.db, owner.actor, id, 'Spring Open');
    await expect(loadEvent(t.db, owner.actor, id)).rejects.toBeInstanceOf(NotFoundError);
    const { rows } = await t.pool.query('select count(*)::int as n from participant where competition_id = $1', [id]);
    expect(rows[0].n).toBe(0);
  });

  it('keeps the slug when the event is renamed, so no match id is orphaned', async () => {
    const owner = await user(t.db, 'owner-rename');
    const id = await createEvent(t.db, owner.actor, tournamentInput());
    await updateBasics(t.db, owner.actor, id, { name: 'Summer Open', timeZone: 'America/Toronto' });
    expect((await loadEvent(t.db, owner.actor, id)).competition).toMatchObject({ name: 'Summer Open', slug: 'spring-open' });
  });

  it('stores per-phase set formats and a tiebreaker order, and refuses a bad order', async () => {
    const owner = await user(t.db, 'owner-format');
    const id = await createEvent(t.db, owner.actor, tournamentInput());
    await updateFormatSettings(t.db, owner.actor, id, {
      gameDurationMin: 40,
      bufferMin: 5,
      minRestMin: 30,
      forfeitPolicy: 'winOnly',
      tiebreakerOrder: ['winPercentage', 'pointDifferential', 'setDifferential'],
      setFormats: { pool: [{ target: 25, winBy: 2, cap: 27 }], playoff: [] },
    });
    const event = await loadEvent(t.db, owner.actor, id);
    expect(event.competition).toMatchObject({
      gameDurationMin: 40,
      minRestMin: 30,
      forfeitPolicy: 'winOnly',
      tiebreakerOrder: ['winPercentage', 'pointDifferential', 'setDifferential'],
    });
    expect(event.setFormats.map((f) => [f.phase, f.setNumber, f.target, f.cap])).toEqual([['pool', 1, 25, 27]]);

    await expect(
      updateFormatSettings(t.db, owner.actor, id, {
        gameDurationMin: 40,
        bufferMin: 5,
        minRestMin: 0,
        forfeitPolicy: 'setsOnly',
        tiebreakerOrder: ['winPercentage', 'winPercentage'],
      }),
    ).rejects.toThrow(/more than once/);
  });
});
