import { test, expect } from '@playwright/test';

test.describe('Methodology & Disclosures', () => {
  test('contains required sections and market-based disclosure', async ({ page }) => {
    await page.goto('/methodology.html');
    await expect(page.getByRole('heading', { name: 'Scope Covered' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Scope 2 Methodology (Electricity)' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Scope 1 Methodology (Stationary combustion — Natural gas)' })).toBeVisible();
    await expect(page.getByText(/does not verify certificates, contracts, or registry claims/i)).toBeVisible();
  });
});
