import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const storagePath = path.join(__dirname, '..', 'auth-state.json');
const hasAuthState = fs.existsSync(storagePath);

// Skip all tests in this file if auth state is unavailable
test.describe('Authenticated flows', () => {
  test.skip(!hasAuthState, 'Requires CW_EMAIL and CW_PASSWORD to generate auth-state.json');
  test.use({ storageState: storagePath });

  test('records page accessible when signed in', async ({ page }) => {
    await page.goto('/records.html');
    await expect(page.getByRole('heading', { name: 'Carbon Snapshot (YTD)' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
  });

  test('exports page accessible and CSV action enabled', async ({ page }) => {
    await page.goto('/exports.html');
    await expect(page.getByRole('heading', { name: 'Export / Reports' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Generate CSV' })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Generate PDF' })).toBeDisabled();
  });

  test('records list supports viewing details and filtered CSV export with disclosure', async ({ page }) => {
    await page.goto('/records.html');
    const viewBtn = page.getByRole('button', { name: 'View' });
    if ((await viewBtn.count()) === 0) test.skip(true, 'No records available to view');

    // Open first record slide-out
    await viewBtn.first().click();
    await expect(page.getByText(/Record details/i)).toBeVisible();

    // Export CSV and confirm disclosure present
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Export CSV' }).click()
    ]);
    const csvPath = await download.path();
    if (!csvPath) test.fail(true, 'Download path not available');
    const content = fs.readFileSync(csvPath!, 'utf-8');
    expect(content).toMatch(/Disclosure/);
    expect(content).toMatch(/Location-based Scope 2 calculation aligned with the GHG Protocol/);
  });

  test('exports page CSV includes disclosure line', async ({ page }) => {
    await page.goto('/exports.html');
    await expect(page.getByRole('heading', { name: 'Export / Reports' })).toBeVisible();
    const status = page.locator('#exportStatus');

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Generate CSV' }).click()
    ]);
    const csvPath = await download.path();
    if (!csvPath) test.fail(true, 'Download path not available');
    const content = fs.readFileSync(csvPath!, 'utf-8');
    expect(content).toMatch(/Disclosure/);
    expect(content).toMatch(/Location-based Scope 2 calculation aligned with the GHG Protocol/);

    // CSV should include expected columns
    const headerLine = content.split(/\r?\n/)[0];
    expect(headerLine).toMatch(/company_name,period,country,kwh,scope2_location_based_tco2e,scope2_market_based_tco2e,emission_factor_value,emission_factor_year,emission_factor_source/);
    await expect(status).toContainText(/CSV generated|No records/);
  });
});
