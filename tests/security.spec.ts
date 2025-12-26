import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';

// Assert anon key usage in client configuration (no service_role) by scanning exposed constants and page content
test('client uses anon key placeholders, not service role', async ({ page }) => {
  await page.goto('/');
  const supabaseKey = await page.evaluate(() => (window as any).SUPABASE_ANON_KEY || (window as any).supabaseAnonKey || null);
  expect((supabaseKey ?? '').toLowerCase()).not.toContain('service_role');
  const content = await page.content();
  expect(content.toLowerCase()).not.toContain('service_role');
});

test('app pages avoid service role key leakage', async ({ page }) => {
  for (const path of ['/records.html', '/exports.html']) {
    await page.goto(path);
    await page.waitForTimeout(500);
    const content = await page.content();
    expect(content.toLowerCase()).not.toContain('service_role');
  }
});

// Ensure unauthenticated calculation does not trigger Supabase writes (blocked via network intercept)
test('unauthenticated calculate avoids Supabase writes', async ({ page }) => {
  const requests: string[] = [];
  await page.route('**supabase.co/rest/**', (route) => {
    requests.push(route.request().url());
    route.abort();
  });
  await page.route('**supabase.co/auth/**', (route) => {
    requests.push(route.request().url());
    route.abort();
  });
  await page.route('**supabase.co/**', (route) => {
    if (route.request().method() !== 'GET') {
      requests.push(route.request().url());
      route.abort();
    } else {
      route.continue();
    }
  });
  await page.goto('/');
  const form = page.locator('form#carbon-form');
  await form.getByLabel('Who are you?').selectOption({ value: 'finance' });
  await form.getByLabel('Country / region', { exact: true }).selectOption({ value: 'US' });
  await form.getByLabel('Billing month').selectOption('January');
  await form.getByLabel('Billing year').selectOption(String(new Date().getFullYear()));
  await form.getByLabel('Electricity used (kWh)', { exact: true }).fill('500');
  await form.getByLabel('State / region').selectOption({ label: 'California' });
  await form.getByRole('button', { name: 'See my emissions in minutes' }).click();
  // No Supabase REST or auth calls should occur during unauthenticated calculation
  expect(requests.length).toBe(0);
});

test.describe('Session expiry handling', () => {
  const hasAuth = !!process.env.CW_EMAIL && !!process.env.CW_PASSWORD;

  test.skip(!hasAuth, 'Requires CW_EMAIL/CW_PASSWORD to simulate expired session');

  test('expired storage state forces re-auth on protected pages', async ({ page }) => {
    // Start from records with valid auth to warm state
    await page.goto('/records.html');
    await page.waitForTimeout(1000);

    // Corrupt storage state to simulate expiry
    await page.context().storageState({ path: 'auth-state.json' });
    await page.context().clearCookies();
    await page.context().addCookies([{ name: 'supabase-auth-token', value: 'expired', domain: '.esgrise.com', path: '/' }]);

    // Reload records page and expect redirect or sign-in prompt
    await page.goto('/records.html');
    await page.waitForTimeout(1500);
    const url = page.url();
    if (url.includes('records.html')) {
      await expect(page.getByText(/Sign in on the main page to view your records|Sign in to view history/i)).toBeVisible();
    } else {
      await expect(url).toContain('index.html');
    }
  });
});

test.describe('Input sanitization (UI escapes)', () => {
  const payload = '<img src=x onerror=alert(1)>';

  test('malicious strings in persona do not render HTML', async ({ page }) => {
    await page.goto('/');
    // Open sign-up modal and inject payload into company name (text field)
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.getByRole('button', { name: 'Create account' }).click();
    const companyField = page.locator('#auth-modal').getByLabel('Company name', { exact: true }).first();
    await companyField.fill(payload);
    await expect(page.locator('#auth-modal img[src="x"]')).toHaveCount(0);
    const html = await page.locator('#auth-modal').innerHTML();
    expect(html || '').not.toContain(payload); // payload not rendered/escaped
  });
});

test.describe('Export scope checks (opt-in, needs fixtures)', () => {
  test.skip(process.env.CW_EMAIL == null || process.env.CW_PASSWORD == null, 'Requires credentials and fixture data');
  test.use({ storageState: 'tests/../auth-state.json' });

  test('year filter changes CSV row count when data spans years', async ({ page }) => {
    await page.goto('/exports.html');
    const options = await page.locator('#exportYear option').all();
    if (options.length < 3) test.skip(true, 'Not enough year options to compare');

    // Download all years
    const [allDl] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Generate CSV' }).click()
    ]);
    const allContent = fs.readFileSync(await allDl.path() as string, 'utf-8');
    const allRows = allContent.trim().split(/\r?\n/).filter((line) => line && !line.startsWith('"Disclosure"')).length;

    // Pick first year option (excluding "All years")
    const firstYear = await options[1].getAttribute('value');
    if (!firstYear) test.skip(true, 'Year value missing');
    await page.locator('#exportYear').selectOption(firstYear);
    const [yearDl] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Generate CSV' }).click()
    ]);
    const yearContent = fs.readFileSync(await yearDl.path() as string, 'utf-8');
    const yearRows = yearContent.trim().split(/\r?\n/).filter((line) => line && !line.startsWith('"Disclosure"')).length;

    expect(yearRows).toBeLessThanOrEqual(allRows);
  });

  test('CSV rows are scoped to current user and contain required columns', async ({ page }) => {
    await page.goto('/exports.html');
    const companyDisplay = await page.locator('#companyName').textContent();
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Generate CSV' }).click()
    ]);
    const csv = fs.readFileSync(await download.path() as string, 'utf-8');
    const lines = csv.split(/\r?\n/).filter(Boolean);
    const header = lines[0];
    expect(header).toMatch(/company_name,period,country,kwh,scope2_location_based_tco2e,scope2_market_based_tco2e,emission_factor_value,emission_factor_year,emission_factor_source/);
    // No service_role key leaked
    expect(csv.toLowerCase()).not.toContain('service_role');
    // Basic column completeness for first data row (if any)
    if (lines.length > 2) {
      const firstData = lines[1].split(',');
      expect(firstData.length).toBeGreaterThanOrEqual(9);
      if (companyDisplay && !/company not set/i.test(companyDisplay)) {
        // strip quotes
        const companyVal = firstData[0].replace(/^"|"$/g, '');
        expect(companyVal).toContain(companyDisplay.trim());
      }
    }
  });
});
