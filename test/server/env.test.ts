/**
 * Specification for the server's boot-time configuration (rule 7).
 *
 * No credentials in the repo, no fallback secrets in code, and fail at boot
 * when a required one is missing — naming every missing variable at once,
 * so a deploy is fixed in one pass rather than one restart per variable.
 */

import { describe, expect, it } from 'vitest';
import { ConfigError, readServerEnv } from '@/lib/db/env';

const complete = {
  DATABASE_URL: 'postgres://example.invalid/db',
  NEON_AUTH_BASE_URL: 'https://auth.example.invalid',
  NEON_AUTH_COOKIE_SECRET: 'x'.repeat(32),
  APP_URL: 'https://courtsync.example.invalid/',
};

describe('readServerEnv', () => {
  it('reads a complete environment, trimming a trailing slash off the origin', () => {
    const env = readServerEnv(complete);
    expect(env.appUrl).toBe('https://courtsync.example.invalid');
    expect(env.email).toBeUndefined();
    expect(env.sms).toBeUndefined();
  });

  it('names every missing variable in one error', () => {
    try {
      readServerEnv({});
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigError);
      const message = (error as Error).message;
      for (const name of [
        'DATABASE_URL',
        'NEON_AUTH_BASE_URL',
        'NEON_AUTH_COOKIE_SECRET',
        'APP_URL',
      ]) {
        expect(message).toContain(name);
      }
    }
  });

  it('treats a blank value as missing, not as an empty secret', () => {
    expect(() => readServerEnv({ ...complete, NEON_AUTH_COOKIE_SECRET: '   ' })).toThrow(
      /NEON_AUTH_COOKIE_SECRET/,
    );
  });

  it('refuses a cookie secret too short to sign with', () => {
    expect(() => readServerEnv({ ...complete, NEON_AUTH_COOKIE_SECRET: 'short' })).toThrow(
      /32 characters/,
    );
  });

  it('takes the production origin from Vercel when APP_URL is not set', () => {
    const { APP_URL: _unset, ...rest } = complete;
    const env = readServerEnv({
      ...rest,
      VERCEL_PROJECT_PRODUCTION_URL: 'courtsync-theta.vercel.app',
    });
    expect(env.appUrl).toBe('https://courtsync-theta.vercel.app');
  });

  it('turns a delivery channel on only with every credential it needs', () => {
    expect(() => readServerEnv({ ...complete, SMS_PROVIDER: 'twilio' })).toThrow(
      /TWILIO_ACCOUNT_SID[\s\S]*TWILIO_AUTH_TOKEN[\s\S]*SMS_FROM[\s\S]*CRON_SECRET/,
    );
    const env = readServerEnv({
      ...complete,
      EMAIL_PROVIDER: 'resend',
      RESEND_API_KEY: 'key',
      EMAIL_FROM: 'CourtSync <noreply@example.invalid>',
      CRON_SECRET: 'c'.repeat(32),
    });
    expect(env.email?.provider).toBe('resend');
  });

  it('refuses a provider it does not support rather than quietly sending nothing', () => {
    expect(() => readServerEnv({ ...complete, EMAIL_PROVIDER: 'carrier-pigeon' })).toThrow(
      /carrier-pigeon/,
    );
  });
});
