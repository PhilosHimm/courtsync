import { expect, test } from '@playwright/test';
import { expectNoSeriousA11yViolations, seeded } from './helpers';

test.describe('a published tournament', () => {
  test('shows the schedule, with teams named as entered', async ({ page }) => {
    const { tournament } = seeded();
    await page.goto(`/e/${tournament}`);
    await expect(page.getByRole('heading', { level: 1, name: 'E2E Open' })).toBeVisible();
    await expect(page.getByRole('table', { name: /Matches, in time order/ })).toBeVisible();
    await expect(page.getByText('Spikers v', { exact: false }).first()).toBeVisible();
    await expectNoSeriousA11yViolations(page);
  });

  test('never puts a full name in the page — rosters are first name and initial', async ({
    page,
  }) => {
    const { tournament } = seeded();
    await page.goto(`/e/${tournament}?tab=teams`);
    await expect(page.getByText('Jordan L., Sam R.')).toBeVisible();
    const html = await page.content();
    expect(html).not.toContain('Jordan Lee');
    expect(html).not.toContain('Sam Rivera');
    expect(html).not.toContain('owner@example.invalid');
  });

  test('shows standings with the reason each team is where it is', async ({ page }) => {
    const { tournament } = seeded();
    await page.goto(`/e/${tournament}?tab=standings`);
    await expect(page.getByRole('table', { name: 'Pool A' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Why here' }).first()).toBeVisible();
    await expect(page.getByText(/Ahead of .* on record/).first()).toBeVisible();
    await expectNoSeriousA11yViolations(page);
  });

  test('shows the bracket one stage at a time, with a list alternative', async ({ page }) => {
    const { tournament } = seeded();
    await page.goto(`/e/${tournament}?tab=bracket`);
    await expect(page.getByRole('link', { name: 'Quarterfinals' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await page.getByRole('link', { name: 'Semifinals' }).click();
    // At least one semifinal side is still to come — whichever quarter the
    // scorekeeper test has not decided yet.
    await expect(page.getByText(/Winner of QF \d/).first()).toBeVisible();
    await page.getByRole('link', { name: 'Show as a list' }).click();
    await expect(page.getByRole('heading', { name: 'Final', level: 3, exact: true })).toBeVisible();
    await expectNoSeriousA11yViolations(page);
  });

  test('switches between the list, the court timeline and one team’s day', async ({ page }) => {
    const { tournament } = seeded();
    await page.goto(`/e/${tournament}?tab=schedule&view=timeline`);
    await expect(page.getByRole('table', { name: /Court timeline/ })).toBeVisible();
    await expectNoSeriousA11yViolations(page);
    await page.goto(`/e/${tournament}?tab=schedule&view=team&team=Spikers`);
    await expect(page.getByRole('heading', { name: 'Spikers' })).toBeVisible();
  });

  test('offers a PDF sheet', async ({ request }) => {
    const { tournament } = seeded();
    const response = await request.get(`/e/${tournament}/sheet.pdf`);
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toBe('application/pdf');
    expect((await response.body()).subarray(0, 5).toString()).toBe('%PDF-');
  });
});

test.describe('a published drop-in', () => {
  test('shows who is going in reduced names and asks a visitor to sign in to join', async ({
    page,
  }) => {
    const { dropin } = seeded();
    await page.goto(`/e/${dropin}`);
    await expect(page.getByText('Jordan L.')).toBeVisible();
    expect(await page.content()).not.toContain('Jordan Lee');
    await expect(page.getByRole('link', { name: 'Sign in to join' })).toBeVisible();
    await expectNoSeriousA11yViolations(page);
  });
});

test('a draft event does not exist to the public', async ({ page }) => {
  const { draft } = seeded();
  const response = await page.goto(`/e/${draft}`);
  expect(response?.status()).toBe(404);
});

test('the index lists published events only', async ({ page }) => {
  await page.goto('/e');
  await expect(page.getByRole('link', { name: 'E2E Open' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'E2E Thursday' })).toBeVisible();
  await expect(page.getByText('E2E Draft')).toHaveCount(0);
  await expectNoSeriousA11yViolations(page);
});
