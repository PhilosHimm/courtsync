import type { ServerEnv } from '@/lib/db/env';

/**
 * Sending, and nothing else. One function per channel, each a single HTTP
 * call to the provider with the credentials handed in — never read from a
 * default, never written anywhere (rule 7). `fetch` is a parameter so the
 * tests can check exactly what would be sent without sending it.
 *
 * SMS unsubscribe is the carrier-standard STOP reply, which Twilio's
 * Advanced Opt-Out handles before a message reaches us; email carries a
 * one-click List-Unsubscribe link to our own endpoint.
 */

type Fetch = (url: string, init: RequestInit) => Promise<Response>;

export class DeliveryError extends Error {
  constructor(channel: string, status: number, detail: string) {
    super(`${channel} delivery failed (${status}): ${detail.slice(0, 200)}`);
    this.name = 'DeliveryError';
  }
}

export async function sendEmail(
  config: NonNullable<ServerEnv['email']>,
  fetchImpl: Fetch,
  message: {
    to: string;
    subject: string;
    text: string;
    unsubscribeUrl: string;
    oneClickUrl: string;
  },
): Promise<void> {
  const response = await fetchImpl('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: config.from,
      to: [message.to],
      subject: message.subject,
      text: `${message.text}\n\n—\nStop these emails: ${message.unsubscribeUrl}`,
      headers: {
        'List-Unsubscribe': `<${message.oneClickUrl}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
    }),
  });
  if (!response.ok) throw new DeliveryError('Email', response.status, await response.text());
}

export async function sendSms(
  config: NonNullable<ServerEnv['sms']>,
  fetchImpl: Fetch,
  message: { to: string; body: string },
): Promise<void> {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(config.accountSid)}/Messages.json`;
  const response = await fetchImpl(url, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${config.accountSid}:${config.authToken}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ To: message.to, From: config.from, Body: message.body }).toString(),
  });
  if (!response.ok) throw new DeliveryError('SMS', response.status, await response.text());
}
