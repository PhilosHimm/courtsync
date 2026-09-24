/**
 * The provider calls, checked against a fake fetch. Nothing is sent.
 */

import { describe, expect, it } from 'vitest';
import { DeliveryError, sendEmail, sendSms } from '@/lib/notify/providers';

function recorder(status = 200) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fetchImpl = async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(status === 200 ? '{}' : 'nope', { status });
  };
  return { calls, fetchImpl };
}

describe('sendEmail', () => {
  it('posts to Resend with a one-click unsubscribe header', async () => {
    const { calls, fetchImpl } = recorder();
    await sendEmail(
      { provider: 'resend', apiKey: 'test-key', from: 'CourtSync <n@example.invalid>' },
      fetchImpl,
      {
        to: 'player@example.invalid',
        subject: 'Thursday is cancelled',
        text: 'Gym flooded.',
        unsubscribeUrl: 'https://courtsync.example.invalid/unsubscribe/tok',
        oneClickUrl: 'https://courtsync.example.invalid/api/unsubscribe/tok',
      },
    );
    expect(calls[0]!.url).toBe('https://api.resend.com/emails');
    const body = JSON.parse(String(calls[0]!.init.body));
    expect(body.to).toEqual(['player@example.invalid']);
    // The header is for the mail client's one-click POST; the visible link
    // goes to a page that asks for one tap, so a link scanner cannot
    // unsubscribe anybody.
    expect(body.headers['List-Unsubscribe']).toBe(
      '<https://courtsync.example.invalid/api/unsubscribe/tok>',
    );
    expect(body.headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
    expect(body.text).toContain('https://courtsync.example.invalid/unsubscribe/tok');
    expect(body.text).toContain('Stop these emails');
  });

  it('raises when the provider refuses, rather than marking it sent', async () => {
    const { fetchImpl } = recorder(422);
    await expect(
      sendEmail({ provider: 'resend', apiKey: 'k', from: 'f' }, fetchImpl, {
        to: 't',
        subject: 's',
        text: 'x',
        unsubscribeUrl: 'u',
        oneClickUrl: 'o',
      }),
    ).rejects.toBeInstanceOf(DeliveryError);
  });
});

describe('sendSms', () => {
  it('posts form-encoded to Twilio with basic auth', async () => {
    const { calls, fetchImpl } = recorder();
    await sendSms(
      { provider: 'twilio', accountSid: 'AC123', authToken: 'tok', from: '+15550001111' },
      fetchImpl,
      {
        to: '+15552223333',
        body: 'You are in for Thursday.',
      },
    );
    expect(calls[0]!.url).toBe('https://api.twilio.com/2010-04-01/Accounts/AC123/Messages.json');
    const params = new URLSearchParams(String(calls[0]!.init.body));
    expect(params.get('To')).toBe('+15552223333');
    expect(params.get('From')).toBe('+15550001111');
    expect((calls[0]!.init.headers as Record<string, string>).Authorization).toBe(
      `Basic ${Buffer.from('AC123:tok').toString('base64')}`,
    );
  });
});
