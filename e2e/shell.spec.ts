import { expect, test } from '@playwright/test';
import { expectNoSeriousA11yViolations } from './helpers';

test('the landing page and the three area pages are accessible', async ({ page }) => {
  for (const path of ['/', '/tournaments', '/leagues', '/dropins']) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expectNoSeriousA11yViolations(page);
  }
});

test('the demo still runs the engine in the browser', async ({ page }) => {
  await page.goto('/demo/tournament');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expectNoSeriousA11yViolations(page);
});

test('signing in is a labelled form, and the organizer pages ask for it', async ({ page }) => {
  await page.goto('/events');
  await expect(page).toHaveURL(/\/sign-in\?next=%2Fevents/);
  await expect(page.getByLabel('Email')).toBeVisible();
  await expect(page.getByLabel('Password')).toBeVisible();
  await expectNoSeriousA11yViolations(page);
});

test('an unsubscribe link does nothing until the button is pressed', async ({ page }) => {
  await page.goto('/unsubscribe/unknown-token-value-000');
  await expect(page.getByRole('heading', { name: 'Stop CourtSync messages?' })).toBeVisible();
  await page.getByRole('button', { name: 'Unsubscribe' }).click();
  await expect(
    page.getByRole('heading', { name: 'This link has already been used' }),
  ).toBeVisible();
});

test('the skip link moves focus to the main content @desktop-only', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to main content' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#main')).toBeFocused();
});
