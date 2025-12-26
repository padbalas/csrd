import { test, expect } from '@playwright/test';
import fc from 'fast-check';

const shouldRunPbt = process.env.PLAYWRIGHT_PBT === 'true';

test.describe('Calculator properties (PBT)', () => {
  test.skip(!shouldRunPbt, 'PBT suite is opt-in via PLAYWRIGHT_PBT=true');

  const calcForm = (page: any) => page.locator('form#carbon-form');

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
          await form.getByLabel('Who are you?').selectOption({ value: 'finance' });
          await form.getByLabel('Country / region', { exact: true }).selectOption({ value: 'US' });
          await form.getByLabel('Billing month').selectOption(form.getByLabel('Billing month').locator('option').nth(monthIndex + 1));
          await form.getByLabel('Billing year').selectOption(String(year));
          await form.getByLabel('Electricity used (kWh)', { exact: true }).fill(kwh.toFixed(2));
          await form.getByLabel('State / region').selectOption({ label: 'California' });

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
});
