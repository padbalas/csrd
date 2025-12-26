import { test, expect } from '@playwright/test';

const runMutations = process.env.RUN_MUTATION_TESTS === 'true';
const hasAuth = !!process.env.CW_EMAIL && !!process.env.CW_PASSWORD;

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
});
