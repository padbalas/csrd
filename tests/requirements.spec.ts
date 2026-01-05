import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const storagePath = path.join(__dirname, '..', 'auth-state.json');
const hasAuthState = fs.existsSync(storagePath);
const isLandingPage = (url: string) => /(index\.html)?$/.test(new URL(url).pathname);

const getSelectValues = async (locator: any) => {
  return locator.evaluateAll((options: HTMLOptionElement[]) =>
    options.map((opt) => opt.value).filter(Boolean)
  );
};

const getSiteCountries = async (page: any) => {
  await page.goto('/settings.html');
  if (isLandingPage(page.url())) {
    test.skip(true, 'Auth state missing for settings page');
  }
  const siteLabels = await page.locator('#sites-list .site-label').allTextContents();
  if (!siteLabels.length) return [];
  return Array.from(
    new Set(siteLabels.map((label) => label.split('/')[0]?.trim()).filter(Boolean))
  );
};

test.describe('Requirements coverage', () => {
  test('unauthenticated gating for protected pages', async ({ page }) => {
    await page.goto('/exports.html');
    await expect(page).toHaveURL(/\/(index\.html)?$/);

    await page.goto('/insights.html');
    await expect(page).toHaveURL(/\/(index\.html)?$/);

    await page.goto('/settings.html');
    await expect(page).toHaveURL(/\/(index\.html)?$/);

    await page.goto('/records.html');
    await expect(page.locator('#records-auth-note')).toBeVisible();
  });

  test('calculator core inputs visible', async ({ page }) => {
    await page.goto('/');
    const form = page.locator('form#carbon-form');
    await expect(form.getByLabel('Who are you?')).toBeVisible();
    await expect(form.getByLabel('Country / region', { exact: true })).toBeVisible();
    await expect(form.getByLabel('State / region')).toBeVisible();
    await expect(form.getByLabel('Billing month')).toBeVisible();
    await expect(form.getByLabel('Billing year')).toBeVisible();
    await expect(form.getByLabel('Electricity used (kWh)', { exact: true })).toBeVisible();
  });

  test.describe('Authenticated requirements', () => {
    test.skip(!hasAuthState, 'Requires CW_EMAIL and CW_PASSWORD to generate auth-state.json');
    test.use({ storageState: storagePath });

    test('settings show sites section with HQ selection', async ({ page }) => {
      await page.goto('/settings.html');
      await expect(page.getByRole('heading', { name: /Settings/i })).toBeVisible();
      await expect(page.getByRole('heading', { name: /Sites/i })).toBeVisible();
      const rows = page.locator('#sites-list .site-row');
      const count = await rows.count();
      if (count === 0) {
        test.skip(true, 'No sites configured to validate HQ selection');
      }
      const hqRadios = page.locator('input[name="hq-site"]');
      await expect(hqRadios).toHaveCount(count);
      const checkedCount = await page.locator('input[name="hq-site"]:checked').count();
      expect(checkedCount).toBe(1);
    });

    test('settings add/remove site (mutation)', async ({ page }) => {
      if (!process.env.RUN_MUTATION_TESTS) {
        test.skip(true, 'Set RUN_MUTATION_TESTS=true to enable data mutations');
      }
      await page.goto('/settings.html');
      const addBtn = page.getByRole('button', { name: /Add site/i });
      if (await addBtn.isDisabled()) {
        test.skip(true, 'Site add disabled by plan entitlements');
      }
      const siteLabels = await page.locator('#sites-list .site-label').allTextContents();
      const hadSites = siteLabels.length > 0;
      const existingPairs = new Set(siteLabels.map((label) => label.trim()));

      const countrySelect = page.locator('#site-country');
      const regionSelect = page.locator('#site-region');
      await expect(countrySelect).toBeVisible();

      const countryOptions = await getSelectValues(page.locator('#site-country option'));
      let chosenCountry = '';
      let chosenRegion = '';
      for (const country of countryOptions) {
        await countrySelect.selectOption(country);
        const regionOptions = await getSelectValues(page.locator('#site-region option'));
        const candidate = regionOptions.find((region) => !existingPairs.has(`${country} / ${region}`));
        if (candidate) {
          chosenCountry = country;
          chosenRegion = candidate;
          break;
        }
      }
      if (!chosenCountry || !chosenRegion) {
        test.skip(true, 'No available site combinations to add');
      }

      await countrySelect.selectOption(chosenCountry);
      await regionSelect.selectOption(chosenRegion);
      await addBtn.click();
      await expect(page.locator('#sites-status')).toContainText(/Site added/i);

      const targetLabel = `${chosenCountry} / ${chosenRegion}`;
      const row = page.locator('#sites-list .site-row').filter({ hasText: targetLabel });
      await expect(row).toBeVisible();
      if (!hadSites) {
        test.skip(true, 'Added first site as HQ; removal blocked by design.');
      }
      await row.getByRole('button', { name: /Remove/i }).click();
      await expect(page.locator('#sites-status')).toContainText(/Site removed/i);
    });

    test('calculator country options match configured sites', async ({ page }) => {
      const siteCountries = await getSiteCountries(page);
      if (!siteCountries.length) {
        test.skip(true, 'No sites configured to validate calculator options');
      }
      await page.goto('/');
      const options = await getSelectValues(page.locator('#country option'));
      siteCountries.forEach((country) => {
        expect(options).toContain(country);
      });
      expect(options.length).toBeLessThanOrEqual(siteCountries.length);
    });

    test('records add flow uses configured sites only', async ({ page }) => {
      const siteCountries = await getSiteCountries(page);
      if (!siteCountries.length) {
        test.skip(true, 'No sites configured to validate add flow');
      }
      await page.goto('/records.html');
      const addBtn = page.getByRole('button', { name: 'Add record' });
      await expect(addBtn).toBeVisible();
      if (await addBtn.isDisabled()) {
        test.skip(true, 'No sites configured to validate add flow');
      }
      await addBtn.click();
      const addCountryOptions = await getSelectValues(page.locator('#add-country option'));
      siteCountries.forEach((country) => {
        expect(addCountryOptions).toContain(country);
      });
    });

    test('scope 1 records add flow uses configured sites only', async ({ page }) => {
      const siteCountries = await getSiteCountries(page);
      if (!siteCountries.length) {
        test.skip(true, 'No sites configured to validate scope 1 add flow');
      }
      await page.goto('/scope1.html');
      const addBtn = page.getByRole('button', { name: 'Add record' });
      await expect(addBtn).toBeVisible();
      if (await addBtn.isDisabled()) {
        test.skip(true, 'No sites configured to validate scope 1 add flow');
      }
      await addBtn.click();
      const addCountryOptions = await getSelectValues(page.locator('#add-country option'));
      siteCountries.forEach((country) => {
        expect(addCountryOptions).toContain(country);
      });
    });

    test('exports year defaults to current year when preference is all', async ({ page }) => {
      await page.goto('/exports.html');
      if (/(index\.html)?$/.test(new URL(page.url()).pathname)) {
        test.skip(true, 'Auth state missing for exports page');
      }
      const yearSelect = page.locator('#exportYear');
      const currentYear = new Date().getFullYear().toString();
      await expect(yearSelect).toBeVisible();
      const selected = await yearSelect.inputValue();
      expect([currentYear, '']).toContain(selected);
    });

    test('insights scope 1 tab exists', async ({ page }) => {
      await page.goto('/insights.html');
      const scope1Tab = page.getByRole('button', { name: /Scope 1/i });
      await expect(scope1Tab).toBeVisible();
    });

    test('settings checkout success shows status', async ({ page }) => {
      await page.goto('/settings.html?checkout=success');
      if (isLandingPage(page.url())) {
        test.skip(true, 'Auth state missing for settings page');
      }
      await expect(page.locator('#subscription-status')).toContainText(/Checkout complete/i);
    });

    test('scope 2 limit message disables add when present', async ({ page }) => {
      await page.goto('/records.html');
      if (isLandingPage(page.url())) {
        test.skip(true, 'Auth state missing for records page');
      }
      const limitStatus = page.locator('#scope2-limit-status');
      const text = ((await limitStatus.textContent()) || '').trim();
      if (text) {
        await expect(limitStatus).toContainText(/Free plan limit/i);
        await expect(page.getByRole('button', { name: 'Add record' })).toBeDisabled();
      } else {
        test.skip(true, 'Limit message not present for this account');
      }
    });

    test('scope 1 limit message disables add when present', async ({ page }) => {
      await page.goto('/scope1.html');
      if (isLandingPage(page.url())) {
        test.skip(true, 'Auth state missing for scope 1 page');
      }
      const limitStatus = page.locator('#scope1-limit-status');
      const text = ((await limitStatus.textContent()) || '').trim();
      if (text) {
        await expect(limitStatus).toContainText(/Free plan limit/i);
        await expect(page.getByRole('button', { name: 'Add record' })).toBeDisabled();
      } else {
        test.skip(true, 'Limit message not present for this account');
      }
    });
  });
});
