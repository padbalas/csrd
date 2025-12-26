import { test, expect } from '@playwright/test';

test.describe('Methodology & Disclosures', () => {
  test('contains required sections and market-based disclosure', async ({ page }) => {
    await page.goto('/methodology.html');
    await expect(page.getByRole('heading', { name: '1. Scope Covered' })).toBeVisible();
    await expect(page.getByRole('heading', { name: '2. Calculation Method' })).toBeVisible();
    await expect(page.getByRole('heading', { name: '3. Emission Factors' })).toBeVisible();
    await expect(page.getByRole('heading', { name: '4. Emission Factor Year & Timing' })).toBeVisible();
    await expect(page.getByRole('heading', { name: '5. Location-Based Scope 2' })).toBeVisible();
    await expect(page.getByRole('heading', { name: '6. Market-Based Scope 2 (RECs / PPAs)' })).toBeVisible();
    await expect(page.getByText(/does not verify certificates, contracts, or registry claims/i)).toBeVisible();
  });
});
