import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // .tsx so component accessibility suites are collected. They opt into a
    // DOM per file with a docblock rather than making the ~500
    // pure-function tests pay for one.
    include: ['test/**/*.test.{ts,tsx}'],
    environment: 'node',
  },
  resolve: {
    // The same `@/*` -> `./src/*` alias tsconfig.json declares. Vitest does not
    // read tsconfig paths on its own, and adding vite-tsconfig-paths for one
    // alias is more dependency than this needs.
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
});
