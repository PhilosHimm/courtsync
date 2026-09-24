import { randomBytes } from 'node:crypto';
import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end: the built app, a real Postgres, a real browser (#31).
 *
 * The app gets a database URL for a throwaway local database the setup
 * rebuilds, a cookie secret generated fresh for this run and never written
 * down, and an auth URL that goes nowhere — this suite exercises what a
 * person without an account does. `TEST_DATABASE_URL` is required and never
 * defaulted, like everywhere else.
 */
const admin = process.env.TEST_DATABASE_URL ?? '';
const appDb = (() => {
  if (!admin) return '';
  const url = new URL(admin);
  url.pathname = '/courtsync_e2e';
  return url.toString();
})();
const PORT = 3100;

export default defineConfig({
  testDir: 'e2e',
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [
    // Most tests run on both. A test tagged for one device runs only there:
    // a score entered once on a phone, a keyboard walk on a desktop.
    { name: 'phone', use: { ...devices['Pixel 7'] }, grepInvert: /@desktop-only/ },
    { name: 'desktop', use: { ...devices['Desktop Chrome'] }, grepInvert: /@phone-only/ },
  ],
  webServer: {
    command: `npm run start -- -p ${PORT}`,
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      DATABASE_URL: appDb,
      NEON_AUTH_BASE_URL: 'https://neon-auth.invalid',
      NEON_AUTH_COOKIE_SECRET: randomBytes(32).toString('hex'),
      APP_URL: `http://localhost:${PORT}`,
    },
  },
});
