import { createHash, randomBytes } from 'node:crypto';
import type { NotificationPreference, UUID } from '@/lib/core';
import type { Notice } from '@/lib/event/notify';
import { appendBody, channelsFor, holdUntil, render, smsText } from '@/lib/event/notify';
import { sendEmail, sendSms } from '@/lib/notify/providers';
import type { ServerEnv } from './env';
import { iso, isoOrUndefined } from './rows';
import { withTransaction } from './tx';
import type { Db, Queryable } from './types';

/**
 * The notification outbox (#27): consent, queueing with coalescing,
 * delivery, unsubscribe. Every message goes through the queue — nothing
 * sends inline from a request — so a schedule edit at 8:52 costs one queued
 * row per person, not forty texts.
 */

const sha = (token: string) => createHash('sha256').update(token).digest('hex');

export async function getPreference(q: Queryable, userId: UUID): Promise<NotificationPreference> {
  const { rows } = await q.query<{
    email_opt_in: boolean;
    sms_opt_in: boolean;
    email_consent_at: unknown;
    sms_consent_at: unknown;
  }>(
    'select email_opt_in, sms_opt_in, email_consent_at, sms_consent_at from notification_preference where user_id = $1',
    [userId],
  );
  const r = rows[0];
  const pref: NotificationPreference = {
    userId,
    emailOptIn: r?.email_opt_in ?? false,
    smsOptIn: r?.sms_opt_in ?? false,
  };
  const emailAt = isoOrUndefined(r?.email_consent_at);
  const smsAt = isoOrUndefined(r?.sms_consent_at);
  if (emailAt) pref.emailConsentAt = emailAt;
  if (smsAt) pref.smsConsentAt = smsAt;
  return pref;
}

/**
 * Save a person's own choices. Turning a channel on records when consent was
 * given; turning it off keeps that record (it happened) but stops sending.
 * A phone number is only stored alongside SMS consent.
 */
export async function savePreference(
  db: Db,
  userId: UUID,
  choice: { emailOptIn: boolean; smsOptIn: boolean; phone?: string | null },
  now: string,
): Promise<void> {
  const phone = choice.phone?.replace(/[^\d+]/g, '') || null;
  if (choice.smsOptIn && !(phone && /^\+?\d{8,15}$/.test(phone))) {
    throw new Error('Texts need a phone number with its country code, like +1 416 555 0100.');
  }
  await withTransaction(db, async (tx) => {
    await tx.query(
      `insert into notification_preference (user_id, email_opt_in, sms_opt_in, email_consent_at, sms_consent_at, updated_at)
       values ($1, $2, $3, case when $2 then $4::timestamptz end, case when $3 then $4::timestamptz end, $4)
       on conflict (user_id) do update set
         email_opt_in = excluded.email_opt_in,
         sms_opt_in = excluded.sms_opt_in,
         email_consent_at = case when excluded.email_opt_in and not notification_preference.email_opt_in
                                 then excluded.email_consent_at else notification_preference.email_consent_at end,
         sms_consent_at = case when excluded.sms_opt_in and not notification_preference.sms_opt_in
                               then excluded.sms_consent_at else notification_preference.sms_consent_at end,
         updated_at = excluded.updated_at`,
      [userId, choice.emailOptIn, choice.smsOptIn, now],
    );
    // No SMS consent, no number kept: the least personal data that works.
    await tx.query('update app_user set phone = $2 where id = $1', [
      userId,
      choice.smsOptIn ? phone : null,
    ]);
  });
}

/** A fresh one-click unsubscribe token for this person. Only its hash is kept. */
export async function issueUnsubscribeToken(q: Queryable, userId: UUID): Promise<string> {
  const token = randomBytes(24).toString('base64url');
  await q.query(
    `insert into notification_preference (user_id, unsubscribe_token_hash) values ($1, $2)
     on conflict (user_id) do update set unsubscribe_token_hash = excluded.unsubscribe_token_hash`,
    [userId, sha(token)],
  );
  return token;
}

/** Turn every channel off for whoever holds this token. Works signed out, by design. */
export async function unsubscribe(q: Queryable, token: string, now: string): Promise<boolean> {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return false;
  const result = await q.query(
    `update notification_preference set email_opt_in = false, sms_opt_in = false, updated_at = $2
      where unsubscribe_token_hash = $1`,
    [sha(token), now],
  );
  return (result.rowCount ?? 0) > 0;
}

/**
 * Queue a notice for these people on every channel each has consented to.
 * A notice joining an unsent message with the same key is appended to it and
 * holds it a little longer, never past the cap.
 */
export async function enqueue(
  tx: Queryable,
  userIds: readonly UUID[],
  notice: Notice,
  now: string,
): Promise<number> {
  if (userIds.length === 0) return 0;
  const message = render(notice);
  const { rows: people } = await tx.query<{
    id: string;
    email: string | null;
    phone: string | null;
    email_opt_in: boolean | null;
    sms_opt_in: boolean | null;
  }>(
    `select u.id, u.email, u.phone, p.email_opt_in, p.sms_opt_in
       from app_user u left join notification_preference p on p.user_id = u.id
      where u.id = any($1::uuid[])`,
    [[...new Set(userIds)]],
  );
  let queued = 0;
  for (const person of people) {
    const channels = channelsFor(
      person.email_opt_in === null
        ? null
        : { emailOptIn: Boolean(person.email_opt_in), smsOptIn: Boolean(person.sms_opt_in) },
      person,
    );
    for (const channel of channels) {
      const { rows: held } = await tx.query<{ id: string; body: string; created_at: unknown }>(
        `select id, body, created_at from notification
          where user_id = $1 and channel = $2 and digest_key = $3 and sent_at is null and failed_at is null
          order by created_at limit 1 for update`,
        [person.id, channel, message.digestKey],
      );
      const existing = held[0];
      if (existing) {
        await tx.query('update notification set body = $2, not_before = $3 where id = $1', [
          existing.id,
          appendBody(existing.body, message.body),
          holdUntil({ now, existingCreatedAt: iso(existing.created_at) }),
        ]);
      } else {
        await tx.query(
          `insert into notification (user_id, channel, competition_id, digest_key, subject, body, created_at, not_before)
           values ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            person.id,
            channel,
            notice.eventId,
            message.digestKey,
            message.subject,
            message.body,
            now,
            holdUntil({ now, existingCreatedAt: null }),
          ],
        );
        queued += 1;
      }
    }
  }
  return queued;
}

type Fetch = (url: string, init: RequestInit) => Promise<Response>;

/**
 * Send what is due. Called by the scheduler endpoint, never by a page. Each
 * message is claimed with `skip locked`, so two overlapping runs never send
 * the same text twice. A channel with no provider configured leaves its
 * messages queued: they are still visible in-app.
 */
export async function deliverDue(
  db: Db,
  env: Pick<ServerEnv, 'email' | 'sms' | 'appUrl'>,
  fetchImpl: Fetch,
  now: string,
  limit = 50,
): Promise<{ sent: number; failed: number }> {
  let sent = 0;
  let failed = 0;
  const channels = [...(env.email ? ['email'] : []), ...(env.sms ? ['sms'] : [])];
  if (channels.length === 0) return { sent, failed };

  for (let i = 0; i < limit; i++) {
    const done = await withTransaction(db, async (tx) => {
      const { rows } = await tx.query<{
        id: string;
        user_id: string;
        channel: 'email' | 'sms';
        subject: string;
        body: string;
        email: string | null;
        phone: string | null;
        email_opt_in: boolean | null;
        sms_opt_in: boolean | null;
      }>(
        `select n.id, n.user_id, n.channel, n.subject, n.body, u.email, u.phone, p.email_opt_in, p.sms_opt_in
           from notification n join app_user u on u.id = n.user_id
           left join notification_preference p on p.user_id = n.user_id
          where n.sent_at is null and n.failed_at is null and n.not_before <= $1
            and n.channel = any($2::notification_channel[])
          order by n.not_before, n.id
          limit 1
          for update of n skip locked`,
        [now, channels],
      );
      const row = rows[0];
      if (!row) return false;

      // Consent is checked again at send time: someone who unsubscribed
      // after the message was queued does not get it.
      const allowed =
        row.channel === 'email' ? row.email_opt_in && row.email : row.sms_opt_in && row.phone;
      if (!allowed) {
        await tx.query(
          "update notification set failed_at = $2, error = 'consent withdrawn' where id = $1",
          [row.id, now],
        );
        return true;
      }
      try {
        if (row.channel === 'email' && env.email && row.email) {
          const token = await issueUnsubscribeToken(tx, row.user_id);
          await sendEmail(env.email, fetchImpl, {
            to: row.email,
            subject: row.subject,
            text: row.body,
            unsubscribeUrl: `${env.appUrl}/unsubscribe/${token}`,
            oneClickUrl: `${env.appUrl}/api/unsubscribe/${token}`,
          });
        } else if (row.channel === 'sms' && env.sms && row.phone) {
          await sendSms(env.sms, fetchImpl, {
            to: row.phone,
            body: smsText(row.subject, row.body),
          });
        }
        await tx.query('update notification set sent_at = $2 where id = $1', [row.id, now]);
        sent += 1;
      } catch (error) {
        await tx.query('update notification set failed_at = $2, error = $3 where id = $1', [
          row.id,
          now,
          (error as Error).message.slice(0, 500),
        ]);
        failed += 1;
      }
      return true;
    });
    if (!done) break;
  }
  return { sent, failed };
}

/** The last few messages for a person, for the in-app notice list. */
export async function recentNotifications(
  q: Queryable,
  userId: UUID,
): Promise<Array<{ id: UUID; subject: string; body: string; createdAt: string; channel: string }>> {
  const { rows } = await q.query<{
    id: string;
    subject: string;
    body: string;
    created_at: unknown;
    channel: string;
  }>(
    `select id, subject, body, created_at, channel from notification
      where user_id = $1 order by created_at desc, id limit 20`,
    [userId],
  );
  return rows.map((r) => ({
    id: r.id,
    subject: r.subject,
    body: r.body,
    createdAt: iso(r.created_at),
    channel: r.channel,
  }));
}
