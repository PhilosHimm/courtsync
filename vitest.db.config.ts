import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * The data-layer suites: real SQL against a real Postgres (see
 * test/db/harness.ts). Separate from `npm test` so the ~800 pure suites stay
 * runnable with nothing but Node, and invoked explicitly — `npm run test:db`
 * — rather than skipped when a database is missing. CI runs both.
 */
export default defineConfig({
  test: {
    include: ['test/db/**/*.test.ts'],
    environment: 'node',
    testTimeout: 20_000,
    hookTimeout: 60_000,
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
});
