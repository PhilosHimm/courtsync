import type { StorybookConfig } from '@storybook/nextjs-vite';

/**
 * The design system's reference (#31): the Apple-derived system in
 * DESIGN-apple.md and globals.css, rendered — foundations, then each
 * component with its states — and checked by axe in the a11y panel. It is
 * where the prose gets checked against what the components actually render.
 */
const config: StorybookConfig = {
  framework: { name: '@storybook/nextjs-vite', options: {} },
  stories: ['../src/stories/**/*.mdx', '../src/stories/**/*.stories.tsx'],
  addons: ['@storybook/addon-docs', '@storybook/addon-a11y'],
  staticDirs: [],
  // No telemetry: a project that keeps player names off third parties does
  // not report its own tooling to one either.
  core: { disableTelemetry: true },
};

export default config;
