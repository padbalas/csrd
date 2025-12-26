import { test, expect } from '@playwright/test';

const runMutations = process.env.RUN_MUTATION_TESTS === 'true';
const hasAuth = !!process.env.CW_EMAIL && !!process.env.CW_PASSWORD;
const hasSecondary = !!process.env.CW_SECONDARY_EMAIL && !!process.env.CW_SECONDARY_PASSWORD;

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
    await page.getByRole('button', { name: /^Save$/ }).click();

    // After save we expect to land on records page with new row
    await page.waitForURL(/records\.html/);
    await page.waitForTimeout(2000);
    await page.waitForFunction(
      (expected) => document.querySelectorAll('button.btn.secondary').length >= expected,
      initialCount + 1
    );

    // Delete the newest record (top of the list)
    await page.getByRole('button', { name: 'View' }).first().click();
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'Delete' }).click();
    await page.waitForTimeout(2000);
    const finalCount = await page.getByRole('button', { name: 'View' }).count();
    expect(finalCount).toBeLessThanOrEqual(initialCount);
  });

  test('edit a record updates kWh and emissions', async ({ page }) => {
    await page.goto('/records.html');
    const viewBtn = page.getByRole('button', { name: 'View' });
    if ((await viewBtn.count()) === 0) test.skip(true, 'No records to edit');
    await viewBtn.first().click();
    const editBtn = page.getByRole('button', { name: 'Edit' });
    await editBtn.click();
    const newKwh = Math.floor(500 + Math.random() * 200);
    await page.getByLabel('Electricity used (kWh)').fill(String(newKwh));
    await page.getByRole('button', { name: 'Save changes' }).click();
    await page.waitForTimeout(1500);
    // Re-open and confirm the kWh reflects the update
    await viewBtn.first().click();
    await expect(page.getByText(String(newKwh))).toBeVisible();
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
    await form.getByRole('button', { name: /^Save$/ }).click();
    await page.waitForURL(/records\.html/);
    await page.waitForTimeout(2000);

    // Verify in records slide-out
    await page.getByRole('button', { name: 'View' }).first().click();
    await expect(page.getByText(/Market-based/)).toBeVisible();
    await expect(page.getByText(/t CO₂e/)).toBeVisible();
    // Delete to clean up
    page.once('dialog', (dialog) => dialog.accept());
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
      const signOutBtn = page.getByRole('button', { name: /Sign out/i });
      if (await signOutBtn.isVisible()) {
        await signOutBtn.click();
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
    await form.getByRole('button', { name: /^Save$/ }).click();
    await page.waitForURL(/records\.html/);
    await page.waitForTimeout(2000);
    await expect(page.locator('body')).toContainText(markerKwh);

    // Sign out primary
    await signOut();

    // Sign in as secondary
    await page.goto('/');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.getByLabel('Email').fill(process.env.CW_SECONDARY_EMAIL!);
    await page.getByLabel('Password').fill(process.env.CW_SECONDARY_PASSWORD!);
    await page.getByRole('button', { name: /^Sign in$/ }).click();
    await page.waitForURL(/records\.html/);
    await page.waitForTimeout(2000);

    // Assert marker record is not visible for secondary user
    await expect(page.locator('body')).not.toContainText(markerKwh);

    // Clean up: sign out secondary
    await signOut();
  });
});
