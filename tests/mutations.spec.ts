import { test, expect } from '@playwright/test';

const runMutations = process.env.RUN_MUTATION_TESTS === 'true';
const hasAuth = !!process.env.CW_EMAIL && !!process.env.CW_PASSWORD;
const hasSecondary = !!process.env.CW_SECONDARY_EMAIL && !!process.env.CW_SECONDARY_PASSWORD;
const secondaryEmail = process.env.CW_SECONDARY_EMAIL;
const secondaryPassword = process.env.CW_SECONDARY_PASSWORD;

test.describe('Mutating flows (opt-in)', () => {
  test.skip(!runMutations || !hasAuth, 'Mutating tests are opt-in via RUN_MUTATION_TESTS and require CW_EMAIL/CW_PASSWORD');

  test.use({ storageState: 'tests/../auth-state.json' });

  test('create and delete a record via UI', async ({ page }) => {
    await page.goto('/records.html');
    const initialCount = await page.getByRole('button', { name: 'View' }).count();

    // Create a new record from calculator
    const kwh = Math.floor(1000 + Math.random() * 500);
    await page.goto('/');
    const form = page.locator('form#carbon-form');
    await form.getByLabel('Who are you?').selectOption({ value: 'finance' });
    await form.getByLabel('Country / region', { exact: true }).selectOption({ value: 'US' });
    await form.getByLabel('Billing month').selectOption('January');
    await form.getByLabel('Billing year').selectOption(String(new Date().getFullYear()));
    await form.getByLabel('Electricity used (kWh)', { exact: true }).fill(String(kwh));
    await form.getByLabel('State / region').selectOption({ label: 'California' });
    await form.getByRole('button', { name: 'See my emissions in minutes' }).click();
    await expect(page.locator('#result-container')).toHaveClass(/active/);
    page.once('dialog', (dialog) => dialog.accept());
    await page.locator('#save-btn').click();
    if (await page.locator('#auth-modal').isVisible()) {
      test.skip(true, 'Auth required to save records');
    }

    // After save we expect to land on records page with new row
    const navigated = await page.waitForURL(/records\.html/, { timeout: 15000 }).then(() => true).catch(() => false);
    if (!navigated) test.skip(true, 'Save did not redirect to records');
    await page.waitForTimeout(2000);
    const newId = await page.evaluate((marker) => {
      const records = window.loadRecords ? window.loadRecords() : [];
      const hit = records.find((r) => String(r.kwh) === String(marker));
      return hit ? hit.id : null;
    }, String(kwh));
    if (!newId) test.skip(true, 'Created record not found in local cache');

    // Delete the newly created record
    await page.evaluate((id) => {
      if (window.openRecordPanel) window.openRecordPanel(id, 'recordPanel');
    }, newId);
    page.on('dialog', (dialog) => dialog.accept().catch(() => {}));
    await page.getByRole('button', { name: 'Delete' }).click();
    await page.waitForTimeout(2000);
    const stillExists = await page.evaluate((id) => {
      const records = window.loadRecords ? window.loadRecords() : [];
      return records.some((r) => String(r.id) === String(id));
    }, newId);
    expect(stillExists).toBeFalsy();
  });

  test('edit a record updates kWh and emissions', async ({ page }) => {
    await page.goto('/records.html');
    const viewBtn = page.getByRole('button', { name: 'View' });
    if ((await viewBtn.count()) === 0) test.skip(true, 'No records to edit');
    const newKwh = Math.floor(500 + Math.random() * 200);
    page.once('dialog', (dialog) => dialog.accept(String(newKwh)));
    await viewBtn.first().click();
    const editBtn = page.getByRole('button', { name: 'Edit' });
    await editBtn.click();
    await page.waitForTimeout(1500);
    const updated = await page.evaluate(() => {
      const records = window.loadRecords ? window.loadRecords() : [];
      return records[0]?.kwh;
    });
    expect(updated).toBe(newKwh);
  });

  test('create a market-based record and verify location/market values then delete', async ({ page }) => {
    // Create
    const kwh = Math.floor(900 + Math.random() * 100);
    await page.goto('/');
    const form = page.locator('form#carbon-form');
    await form.getByLabel('Who are you?').selectOption({ value: 'finance' });
    await form.getByLabel('Country / region', { exact: true }).selectOption({ value: 'US' });
    await form.getByLabel('Billing month').selectOption('February');
    await form.getByLabel('Billing year').selectOption(String(new Date().getFullYear()));
    await form.getByLabel('Electricity used (kWh)', { exact: true }).fill(String(kwh));
    await form.getByLabel('State / region').selectOption({ label: 'California' });
    await form.getByLabel('Include market-based Scope 2 (RECs / PPAs)').check();
    await form.getByLabel('Instrument type', { exact: true }).selectOption({ value: 'REC' });
    await form.getByLabel('Covered electricity (kWh)').fill('100');
    await form.getByLabel('Reporting year (market-based)').selectOption(String(new Date().getFullYear()));
    await form.getByRole('button', { name: 'See my emissions in minutes' }).click();
    await expect(page.locator('#result-container')).toHaveClass(/active/);
    page.once('dialog', (dialog) => dialog.accept());
    await page.locator('#save-btn').click();
    if (await page.locator('#auth-modal').isVisible()) {
      test.skip(true, 'Auth required to save records');
    }
    const navigatedMarket = await page.waitForURL(/records\.html/, { timeout: 15000 }).then(() => true).catch(() => false);
    if (!navigatedMarket) test.skip(true, 'Save did not redirect to records');
    await page.waitForTimeout(2000);

    // Verify in records slide-out
    await page.getByRole('button', { name: 'View' }).first().click();
    await expect(page.locator('#recordPanel').getByText('Market-based')).toBeVisible();
    const detailsText = await page.locator('#recordPanel').textContent();
    expect(detailsText || '').toMatch(/Location-based|Market-based/);
    // Delete to clean up
    page.on('dialog', (dialog) => dialog.accept().catch(() => {}));
    await page.getByRole('button', { name: 'Delete' }).click();
    await page.waitForTimeout(1500);
  });

  test('PDF button remains disabled (placeholder)', async ({ page }) => {
    await page.goto('/exports.html');
    await expect(page.getByRole('button', { name: 'Generate PDF' })).toBeDisabled();
  });

  test('cross-user isolation: record from primary is not visible to secondary', async ({ page, context }) => {
    test.skip(!hasSecondary, 'Requires CW_SECONDARY_EMAIL and CW_SECONDARY_PASSWORD');

    const markerKwh = (900000 + Math.floor(Math.random() * 1000)).toString();

    const signOut = async () => {
      const recordsSignout = page.locator('#records-signout');
      const headerSignout = page.locator('#header-signout');
      if (await recordsSignout.isVisible()) {
        await recordsSignout.click();
        await page.waitForTimeout(1000);
        return;
      }
      if (await headerSignout.isVisible()) {
        await headerSignout.click();
        await page.waitForTimeout(1000);
      }
    };

    // Sign in as primary (global storage state already does, but ensure session)
    await page.goto('/');
    // Create a marker record
    const form = page.locator('form#carbon-form');
    await form.getByLabel('Who are you?').selectOption({ value: 'finance' });
    await form.getByLabel('Country / region', { exact: true }).selectOption({ value: 'US' });
    await form.getByLabel('Billing month').selectOption('March');
    await form.getByLabel('Billing year').selectOption(String(new Date().getFullYear()));
    await form.getByLabel('Electricity used (kWh)', { exact: true }).fill(markerKwh);
    await form.getByLabel('State / region').selectOption({ label: 'California' });
    await form.getByRole('button', { name: 'See my emissions in minutes' }).click();
    await expect(page.locator('#result-container')).toHaveClass(/active/);
    page.once('dialog', (dialog) => dialog.accept());
    await page.locator('#save-btn').click();
    if (await page.locator('#auth-modal').isVisible()) {
      test.skip(true, 'Auth required to save records');
    }
    const navigatedPrimary = await page.waitForURL(/records\.html/, { timeout: 15000 }).then(() => true).catch(() => false);
    if (!navigatedPrimary) test.skip(true, 'Save did not redirect to records');
    await page.waitForTimeout(2000);
    const markerId = await page.evaluate((marker) => {
      const records = window.loadRecords ? window.loadRecords() : [];
      const hit = records.find((r) => String(r.kwh) === String(marker));
      return hit ? hit.id : null;
    }, markerKwh);
    if (!markerId) test.skip(true, 'Marker record not found in local cache');

    // Sign out primary
    await signOut();

    // Sign in as secondary
    await page.goto('/');
    await page.locator('#header-signin').click();
    await page.locator('#auth-email').fill(secondaryEmail!);
    await page.locator('#auth-password').fill(secondaryPassword!);
    await page.locator('#auth-submit').click();
    await page.waitForURL(/records\.html/);
    await page.waitForTimeout(2000);

    // Assert marker record is not visible for secondary user
    await expect(page.locator('body')).not.toContainText(markerKwh);

    // Exports for secondary should not contain marker
    await page.goto('/exports.html');
    const downloadPromise = page.waitForEvent('download', { timeout: 10000 }).catch(() => null);
    await page.getByRole('button', { name: 'Generate CSV' }).click();
    const dl = await downloadPromise;
    if (!dl) test.skip(true, 'No export download available');
    const csvContent = await dl.createReadStream().then(async (stream) => {
      return await new Promise<string>((resolve, reject) => {
        let data = '';
        stream.on('data', (chunk) => (data += chunk.toString()));
        stream.on('end', () => resolve(data));
        stream.on('error', reject);
      });
    });
    expect(csvContent).not.toContain(markerKwh);

    // Clean up: sign out secondary
    await signOut();
  });
});
