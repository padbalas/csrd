import { test, expect } from '@playwright/test';

const hasCreds = !!process.env.CW_EMAIL && !!process.env.CW_PASSWORD;

test.describe('Auth flow (password)', () => {
  test.skip(!hasCreds, 'Requires CW_EMAIL and CW_PASSWORD');

  test.use({ storageState: undefined }); // start signed out

  test('can sign in and sign out', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.getByLabel('Email').fill(process.env.CW_EMAIL!);
    await page.getByLabel('Password').fill(process.env.CW_PASSWORD!);
    await page.getByRole('button', { name: /^Sign in$/ }).click();
    await page.waitForURL(/records\.html/);
    await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();

    // Sign out and expect redirect back to landing
    await page.getByRole('button', { name: 'Sign out' }).click();
    await page.waitForURL(/index\.html|\/$/);
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
  });
});
