import { test, expect } from '@playwright/test';

const mobileViewport = { width: 390, height: 844 };

const pages = [
  { path: '/', heading: /Carbon reporting/i },
  { path: '/records.html', heading: /My Records/i },
  { path: '/exports.html', heading: /Export \/ Reports/i },
  { path: '/methodology.html', heading: /Methodology/i },
];

test.describe('Mobile viewport smoke checks', () => {
  for (const { path, heading } of pages) {
    test(`renders ${path} on mobile`, async ({ browser }) => {
      const page = await browser.newPage({ viewport: mobileViewport });
      await page.goto(path);
      let redirectedToLanding = false;
      try {
        await page.waitForURL(/\/(index\.html)?$/, { timeout: 5000 });
        redirectedToLanding = true;
      } catch {}

      if (redirectedToLanding) {
        await expect(page.getByRole('heading', { name: /Carbon reporting/i })).toBeVisible();
      } else {
        await expect(page.getByRole('heading', { name: heading })).toBeVisible();
      }
      await page.close();
    });
  }
});
