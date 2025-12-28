import { test, expect } from '@playwright/test';

test.describe('Global privacy and footer copy', () => {
  test('privacy section reflects account stance and methodology link', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Privacy & trust' })).toBeVisible();
    await expect(page.getByText('Calculate without an account. Log in only to save or export.', { exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'methodology' })).toHaveAttribute('href', 'methodology.html');
  });

  test('footer states GHG alignment and contact', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('footer')).toContainText(/Aligned with the GHG Protocol \(Scope 2, location-based\)/i);
    await expect(page.getByRole('link', { name: /Contact \/ feedback/i })).toBeVisible();
  });

  test('basic responsive sanity at mobile width', async ({ browser }) => {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /Carbon reporting/i }).first()).toBeVisible();
    await page.close();
  });

  test('app page footer includes methodology link (exports)', async ({ page }) => {
    await page.goto('/exports.html');
    await expect(page.getByText(/Methodology:/i)).toBeVisible();
    await expect(page.getByRole('link', { name: /Methodology/i })).toHaveAttribute('href', 'methodology.html');
  });

  test('records filters remain visible after scroll (desktop)', async ({ browser }) => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await page.goto('/records.html');
    const filters = page.locator('.records-filters');
    await expect(filters).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await expect(filters).toBeVisible();
    await page.close();
  });

  test('records filters visible on mobile width', async ({ browser }) => {
    const page = await browser.newPage({ viewport: { width: 414, height: 896 } });
    await page.goto('/records.html');
    await expect(page.locator('.records-filters')).toBeVisible();
    await page.close();
  });
});
