import { test, expect } from '@playwright/test';

test.describe('Records page (unauthenticated)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/records.html');
  });

  test('shows filters, summary, and non-reporting note', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Carbon Snapshot (YTD)' })).toBeVisible();
    await expect(page.locator('#filterYear')).toBeVisible();
    await expect(page.locator('#filterCountry')).toBeVisible();
    await expect(page.locator('#filterRegion')).toBeVisible();
    await expect(page.locator('#filterMethod')).toBeVisible();
    await expect(page.getByText('For intuition only (non-reporting metric)')).toBeVisible();
  });

  test('side navigation omits Dashboard and highlights My Records', async ({ page }) => {
    const nav = page.locator('.side-nav');
    await expect(nav.getByRole('link', { name: 'My Records' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Export / Reports' })).toBeVisible();
    await expect(nav.getByRole('link', { name: /Dashboard/i })).toHaveCount(0);
    await expect(nav.getByRole('link', { name: 'My Records' })).toHaveClass(/active/);
  });

  test('shows export control on records list', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Export CSV' })).toBeVisible();
  });

  test('prompts for access when not signed in', async ({ page }) => {
    // The page should indicate records are unavailable without signing in
    await expect(
      page.getByText(/Sign in on the main page to view your records|History unavailable while offline/i)
    ).toBeVisible();
  });
});
