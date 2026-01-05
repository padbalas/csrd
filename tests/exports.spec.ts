import { test, expect } from '@playwright/test';
import fs from 'fs';

test('exports page redirects or requires auth', async ({ page }) => {
  await page.goto('/exports.html');
  await page.waitForURL(/exports\.html|index\.html|\/$/, { timeout: 10000 });
  const exportHeading = page.getByRole('heading', { name: /Export \/ Reports/i });
  const landingHeading = page.getByRole('heading', { name: /CarbonWise/i });
  const headingReady = await Promise.race([
    exportHeading.waitFor({ state: 'attached', timeout: 8000 }).then(() => 'export').catch(() => null),
    landingHeading.waitFor({ state: 'attached', timeout: 8000 }).then(() => 'landing').catch(() => null)
  ]);
  if (!headingReady) {
    const url = page.url();
    if (url.includes('index.html') || url.endsWith('/')) {
      return;
    }
    throw new Error('No visible heading after auth guard.');
  }
  if (headingReady === 'export') {
    await expect(exportHeading).toBeVisible();
    await expect(page.getByRole('link', { name: 'My Records' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Generate PDF/i })).toBeDisabled();
    await expect(page.locator('footer').getByRole('link', { name: /Methodology/i })).toBeVisible();

    // If year options exist, try generating and verify CRLF line endings and disclosure
    const yearOptions = await page.locator('#exportYear option').all();
    if (yearOptions.length > 1) {
      const firstYear = await yearOptions[1].getAttribute('value');
      if (firstYear) {
        await page.locator('#exportYear').selectOption(firstYear);
      }
    }
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: /Generate CSV/i }).click()
    ]);
    const csvPath = await download.path();
    if (csvPath) {
      const content = fs.readFileSync(csvPath, 'utf-8');
      expect(content).toMatch(/\r\n/); // CRLF endings
      expect(content).toMatch(/Disclosure/);
    }
    return;
  }

  await expect(landingHeading).toBeVisible();
});
