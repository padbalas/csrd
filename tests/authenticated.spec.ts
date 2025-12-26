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
});
