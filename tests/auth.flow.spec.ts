import { test, expect } from '@playwright/test';

const hasCreds = !!process.env.CW_EMAIL && !!process.env.CW_PASSWORD;

test.describe('Auth flow (password)', () => {
  test.skip(!hasCreds, 'Requires CW_EMAIL and CW_PASSWORD');

  test.use({ storageState: undefined }); // start signed out

  test('can sign in and sign out', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => (window as any).supabaseClient);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.locator('#auth-email').fill(process.env.CW_EMAIL!);
    await page.locator('#auth-password').fill(process.env.CW_PASSWORD!);
    await page.locator('#auth-submit').click();
    await page.waitForFunction(async () => {
      const status = document.querySelector('#auth-status')?.textContent?.trim() || '';
      if (/could not sign in|check your email|confirm your account/i.test(status)) return true;
      const client = (window as any).supabaseClient;
      if (!client) return false;
      const { data } = await client.auth.getSession();
      return !!data?.session;
    }, { timeout: 20000 });
    const statusText = (await page.locator('#auth-status').textContent())?.trim() || '';
    if (/could not sign in|check your email|confirm your account/i.test(statusText)) {
      throw new Error(`Auth failed: ${statusText}`);
    }

    // Sign out and expect redirect back to landing
    if (/records\.html/.test(page.url())) {
      await page.locator('#records-signout').click();
    } else {
      await page.locator('#header-signout').click();
    }
    await page.waitForURL(/index\.html|\/$/);
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
  });
});
