import { test, expect } from '@playwright/test';

test.describe('Calculator (index)', () => {
  test('shows core inputs and market toggle reveals optional fields', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByLabel('Who are you?')).toBeVisible();
    await expect(page.getByLabel('Country / region')).toBeVisible();
    await expect(page.getByLabel('Billing month')).toBeVisible();
    await expect(page.getByLabel('Billing year')).toBeVisible();
    await expect(page.getByLabel('Electricity used (kWh)')).toBeVisible();
    await expect(page.getByLabel('State / region')).toBeVisible();

    // Market-based fields stay hidden until toggled
    const marketFields = page.locator('#market-fields');
    await expect(marketFields).toBeHidden();
    await page.getByLabel('Include market-based Scope 2 (RECs / PPAs)').check();
    await expect(marketFields).toBeVisible();
    await expect(page.getByLabel('Instrument type')).toBeVisible();
    await expect(page.getByLabel('Covered electricity (kWh)')).toBeVisible();
    await expect(page.getByLabel('Reporting year (market-based)')).toBeVisible();
  });

  test('billing year selector excludes future years', async ({ page }) => {
    await page.goto('/');
    const yearOptions = await page.locator('#year option').allTextContents();
    const currentYear = new Date().getFullYear();
    const futureYear = (currentYear + 1).toString();
    expect(yearOptions).not.toContain(futureYear);
  });
});
