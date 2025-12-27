import { test, expect } from '@playwright/test';

const hasCreds = !!process.env.CW_EMAIL && !!process.env.CW_PASSWORD;

test.describe('Auth flow (password)', () => {
  test.skip(!hasCreds, 'Requires CW_EMAIL and CW_PASSWORD');

  test.use({ storageState: undefined }); // start signed out

  test('can sign in and sign out', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.locator('#auth-email').fill(process.env.CW_EMAIL!);
    await page.locator('#auth-password').fill(process.env.CW_PASSWORD!);
    await page.locator('#auth-submit').click();
    await page.waitForURL(/records\.html/);
    await expect(page.locator('#header-signout')).toBeVisible();

    // Sign out and expect redirect back to landing
    await page.locator('#header-signout').click();
    await page.waitForURL(/index\.html|\/$/);
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
  });
});
