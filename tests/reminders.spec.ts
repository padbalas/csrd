import { test, expect } from '@playwright/test';

test.describe('Reminders with local fixtures', () => {
  test('missing month and high-share region reminders render from local data', async ({ page }) => {
    const year = new Date().getFullYear();
    const fixture = [
      {
        id: 'r1',
        period_year: year,
        period_month: 1,
        location_based_emissions: 5,
        calc_country: 'US',
        calc_region: 'CA'
      },
      {
        id: 'r2',
        period_year: year,
        period_month: 3,
        location_based_emissions: 1,
        calc_country: 'US',
        calc_region: 'NY'
      }
    ];

    await page.goto('/records.html');
    await page.evaluate((data) => {
      localStorage.setItem('cw_records', JSON.stringify(data));
      if (window.renderRecords) window.renderRecords('recordsTable');
      if (window.renderCarbonReminders) window.renderCarbonReminders();
    }, fixture);

    const reminders = page.locator('#reminderList');
    await expect(reminders).toBeVisible();
    await expect(reminders).toContainText('02/' + year); // missing February
    await expect(reminders).toContainText(/US \/ CA contributes/i);
  });
});
