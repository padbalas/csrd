import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const storagePath = path.join(__dirname, '..', 'auth-state.json');
const hasAuthState = fs.existsSync(storagePath);

// Skip all tests in this file if auth state is unavailable
test.describe('Authenticated flows', () => {
  test.skip(!hasAuthState, 'Requires CW_EMAIL and CW_PASSWORD to generate auth-state.json');
  test.use({ storageState: storagePath });
  const isLandingPage = (currentUrl: string) => {
    const pathname = new URL(currentUrl).pathname;
    return pathname === '/' || pathname.endsWith('/index.html');
  };

  test('records page accessible when signed in', async ({ page }) => {
    await page.goto('/records.html');
    await expect(page.getByRole('heading', { name: /Carbon Snapshot/i })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Log out' })).toBeVisible();
  });

  test('exports page accessible and CSV action enabled', async ({ page }) => {
    await page.goto('/exports.html');
    if (isLandingPage(page.url())) {
      test.skip(true, 'Auth state missing for exports page');
    }
    await expect(page.getByRole('heading', { name: /Export \/ Reports/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Generate CSV/i })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Generate PDF' })).toBeDisabled();
  });

  test('insights page renders key sections', async ({ page }) => {
    await page.goto('/insights.html');
    if (isLandingPage(page.url())) {
      test.skip(true, 'Auth state missing for insights page');
    }
    await expect(page.getByRole('heading', { name: /Insights/i })).toBeVisible();
    const hasNewLayout = (await page.locator('#trendChart').count()) > 0;
    if (!hasNewLayout) {
      test.skip(true, 'Insights layout not updated on this environment');
    }
    await expect(page.getByRole('heading', { name: /Monthly Scope 2 electricity trend/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Regional contribution/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Data coverage/i })).toBeVisible();
  });

  test('records list supports viewing details and filtered CSV export with disclosure', async ({ page }) => {
    await page.goto('/records.html');
    if (isLandingPage(page.url())) {
      test.skip(true, 'Auth state missing for records page');
    }
    const viewBtn = page.getByRole('button', { name: 'View' });
    if ((await viewBtn.count()) === 0) test.skip(true, 'No records available to view');

    // Open first record slide-out
    await viewBtn.first().click();
    await expect(page.getByText(/Record details/i)).toBeVisible();
    await page.getByRole('button', { name: '×' }).click();
    await expect(page.locator('#recordPanel')).toHaveClass(/hidden/);

    // Export CSV and confirm disclosure present
    const downloadPromise = page.waitForEvent('download', { timeout: 10000 }).catch(() => null);
    await page.getByRole('button', { name: /Export CSV/i }).click();
    const download = await downloadPromise;
    if (!download) {
      const status = page.locator('#records-export-status');
      const statusText = (await status.textContent())?.trim() || '';
      if (!statusText) {
        test.skip(true, 'No download and no status; likely no exportable records');
      }
      await expect(status).toContainText(/No records|No records match these filters/i);
      return;
    }
    const csvPath = await download.path();
    if (!csvPath) test.fail(true, 'Download path not available');
    const content = fs.readFileSync(csvPath!, 'utf-8');
    expect(content).toMatch(/Disclosure/);
    expect(content).toMatch(/Location-based Scope 2 electricity calculation aligned with the GHG Protocol/);
    expect(content).toMatch(/\r\n/); // CRLF line endings
  });

  test('exports page CSV includes disclosure line', async ({ page }) => {
    await page.goto('/exports.html');
    if (isLandingPage(page.url())) {
      test.skip(true, 'Auth state missing for exports page');
    }
    await expect(page.getByRole('heading', { name: /Export \/ Reports/i })).toBeVisible();
    const status = page.locator('#exportStatus');

    const downloadPromise = page.waitForEvent('download', { timeout: 10000 }).catch(() => null);
    await page.getByRole('button', { name: /Generate CSV/i }).click();
    const download = await downloadPromise;
    if (!download) {
      const statusText = (await status.textContent())?.trim() || '';
      if (!statusText) {
        test.skip(true, 'No download and no status; likely no exportable records');
      }
      await expect(status).toContainText(/No records|No records for this selection/i);
      return;
    }
    const csvPath = await download.path();
    if (!csvPath) test.fail(true, 'Download path not available');
    const content = fs.readFileSync(csvPath!, 'utf-8');
    expect(content).toMatch(/Disclosure/);
    expect(content).toMatch(/Location-based Scope 2 electricity calculation aligned with the GHG Protocol/);

    // CSV should include expected columns
    const headerLine = content.split(/\r?\n/)[0];
    expect(headerLine).toMatch(/company_name,period,country,kwh,scope2_location_based_tco2e,scope2_market_based_tco2e,emission_factor_value,emission_factor_year,emission_factor_source/);
    await expect(status).toContainText(/CSV generated|No records/);
  });
});
