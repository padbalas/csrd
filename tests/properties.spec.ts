import { test, expect } from '@playwright/test';
import fc from 'fast-check';

const shouldRunPbt = process.env.PLAYWRIGHT_PBT === 'true';

test.describe('Calculator properties (PBT)', () => {
  test.skip(!shouldRunPbt, 'PBT suite is opt-in via PLAYWRIGHT_PBT=true');

  const calcForm = (page: any) => page.locator('form#carbon-form');

  const selectBaseFields = async (page: any, year: number, monthIndex: number, kwh: number) => {
    const form = calcForm(page);
    await form.getByLabel('Who are you?').selectOption({ value: 'finance' });
    await form.getByLabel('Country / region', { exact: true }).selectOption({ value: 'US' });
    await form.getByLabel('Billing month').selectOption(form.getByLabel('Billing month').locator('option').nth(monthIndex + 1));
    await form.getByLabel('Billing year').selectOption(String(year));
    await form.getByLabel('Electricity used (kWh)', { exact: true }).fill(kwh.toFixed(2));
    await form.getByLabel('State / region').selectOption({ label: 'California' });
  };

  test('market-based inputs never produce negative emissions and enforce covered <= total', async ({ page }) => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          kwh: fc.float({ min: 1, max: 5000 }),
          covered: fc.float({ min: 0, max: 6000 }),
          monthIndex: fc.integer({ min: 0, max: 11 }),
          year: fc.integer({ min: 2020, max: new Date().getFullYear() })
        }),
        async ({ kwh, covered, monthIndex, year }) => {
          await page.goto('/');
          const form = calcForm(page);
          await selectBaseFields(page, year, monthIndex, kwh);

          await form.getByLabel('Include market-based Scope 2 (RECs / PPAs)').check();
          await form.getByLabel('Instrument type', { exact: true }).selectOption({ value: 'REC' });
          await form.getByLabel('Covered electricity (kWh)').fill(covered.toFixed(2));
          await form.getByLabel('Reporting year (market-based)').selectOption(String(year));

          // Run calculation
          const saveBtn = form.getByRole('button', { name: 'See my emissions in minutes' });
          await saveBtn.click();

          // If covered > total, expect either validation or clamping
          if (covered > kwh) {
            const details = await page.locator('#market-details').textContent();
            if (details) {
              const match = details.match(/Covered kWh: ([\d,]+)/i);
              if (match?.[1]) {
                const reportedCovered = Number(match[1].replace(/,/g, ''));
                expect(reportedCovered).toBeLessThanOrEqual(kwh);
              }
            }
          } else {
            await expect(page.locator('#result-container')).toHaveClass(/active/);
            const locText = await page.locator('#result-tons').textContent();
            const marketText = await page.locator('#result-market').textContent();
            const locVal = Number(locText?.replace(/[^\d.-]/g, '') || 0);
            const mktVal = Number(marketText?.replace(/[^\d.-]/g, '') || 0);
            expect(locVal).toBeGreaterThanOrEqual(0);
            expect(mktVal).toBeGreaterThanOrEqual(0);
          }
        }
      ),
      { numRuns: 5 } // keep modest for CI
    );
  });

  test('market toggle off keeps market result as Not provided', async ({ page }) => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          kwh: fc.float({ min: 1, max: 3000 }),
          monthIndex: fc.integer({ min: 0, max: 11 }),
          year: fc.integer({ min: 2020, max: new Date().getFullYear() })
        }),
        async ({ kwh, monthIndex, year }) => {
          await page.goto('/');
          await selectBaseFields(page, year, monthIndex, kwh);
          await calcForm(page).getByRole('button', { name: 'See my emissions in minutes' }).click();
          await expect(page.locator('#result-container')).toHaveClass(/active/);
          await expect(page.locator('#result-market')).toHaveText(/Not provided/i);
        }
      ),
      { numRuns: 3 }
    );
  });

  test('future months are rejected', async ({ page }) => {
    const currentYear = new Date().getFullYear();
    const currentMonthIndex = new Date().getMonth();
    if (currentMonthIndex === 11) test.skip(true, 'No future month in December');
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: currentMonthIndex + 1, max: 11 }),
        async (futureIndex) => {
          await page.goto('/');
          await selectBaseFields(page, currentYear, futureIndex, 1000);
          // Expect no active result when future month is chosen
          await calcForm(page).getByRole('button', { name: 'See my emissions in minutes' }).click();
          const isActive = await page.locator('#result-container').evaluate((el) => el.classList.contains('active'));
          expect(isActive).toBeFalsy();
        }
      ),
      { numRuns: 2 }
    );
  });

  test('emissions are non-decreasing with higher kWh (same location)', async ({ page }) => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          kwhA: fc.float({ min: 1, max: 2000 }),
          kwhB: fc.float({ min: 2001, max: 4000 }),
          monthIndex: fc.integer({ min: 0, max: 11 }),
          year: fc.integer({ min: 2020, max: new Date().getFullYear() })
        }),
        async ({ kwhA, kwhB, monthIndex, year }) => {
          // First run with lower kWh
          await page.goto('/');
          await selectBaseFields(page, year, monthIndex, kwhA);
          await calcForm(page).getByRole('button', { name: 'See my emissions in minutes' }).click();
          await expect(page.locator('#result-container')).toHaveClass(/active/);
          const locAText = await page.locator('#result-tons').textContent();
          const locA = Number(locAText?.replace(/[^\d.-]/g, '') || 0);

          // Run again with higher kWh
          await page.goto('/');
          await selectBaseFields(page, year, monthIndex, kwhB);
          await calcForm(page).getByRole('button', { name: 'See my emissions in minutes' }).click();
          await expect(page.locator('#result-container')).toHaveClass(/active/);
          const locBText = await page.locator('#result-tons').textContent();
          const locB = Number(locBText?.replace(/[^\d.-]/g, '') || 0);

          expect(locB).toBeGreaterThanOrEqual(locA);
        }
      ),
      { numRuns: 3 }
    );
  });
});
