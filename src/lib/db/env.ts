/**
 * The server's configuration, validated once, at boot.
 *
 * Rule 7: no credentials in the repo, no fallback secrets in code — not even
 * a default — and fail at boot when a required secret is missing. So every
 * value here comes from the environment, nothing has a default, and
 * `readServerEnv` throws naming every missing variable at once, from
 * `src/instrumentation.ts`, before the first request is served. A server that
 * starts and then fails on the first sign-in is a server that looked healthy
 * to whoever deployed it.
 *
 * On Vercel, the Neon integration on the `courtsync` project supplies
 * `DATABASE_URL` and `NEON_AUTH_BASE_URL`. `NEON_AUTH_COOKIE_SECRET` is set
 * by hand in the project's environment variables. `APP_URL` may be left
 * unset there: Vercel's own `VERCEL_PROJECT_PRODUCTION_URL` names the
 * production origin, which is public configuration rather than a secret.
 *
 * `next build` never calls this. Building needs no secrets, and if it ever
 * appears to, that is a bug in the app rather than in CI.
 */

export interface ServerEnv {
  databaseUrl: string;
  auth: {
    baseUrl: string;
    cookieSecret: string;
  };
  /** Absolute origin used in links that leave the app: score links, emails. */
  appUrl: string;
  /**
   * Delivery providers. Absent means that channel is off: notifications
   * still land in the outbox and in-app, and nothing is sent. Present but
   * incomplete is a boot failure, never a silent "off".
   */
  email?: { provider: 'resend'; apiKey: string; from: string };
  sms?: { provider: 'twilio'; accountSid: string; authToken: string; from: string };
  /** Guards the delivery endpoint a scheduler calls. Required with any provider. */
  cronSecret?: string;
}

type Source = Readonly<Record<string, string | undefined>>;

export class ConfigError extends Error {
  constructor(problems: string[]) {
    super(
      `CourtSync cannot start. Fix the environment and restart:\n${problems.map((p) => `  - ${p}`).join('\n')}\n` +
        'See docs/SETUP.md. No value has a default, by design (CLAUDE.md rule 7).',
    );
    this.name = 'ConfigError';
  }
}

export function readServerEnv(source: Source = process.env): ServerEnv {
  const problems: string[] = [];
  const need = (name: string): string => {
    const value = source[name]?.trim();
    if (!value) {
      problems.push(`${name} is not set.`);
      return '';
    }
    return value;
  };

  const databaseUrl = need('DATABASE_URL');
  const baseUrl = need('NEON_AUTH_BASE_URL');
  const cookieSecret = need('NEON_AUTH_COOKIE_SECRET');
  if (cookieSecret && cookieSecret.length < 32) {
    problems.push('NEON_AUTH_COOKIE_SECRET must be at least 32 characters.');
  }
  const vercelHost = source.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  const appUrl = source.APP_URL?.trim()
    ? need('APP_URL')
    : vercelHost
      ? `https://${vercelHost}`
      : need('APP_URL');
  if (appUrl && !/^https?:\/\//.test(appUrl)) {
    problems.push('APP_URL must be an absolute http(s) origin.');
  }

  let email: ServerEnv['email'];
  const emailProvider = source.EMAIL_PROVIDER?.trim();
  if (emailProvider) {
    if (emailProvider !== 'resend') {
      problems.push(`EMAIL_PROVIDER "${emailProvider}" is not supported (supported: resend).`);
    } else {
      email = { provider: 'resend', apiKey: need('RESEND_API_KEY'), from: need('EMAIL_FROM') };
    }
  }

  let sms: ServerEnv['sms'];
  const smsProvider = source.SMS_PROVIDER?.trim();
  if (smsProvider) {
    if (smsProvider !== 'twilio') {
      problems.push(`SMS_PROVIDER "${smsProvider}" is not supported (supported: twilio).`);
    } else {
      sms = {
        provider: 'twilio',
        accountSid: need('TWILIO_ACCOUNT_SID'),
        authToken: need('TWILIO_AUTH_TOKEN'),
        from: need('SMS_FROM'),
      };
    }
  }

  let cronSecret: string | undefined;
  if (email || sms) {
    cronSecret = need('CRON_SECRET');
    if (cronSecret && cronSecret.length < 32) {
      problems.push('CRON_SECRET must be at least 32 characters.');
    }
  }

  if (problems.length > 0) throw new ConfigError(problems);
  return {
    databaseUrl,
    auth: { baseUrl, cookieSecret },
    appUrl: appUrl.replace(/\/+$/, ''),
    ...(email ? { email } : {}),
    ...(sms ? { sms } : {}),
    ...(cronSecret ? { cronSecret } : {}),
  };
}

let cached: ServerEnv | undefined;

/** The validated environment, read once per process. */
export function serverEnv(): ServerEnv {
  cached ??= readServerEnv();
  return cached;
}
