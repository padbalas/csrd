import { test, expect } from '@playwright/test';

test.describe('Calculator (index)', () => {
  const fillBaseForm = async (page: any, opts: { kwh: number; month?: string; year?: number }) => {
    const currentYear = new Date().getFullYear();
    await page.goto('/');
    await page.getByLabel('Who are you?').selectOption({ value: 'finance' });
    await page.getByLabel('Country / region').selectOption({ value: 'US' });
    await page.getByLabel('Billing month').selectOption(opts.month || 'January');
    await page.getByLabel('Billing year').selectOption(String(opts.year || currentYear));
    await page.getByLabel('Electricity used (kWh)').fill(String(opts.kwh));
    await page.getByLabel('State / region').selectOption({ label: 'California' });
  };

  test('shows core inputs and market toggle reveals optional fields', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByLabel('Who are you?')).toBeVisible();
    await expect(page.getByLabel('Country / region', { exact: true })).toBeVisible();
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

  test('blocks future months within current year', async ({ page }) => {
    const currentMonth = new Date().getMonth(); // 0-based
    if (currentMonth === 11) test.skip(true, 'No future month in December');
    await page.goto('/');
    await page.getByLabel('Billing year').selectOption(String(new Date().getFullYear()));
    // Pick a future month name (account for leading placeholder option)
    const futureMonthName = page.getByLabel('Billing month').locator('option').nth(currentMonth + 2);
    const futureMonthValue = await futureMonthName.textContent();
    await page.getByLabel('Billing month').selectOption({ label: futureMonthValue || '' });
    const dialogPromise = page.waitForEvent('dialog');
    await page.getByRole('button', { name: 'See my emissions in minutes' }).click();
    const dialog = await dialogPromise;
    expect(dialog.message()).toMatch(/Future months are not supported/i);
    await dialog.dismiss();
  });

  test('calculates location-based result and keeps market as not provided when toggle is off', async ({ page }) => {
    await fillBaseForm(page, { kwh: 1200 });
    await page.getByRole('button', { name: 'See my emissions in minutes' }).click();
    await expect(page.locator('#result-container')).toHaveClass(/active/);
    await expect(page.locator('#result-tons')).not.toHaveText('—');
    await expect(page.locator('#result-market')).toHaveText(/Not provided/i);
    await expect(page.locator('#calc-details')).toContainText(/t CO₂e\/kWh/i);
  });

  test('market-based validation prevents covered kWh above total', async ({ page }) => {
    await fillBaseForm(page, { kwh: 1000 });
    await page.getByLabel('Include market-based Scope 2 (RECs / PPAs)').check();
    await page.getByLabel('Instrument type').selectOption({ value: 'REC' });
    await page.getByLabel('Covered electricity (kWh)').fill('1500'); // exceeds total
    await page.getByLabel('Reporting year (market-based)').selectOption(String(new Date().getFullYear()));
    const dialogPromise = page.waitForEvent('dialog');
    await page.getByRole('button', { name: 'See my emissions in minutes' }).click();
    const dialog = await dialogPromise;
    expect(dialog.message()).toMatch(/cannot exceed total electricity used/i);
    await dialog.dismiss();
  });

  test('market-based calculation shows market result and disclaimer', async ({ page }) => {
    await fillBaseForm(page, { kwh: 1000 });
    await page.getByLabel('Include market-based Scope 2 (RECs / PPAs)').check();
    await page.getByLabel('Instrument type').selectOption({ value: 'REC' });
    await page.getByLabel('Covered electricity (kWh)').fill('200');
    await page.getByLabel('Reporting year (market-based)').selectOption(String(new Date().getFullYear()));
    await page.getByRole('button', { name: 'See my emissions in minutes' }).click();
    await expect(page.locator('#result-container')).toHaveClass(/active/);
    await expect(page.locator('#result-market')).not.toHaveText(/Not provided/i);
    await expect(page.locator('#market-disclaimer')).toBeVisible();
  });

  test('requires kWh > 0 and shows factor sentence/comparison', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('Who are you?').selectOption({ value: 'finance' });
    await page.getByLabel('Country / region').selectOption({ value: 'US' });
    await page.getByLabel('Billing month').selectOption('January');
    await page.getByLabel('Billing year').selectOption(String(new Date().getFullYear()));
    await page.getByLabel('Electricity used (kWh)').fill('0');
    await page.getByLabel('State / region').selectOption({ label: 'California' });
    const dialogPromise = page.waitForEvent('dialog');
    await page.getByRole('button', { name: 'See my emissions in minutes' }).click();
    const dialog = await dialogPromise;
    expect(dialog.message()).toMatch(/complete all fields/i);
    await dialog.dismiss();

    // Now use valid kWh and expect factor sentence and comparison populated
    await page.getByLabel('Electricity used (kWh)').fill('500');
    await page.getByRole('button', { name: 'See my emissions in minutes' }).click();
    await expect(page.locator('#result-container')).toHaveClass(/active/);
    await expect(page.locator('#result-compare')).not.toHaveText('—');
    await expect(page.locator('#calc-details')).toContainText(/emission factors/i);
  });

  test('location and market values render together when market is enabled', async ({ page }) => {
    await fillBaseForm(page, { kwh: 750 });
    await page.getByLabel('Include market-based Scope 2 (RECs / PPAs)').check();
    await page.getByLabel('Instrument type').selectOption({ value: 'REC' });
    await page.getByLabel('Covered electricity (kWh)').fill('100');
    await page.getByLabel('Reporting year (market-based)').selectOption(String(new Date().getFullYear()));
    await page.getByRole('button', { name: 'See my emissions in minutes' }).click();
    await expect(page.locator('#result-container')).toHaveClass(/active/);
    await expect(page.locator('#result-tons')).not.toHaveText('—');
    await expect(page.locator('#result-market')).not.toHaveText('—');
  });

  test('save triggers auth prompt when not signed in', async ({ page }) => {
    await fillBaseForm(page, { kwh: 800 });
    await page.getByRole('button', { name: 'See my emissions in minutes' }).click();
    await expect(page.locator('#result-container')).toHaveClass(/active/);
    await page.getByRole('button', { name: /^Save$/ }).click();
    await expect(page.locator('#auth-modal')).toHaveClass(/active/);
  });
});
