/**
 * Drop-in, league and notification paths against a real Postgres.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NotFoundError } from '@/lib/db/errors';
import { createEvent, loadEvent, transitionEvent } from '@/lib/db/events';
import { deliverDue, recentNotifications, savePreference, unsubscribe } from '@/lib/db/notify';
import {
  addWalkIn,
  cancelSession,
  checkInSelf,
  follow,
  hostSetAttendance,
  joinDropIn,
  leaveDropIn,
  myParticipants,
  postAnnouncement,
  postponeSession,
  reinstateSession,
} from '@/lib/db/people';
import { loadPublicEvent } from '@/lib/db/public';
import { generateSchedule } from '@/lib/db/schedule';
import { tournamentInput, user } from './fixtures';
import { freshDatabase, type TestDatabase } from './harness';

let t: TestDatabase;
beforeAll(async () => {
  t = await freshDatabase();
});
afterAll(async () => {
  await t?.drop();
});

const now = '2026-05-07T18:00:00.000Z';

async function dropIn(name: string, capacity = 2) {
  const host = await user(t.db, `host-${name}`);
  const id = await createEvent(
    t.db,
    host.actor,
    tournamentInput({
      name: 'Thursday Drop-in',
      format: 'dropin',
      capacity,
      playersPerSide: 2,
      poolCount: undefined,
      bracketTiers: undefined,
      participants: [],
      sessions: [{ playDate: '2026-05-07', startTime: '19:00', endTime: '22:00' }],
    }),
  );
  await transitionEvent(t.db, host.actor, id, 'publish', now);
  const event = await loadEvent(t.db, host.actor, id);
  return {
    host,
    id,
    sessionId: event.sessions[0]!.id,
    load: () => loadEvent(t.db, host.actor, id),
  };
}

describe('the drop-in door', () => {
  it('fills to capacity, waitlists the rest, and promotes when someone leaves — telling them', async () => {
    const { id, sessionId, load } = await dropIn('door');
    const [a, b, c] = await Promise.all(['a', 'b', 'c'].map((n) => user(t.db, `door-${n}`)));
    await savePreference(t.db, c!.id, { emailOptIn: true, smsOptIn: false }, now);

    expect(await joinDropIn(t.db, a!, id, sessionId, now)).toEqual({ status: 'registered' });
    expect(await joinDropIn(t.db, b!, id, sessionId, now)).toEqual({ status: 'registered' });
    expect(await joinDropIn(t.db, c!, id, sessionId, now)).toEqual({
      status: 'waitlist',
      waitlistPos: 1,
    });

    await leaveDropIn(t.db, a!, id, sessionId, now);
    const list = (await load()).attendance;
    expect(list.map((x) => x.status).sort()).toEqual(['registered', 'registered']);
    const notes = await recentNotifications(t.db, c!.id);
    expect(notes.map((n) => n.subject)).toEqual(['Thursday Drop-in: you are in for 2026-05-07']);
  });

  it('lets a registered player check themselves in, and not a waitlisted one', async () => {
    const { id, sessionId } = await dropIn('self', 1);
    const [a, b] = await Promise.all(['a', 'b'].map((n) => user(t.db, `self-${n}`)));
    await joinDropIn(t.db, a!, id, sessionId, now);
    await joinDropIn(t.db, b!, id, sessionId, now);
    await checkInSelf(t.db, a!, id, sessionId, now);
    await expect(checkInSelf(t.db, b!, id, sessionId, now)).rejects.toThrow(/host/);
  });

  it('lets the host mark a no-show, promote over capacity, and add a walk-in', async () => {
    const { host, id, sessionId, load } = await dropIn('host', 1);
    const [a, b] = await Promise.all(['a', 'b'].map((n) => user(t.db, `host-p-${n}`)));
    await joinDropIn(t.db, a!, id, sessionId, now);
    await joinDropIn(t.db, b!, id, sessionId, now);
    const event = await load();
    const aId = event.participants.find((p) => p.name === 'host-p-a')!.id;
    const { promoted } = await hostSetAttendance(
      t.db,
      host.actor,
      id,
      sessionId,
      aId,
      'no_show',
      now,
    );
    expect(promoted).toHaveLength(1);
    await addWalkIn(t.db, host.actor, id, sessionId, 'Jordan Lee', now);
    const list = (await load()).attendance;
    expect(list.filter((x) => x.status === 'checked_in')).toHaveLength(1);
  });

  it('refuses the host tools to a stranger', async () => {
    const { id, sessionId, load } = await dropIn('stranger');
    const stranger = await user(t.db, 'door-stranger');
    const player = await user(t.db, 'door-player');
    await joinDropIn(t.db, player, id, sessionId, now);
    const pid = (await load()).participants[0]!.id;
    await expect(
      hostSetAttendance(t.db, stranger.actor, id, sessionId, pid, 'no_show', now),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      addWalkIn(t.db, stranger.actor, id, sessionId, 'Sneaky', now),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      cancelSession(t.db, stranger.actor, id, sessionId, null, now),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      postAnnouncement(t.db, stranger.actor, id, { body: 'Free beer' }, now),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('refuses a join to an unpublished event, or a cancelled night', async () => {
    const host = await user(t.db, 'host-draft');
    const id = await createEvent(
      t.db,
      host.actor,
      tournamentInput({ format: 'dropin', participants: [], capacity: 4 }),
    );
    const sessionId = (await loadEvent(t.db, host.actor, id)).sessions[0]!.id;
    const player = await user(t.db, 'draft-player');
    await expect(joinDropIn(t.db, player, id, sessionId, now)).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await transitionEvent(t.db, host.actor, id, 'publish', now);
    await cancelSession(t.db, host.actor, id, sessionId, 'Gym flooded', now);
    await expect(joinDropIn(t.db, player, id, sessionId, now)).rejects.toThrow(/cancelled/);
    await reinstateSession(t.db, host.actor, id, sessionId);
    expect((await joinDropIn(t.db, player, id, sessionId, now)).status).toBe('registered');
  });
});

describe('public pages', () => {
  it('shows a drop-in player as first name and last initial, and never their contact details', async () => {
    const { host, id, sessionId } = await dropIn('public');
    await addWalkIn(t.db, host.actor, id, sessionId, 'Jordan Lee', now);
    const page = await loadPublicEvent(t.db, id);
    const json = JSON.stringify(page);
    expect(json).toContain('Jordan L.');
    expect(json).not.toContain('Jordan Lee');
    expect(json).not.toContain('@example.invalid');
    expect(page.attendance[0]!.going.map((g) => g.name)).toEqual(['Jordan L.']);
  });

  it('keeps team names as entered', async () => {
    const host = await user(t.db, 'host-teams');
    const id = await createEvent(t.db, host.actor, tournamentInput());
    await transitionEvent(t.db, host.actor, id, 'publish', now);
    const page = await loadPublicEvent(t.db, id);
    expect(page.participants.map((p) => p.name)).toContain('Libero Club');
  });

  it('does not exist for an event that is a draft or archived', async () => {
    const host = await user(t.db, 'host-hidden');
    const id = await createEvent(t.db, host.actor, tournamentInput());
    await expect(loadPublicEvent(t.db, id)).rejects.toBeInstanceOf(NotFoundError);
    await transitionEvent(t.db, host.actor, id, 'publish', now);
    await transitionEvent(t.db, host.actor, id, 'archive', now);
    await expect(loadPublicEvent(t.db, id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(loadPublicEvent(t.db, 'not-a-uuid')).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('announcements and notifications', () => {
  it('queues an announcement to followers, coalescing repeated schedule news into one message', async () => {
    const host = await user(t.db, 'host-announce');
    const fan = await user(t.db, 'fan');
    const id = await createEvent(
      t.db,
      host.actor,
      tournamentInput({
        name: 'Tuesday League',
        format: 'league',
        poolCount: undefined,
        bracketTiers: undefined,
        participants: ['A', 'B', 'C', 'D'].map((name) => ({ name })),
        sessions: [1, 2, 3, 4].map((n) => ({
          playDate: `2026-10-${String(n * 7 - 1).padStart(2, '0')}`,
          startTime: '19:00',
          endTime: '22:00',
        })),
      }),
    );
    await transitionEvent(t.db, host.actor, id, 'publish', now);
    await generateSchedule(t.db, host.actor, id);
    const event = await loadEvent(t.db, host.actor, id);
    await follow(t.db, fan, event.participants[0]!.id);
    expect((await myParticipants(t.db, fan)).map((p) => p.how)).toEqual(['follows']);
    await savePreference(
      t.db,
      fan.id,
      { emailOptIn: true, smsOptIn: true, phone: '+1 416 555 0100' },
      now,
    );

    await postAnnouncement(t.db, host.actor, id, { body: 'Bring a dark shirt.' }, now);
    await postponeSession(
      t.db,
      host.actor,
      id,
      event.sessions[1]!.id,
      '2026-10-20',
      'cascade',
      now,
    );
    await postponeSession(t.db, host.actor, id, event.sessions[3]!.id, '2026-11-10', 'only', now);

    const notes = await recentNotifications(t.db, fan.id);
    // Two channels × (announcement + one coalesced schedule message).
    expect(notes).toHaveLength(4);
    const schedule = notes.filter((n) => n.subject.includes('schedule changed'));
    expect(schedule).toHaveLength(2);
    expect(schedule[0]!.body.split('\n')).toHaveLength(2);
  });

  it('delivers what is due through the configured channel, checks consent again, and honours unsubscribe', async () => {
    const host = await user(t.db, 'host-deliver');
    const fan = await user(t.db, 'deliver-fan');
    const { id, sessionId } = await dropIn('deliver');
    void host;
    await savePreference(t.db, fan.id, { emailOptIn: true, smsOptIn: false }, now);
    await joinDropIn(t.db, fan, id, sessionId, now);
    const hostOf = await t.pool.query('select created_by from competition where id = $1', [id]);
    await cancelSession(
      t.db,
      { userId: hostOf.rows[0].created_by },
      id,
      sessionId,
      'Gym flooded',
      now,
    );

    const sent: string[] = [];
    const fetchImpl = async (url: string, init: RequestInit) => {
      sent.push(`${url} ${String(init.body)}`);
      return new Response('{}', { status: 200 });
    };
    const env = {
      appUrl: 'https://courtsync.example.invalid',
      email: { provider: 'resend' as const, apiKey: 'k', from: 'f' },
    };
    // Not due yet: held for the digest window.
    expect(await deliverDue(t.db, env, fetchImpl, now)).toEqual({ sent: 0, failed: 0 });
    const later = '2026-05-07T18:10:00.000Z';
    // Earlier tests in this file queued messages of their own; this checks
    // this person's, however many others were due alongside.
    const first = await deliverDue(t.db, env, fetchImpl, later);
    expect(first.failed).toBe(0);
    const mine = await t.pool.query(
      'select count(*)::int as n from notification where user_id = $1 and sent_at is not null',
      [fan.id],
    );
    expect(mine.rows[0].n).toBe(1);
    const toFan = sent.find((line) => line.includes('deliver-fan@example.invalid')) ?? '';
    expect(toFan).toContain('is cancelled');
    const token = /unsubscribe\/([A-Za-z0-9_-]+)/.exec(toFan)?.[1];
    expect(token).toBeTruthy();
    // Nothing is sent twice.
    expect(await deliverDue(t.db, env, fetchImpl, later)).toEqual({ sent: 0, failed: 0 });

    expect(await unsubscribe(t.db, token!, later)).toBe(true);
    await postAnnouncement(
      t.db,
      { userId: hostOf.rows[0].created_by },
      id,
      { body: 'Back next week' },
      later,
    );
    expect(await deliverDue(t.db, env, fetchImpl, '2026-05-07T19:00:00.000Z')).toEqual({
      sent: 0,
      failed: 0,
    });
  });

  it('refuses SMS consent without a usable number, and forgets the number when SMS is turned off', async () => {
    const person = await user(t.db, 'sms-person');
    await expect(
      savePreference(t.db, person.id, { emailOptIn: false, smsOptIn: true, phone: 'call me' }, now),
    ).rejects.toThrow(/phone number/);
    await savePreference(
      t.db,
      person.id,
      { emailOptIn: false, smsOptIn: true, phone: '+44 20 7946 0000' },
      now,
    );
    expect(
      (await t.pool.query('select phone from app_user where id = $1', [person.id])).rows[0].phone,
    ).toBe('+442079460000');
    await savePreference(t.db, person.id, { emailOptIn: false, smsOptIn: false }, now);
    expect(
      (await t.pool.query('select phone from app_user where id = $1', [person.id])).rows[0].phone,
    ).toBeNull();
  });
});
