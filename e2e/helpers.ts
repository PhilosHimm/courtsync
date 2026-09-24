import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

export const seeded = (): {
  tournament: string;
  dropin: string;
  draft: string;
  token: string;
  q1: string;
} => JSON.parse(readFileSync('e2e/.seed.json', 'utf8'));

const axeSource = readFileSync(
  createRequire(import.meta.url).resolve('axe-core/axe.min.js'),
  'utf8',
);

/**
 * Run axe on the page as it is and fail on any serious or critical
 * violation (#30: verified by automated axe, never asserted). Minor and
 * moderate findings are reported in the failure message too when present.
 */
export async function expectNoSeriousA11yViolations(page: Page): Promise<void> {
  await page.addScriptTag({ content: axeSource });
  type Violation = { id: string; impact: string; targets: string[] };
  const violations: Violation[] = await page.evaluate(async () => {
    // @ts-expect-error axe is injected above
    const result = await window.axe.run(document, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
    });
    return result.violations.map(
      (v: { id: string; impact: string; nodes: Array<{ target: string[] }> }) => ({
        id: v.id,
        impact: v.impact,
        targets: v.nodes.slice(0, 3).map((n) => n.target.join(' ')),
      }),
    );
  });
  const serious = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(serious, JSON.stringify(violations, null, 2)).toEqual([]);
}
