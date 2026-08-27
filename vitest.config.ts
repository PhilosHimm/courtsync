import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
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
