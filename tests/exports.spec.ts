import { test, expect } from '@playwright/test';

test('exports page redirects or requires auth', async ({ page }) => {
  await page.goto('/exports.html');
  // Allow time for client-side auth guard to run
  await page.waitForTimeout(2000);
  const currentUrl = page.url();

  if (currentUrl.includes('exports.html')) {
    await expect(page.getByRole('heading', { name: 'Export / Reports' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'My Records' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Generate PDF' })).toBeDisabled();
    await expect(page.getByText(/Methodology:/i)).toBeVisible();
  } else {
    await expect(currentUrl).toContain('index.html');
  }
});
