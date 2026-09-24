import { expect, test } from '@playwright/test';
import { expectNoSeriousA11yViolations, seeded } from './helpers';

test.describe.configure({ mode: 'serial' });

// One scorekeeper, one phone: the score is entered once, on the phone project.
test('a scorekeeper enters a score through their link, and the public page shows it @phone-only', async ({
  page,
}) => {
  const { token, tournament } = seeded();
  await page.goto(`/score/${token}`);
  await expect(page.getByRole('heading', { level: 1 })).toContainText(' v ');
  await expectNoSeriousA11yViolations(page);

  const inputs = page.getByRole('textbox');
  await inputs.nth(0).fill('25');
  await inputs.nth(1).fill('18');
  await inputs.nth(2).fill('25');
  await inputs.nth(3).fill('21');
  await page.getByRole('button', { name: 'Save score' }).click();
  await expect(page.getByRole('status')).toContainText('Score saved');

  await page.goto(`/e/${tournament}?tab=bracket&view=list`);
  await expect(page.getByText('25–18, 25–21')).toBeVisible();
});

test('a correction through the link is confirmed before it is saved @phone-only', async ({
  page,
}) => {
  const { token } = seeded();
  await page.goto(`/score/${token}`);
  const inputs = page.getByRole('textbox');
  await inputs.nth(1).fill('23');
  await page.getByRole('button', { name: 'Save score' }).click();
  await expect(
    page.getByRole('alert').filter({ hasText: 'This changes a recorded score' }),
  ).toContainText('Set 1: 25–18 → 25–23');
  await page.getByLabel('Why (kept in the history)').fill('Misread');
  await page.getByRole('button', { name: 'Confirm the change' }).click();
  await expect(page.getByRole('status')).toContainText('Score saved');
});

test('an unknown score link says so and shows nothing of any event', async ({ page }) => {
  await page.goto('/score/not-a-real-token-at-all');
  await expect(page.getByRole('heading', { name: 'This score link does not work' })).toBeVisible();
});
