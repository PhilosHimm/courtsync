import type { Preview } from '@storybook/nextjs-vite';
import '../src/app/globals.css';

const preview: Preview = {
  parameters: {
    layout: 'padded',
    // Fail the a11y panel on violations rather than listing them politely:
    // the same bar the browser suite holds the app to.
    a11y: { test: 'error' },
    nextjs: { appDirectory: true },
  },
  decorators: [
    (Story) => (
      <div className="font-text text-ink">
        <Story />
      </div>
    ),
  ],
};

export default preview;
