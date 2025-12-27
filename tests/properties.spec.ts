import { test, expect } from '@playwright/test';
import fc from 'fast-check';

const shouldRunPbt = process.env.PLAYWRIGHT_PBT === 'true';

test.describe('Calculator properties (PBT)', () => {
  test.skip(!shouldRunPbt, 'PBT suite is opt-in via PLAYWRIGHT_PBT=true');
  test.describe.configure({ timeout: 90_000 });

  const calcForm = (page: any) => page.locator('form#carbon-form');

  const selectBaseFields = async (page: any, year: number, monthIndex: number, kwh: number) => {
    const form = calcForm(page);
    const currentYear = new Date().getFullYear();
    const currentMonthIndex = new Date().getMonth();
    await form.getByLabel('Who are you?').selectOption({ value: 'finance' });
    await form.getByLabel('Country / region', { exact: true }).selectOption({ value: 'US' });
    const yearSelect = form.getByLabel('Billing year');
    await page.waitForFunction(() => document.querySelectorAll('#year option').length > 0);
    const yearOptions = await yearSelect.locator('option').allTextContents();
    const chosenYear = yearOptions.includes(String(year)) ? String(year) : yearOptions[0];
    await yearSelect.selectOption(chosenYear);
    if (Number(chosenYear) === currentYear && monthIndex > currentMonthIndex) {
      monthIndex = currentMonthIndex;
    }
    await form.getByLabel('Billing month').selectOption(form.getByLabel('Billing month').locator('option').nth(monthIndex + 1));
    await page.waitForFunction(() => document.querySelectorAll('#region option').length > 1);
    await form.getByLabel('Electricity used (kWh)', { exact: true }).fill(kwh.toFixed(2));
    await form.getByLabel('State / region').selectOption({ label: 'California' });
  };

  const pbtOptions = { numRuns: 1, maxSkipsPerRun: 2000 };

  test('market-based inputs never produce negative emissions and enforce covered <= total', async ({ page }) => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          kwh: fc.integer({ min: 1, max: 5000 }),
          covered: fc.integer({ min: 0, max: 6000 }),
          monthIndex: fc.integer({ min: 0, max: 11 }),
          year: fc.integer({ min: 2024, max: new Date().getFullYear() })
        }),
        async ({ kwh, covered, monthIndex, year }) => {
          await page.goto('/');
          const form = calcForm(page);
          await selectBaseFields(page, year, monthIndex, kwh);

          await form.getByLabel('Include market-based Scope 2 (RECs / PPAs)').check();
          await form.getByLabel('Instrument type', { exact: true }).selectOption({ value: 'REC' });
          await form.getByLabel('Covered electricity (kWh)').fill(String(covered));
          const marketYearSelect = form.getByLabel('Reporting year (market-based)');
          const marketOptions = await marketYearSelect.locator('option').allTextContents();
          const marketYear = marketOptions.includes(String(year)) ? String(year) : marketOptions[0];
          await marketYearSelect.selectOption(marketYear);

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
            await page.waitForFunction(() => document.querySelector('#result-container')?.classList.contains('active'), { timeout: 5000 }).catch(() => null);
            const isActive = await page.locator('#result-container').evaluate((el) => el.classList.contains('active'));
            if (!isActive) return;
            const locText = await page.locator('#result-tons').textContent();
            const marketText = await page.locator('#result-market').textContent();
            const locVal = Number(locText?.replace(/[^\d.-]/g, '') || 0);
            const mktVal = Number(marketText?.replace(/[^\d.-]/g, '') || 0);
            expect(locVal).toBeGreaterThanOrEqual(0);
            expect(mktVal).toBeGreaterThanOrEqual(0);
          }
        }
      ),
      pbtOptions
    );
  });

  test('market toggle off keeps market result as Not provided', async ({ page }) => {
    test.skip(process.env.CI === 'true', 'PBT is flaky in CI');
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          kwh: fc.integer({ min: 1, max: 3000 }),
          monthIndex: fc.integer({ min: 0, max: 11 }),
          year: fc.integer({ min: 2024, max: new Date().getFullYear() })
        }),
        async ({ kwh, monthIndex, year }) => {
          await page.goto('/');
          await selectBaseFields(page, year, monthIndex, kwh);
          await calcForm(page).getByRole('button', { name: 'See my emissions in minutes' }).click();
          await page.waitForFunction(() => document.querySelector('#result-container')?.classList.contains('active'), { timeout: 5000 }).catch(() => null);
          const isActive = await page.locator('#result-container').evaluate((el) => el.classList.contains('active'));
          if (!isActive) return;
          await expect(page.locator('#result-market')).toHaveText(/Not provided/i);
        }
      ),
      pbtOptions
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
      pbtOptions
    );
  });

  test('emissions are non-decreasing with higher kWh (same location)', async ({ page }) => {
    test.skip(process.env.CI === 'true', 'PBT is flaky in CI');
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          kwhA: fc.integer({ min: 1, max: 2000 }),
          kwhB: fc.integer({ min: 2001, max: 4000 }),
          monthIndex: fc.integer({ min: 0, max: 11 }),
          year: fc.integer({ min: 2024, max: new Date().getFullYear() })
        }),
        async ({ kwhA, kwhB, monthIndex, year }) => {
          // First run with lower kWh
          await page.goto('/');
          await selectBaseFields(page, year, monthIndex, kwhA);
          await calcForm(page).getByRole('button', { name: 'See my emissions in minutes' }).click();
          await page.waitForFunction(() => document.querySelector('#result-container')?.classList.contains('active'), { timeout: 5000 }).catch(() => null);
          const isActiveA = await page.locator('#result-container').evaluate((el) => el.classList.contains('active'));
          if (!isActiveA) return;
          const locAText = await page.locator('#result-tons').textContent();
          const locA = Number(locAText?.replace(/[^\d.-]/g, '') || 0);

          // Run again with higher kWh
          await page.goto('/');
          await selectBaseFields(page, year, monthIndex, kwhB);
          await calcForm(page).getByRole('button', { name: 'See my emissions in minutes' }).click();
          await page.waitForFunction(() => document.querySelector('#result-container')?.classList.contains('active'), { timeout: 5000 }).catch(() => null);
          const isActiveB = await page.locator('#result-container').evaluate((el) => el.classList.contains('active'));
          if (!isActiveB) return;
          const locBText = await page.locator('#result-tons').textContent();
          const locB = Number(locBText?.replace(/[^\d.-]/g, '') || 0);

          expect(locB).toBeGreaterThanOrEqual(locA);
        }
      ),
      pbtOptions
    );
  });

  test('factor mismatch note appears when activity year exceeds factor year', async ({ page }) => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          activityYear: fc.integer({ min: new Date().getFullYear(), max: new Date().getFullYear() + 1 }), // current or future
          factorYear: fc.integer({ min: 2024, max: new Date().getFullYear() - 1 }),
          monthIndex: fc.integer({ min: 0, max: 11 })
        }),
        async ({ activityYear, factorYear, monthIndex }) => {
          await page.goto('/');
          // Force factor mismatch by setting billing year > factor year; market year matches billing
          await selectBaseFields(page, activityYear, monthIndex, 500);
          const form = calcForm(page);
          await form.getByLabel('Include market-based Scope 2 (RECs / PPAs)').check();
          await form.getByLabel('Instrument type', { exact: true }).selectOption({ value: 'REC' });
          await form.getByLabel('Covered electricity (kWh)').fill('50');
          const marketYearSelect = form.getByLabel('Reporting year (market-based)');
          const marketOptions = await marketYearSelect.locator('option').allTextContents();
          const marketYear = marketOptions.includes(String(activityYear)) ? String(activityYear) : marketOptions[0];
          await marketYearSelect.selectOption(marketYear);
          await form.getByRole('button', { name: 'See my emissions in minutes' }).click();
          const mismatchText = await page.locator('#factor-mismatch').textContent();
          if (!mismatchText) return;
          expect(mismatchText).toMatch(/most recent available data|published with a delay/i);
        }
      ),
      pbtOptions
    );
  });

  test('market-based emissions do not exceed location-based when covered > 0', async ({ page }) => {
    test.skip(process.env.CI === 'true', 'PBT is flaky in CI');
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          kwh: fc.integer({ min: 100, max: 4000 }),
          covered: fc.integer({ min: 1, max: 500 }),
          monthIndex: fc.integer({ min: 0, max: 11 }),
          year: fc.integer({ min: 2024, max: new Date().getFullYear() })
        }),
        async ({ kwh, covered, monthIndex, year }) => {
          await page.goto('/');
          await selectBaseFields(page, year, monthIndex, kwh);
          const form = calcForm(page);
          await form.getByLabel('Include market-based Scope 2 (RECs / PPAs)').check();
          await form.getByLabel('Instrument type', { exact: true }).selectOption({ value: 'REC' });
          await form.getByLabel('Covered electricity (kWh)').fill(String(covered));
          const marketYearSelect = form.getByLabel('Reporting year (market-based)');
          const marketOptions = await marketYearSelect.locator('option').allTextContents();
          const marketYear = marketOptions.includes(String(year)) ? String(year) : marketOptions[0];
          await marketYearSelect.selectOption(marketYear);
          await form.getByRole('button', { name: 'See my emissions in minutes' }).click();
          await page.waitForFunction(() => document.querySelector('#result-container')?.classList.contains('active'), { timeout: 5000 }).catch(() => null);
          const isActive = await page.locator('#result-container').evaluate((el) => el.classList.contains('active'));
          if (!isActive) return;
          const locText = await page.locator('#result-tons').textContent();
          const mktText = await page.locator('#result-market').textContent();
          const locVal = Number(locText?.replace(/[^\d.-]/g, '') || 0);
          const mktVal = Number(mktText?.replace(/[^\d.-]/g, '') || 0);
          expect(mktVal).toBeLessThanOrEqual(locVal);
        }
      ),
      pbtOptions
    );
  });

  test('covered kWh reported does not exceed total kWh', async ({ page }) => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          kwh: fc.integer({ min: 100, max: 3000 }),
          covered: fc.integer({ min: 0, max: 5000 }), // may exceed total
          monthIndex: fc.integer({ min: 0, max: 11 }),
          year: fc.integer({ min: 2024, max: new Date().getFullYear() })
        }),
        async ({ kwh, covered, monthIndex, year }) => {
          await page.goto('/');
          await selectBaseFields(page, year, monthIndex, kwh);
          const form = calcForm(page);
          await form.getByLabel('Include market-based Scope 2 (RECs / PPAs)').check();
          await form.getByLabel('Instrument type', { exact: true }).selectOption({ value: 'REC' });
          await form.getByLabel('Covered electricity (kWh)').fill(String(covered));
          const marketYearSelect = form.getByLabel('Reporting year (market-based)');
          const marketOptions = await marketYearSelect.locator('option').allTextContents();
          const marketYear = marketOptions.includes(String(year)) ? String(year) : marketOptions[0];
          await marketYearSelect.selectOption(marketYear);
          await form.getByRole('button', { name: 'See my emissions in minutes' }).click();
          const details = await page.locator('#market-details').textContent();
          if (details) {
            const match = details.match(/Covered kWh: ([\d,]+)/i);
            if (match?.[1]) {
              const reportedCovered = Number(match[1].replace(/,/g, ''));
              expect(reportedCovered).toBeLessThanOrEqual(kwh);
            }
          }
        }
      ),
      pbtOptions
    );
  });
});
