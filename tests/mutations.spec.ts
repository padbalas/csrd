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

  test('PDF button remains disabled (placeholder)', async ({ page }) => {
    await page.goto('/exports.html');
    await expect(page.getByRole('button', { name: 'Generate PDF' })).toBeDisabled();
  });
});
