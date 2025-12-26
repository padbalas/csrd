import { test, expect } from '@playwright/test';

test.describe('Global privacy and footer copy', () => {
  test('privacy section reflects account stance and methodology link', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Privacy & trust' })).toBeVisible();
    await expect(page.getByText(/Calculate without an account\. Sign in only to save or export/i)).toBeVisible();
    await expect(page.getByRole('link', { name: 'methodology' })).toHaveAttribute('href', 'methodology.html');
  });

  test('footer states GHG alignment and contact', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('footer')).toContainText(/Aligned with the GHG Protocol \(Scope 2, location-based\)/i);
    await expect(page.getByRole('link', { name: /Contact \/ feedback/i })).toBeVisible();
  });
});
