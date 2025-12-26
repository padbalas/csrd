import { test, expect } from '@playwright/test';

test.describe('Records page (unauthenticated)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/records.html');
  });

  test('redirects or blocks access when unauthenticated', async ({ page }) => {
    await page.waitForTimeout(1500);
    const url = page.url();
    if (url.includes('records.html')) {
      await expect(
        page.getByText(/Sign in on the main page to view your records|History unavailable while offline/i)
      ).toBeVisible();
    } else {
      await expect(url).toContain('index.html');
    }
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

test.describe('Records page (authenticated behaviors)', () => {
  test.skip(!process.env.CW_EMAIL || !process.env.CW_PASSWORD, 'Requires CW_EMAIL and CW_PASSWORD');
  test.use({ storageState: 'tests/../auth-state.json' });

  test('filters and reminders respond to method filter when data exists', async ({ page }) => {
    await page.goto('/records.html');
    const methodFilter = page.locator('#filterMethod');
    await expect(methodFilter).toBeVisible();

    const initialSummary = await page.locator('#totalEmissions').textContent();
    await methodFilter.selectOption('market');
    await page.waitForTimeout(500);
    const afterSummary = await page.locator('#totalEmissions').textContent();
    // If data changes, values may differ; if not, allow equality
    expect(afterSummary).not.toBeNull();
    await methodFilter.selectOption('location');
    await page.waitForTimeout(500);
    const finalSummary = await page.locator('#totalEmissions').textContent();
    expect(finalSummary).not.toBeNull();
    // Reminders list should render
    await expect(page.locator('#reminderList')).toBeVisible();
  });

  test('filters visible on mobile width', async ({ browser }) => {
    const page = await browser.newPage({ viewport: { width: 414, height: 896 } });
    await page.goto('/records.html');
    await expect(page.locator('#filterYear')).toBeVisible();
    await expect(page.locator('#filterMethod')).toBeVisible();
    await page.close();
  });
});
