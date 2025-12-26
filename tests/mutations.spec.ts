import { test, expect } from '@playwright/test';

const runMutations = process.env.RUN_MUTATION_TESTS === 'true';
const hasAuth = !!process.env.CW_EMAIL && !!process.env.CW_PASSWORD;

test.describe('Mutating flows (opt-in)', () => {
  test.skip(!runMutations || !hasAuth, 'Mutating tests are opt-in via RUN_MUTATION_TESTS and require CW_EMAIL/CW_PASSWORD');

  test.use({ storageState: 'tests/../auth-state.json' });

  test('PDF button remains disabled (placeholder)', async ({ page }) => {
    await page.goto('/exports.html');
    await expect(page.getByRole('button', { name: 'Generate PDF' })).toBeDisabled();
  });
});
