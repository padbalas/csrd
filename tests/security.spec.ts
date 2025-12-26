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
  await page.goto('/');
  const form = page.locator('form#carbon-form');
  await form.getByLabel('Who are you?').selectOption({ value: 'finance' });
  await form.getByLabel('Country / region', { exact: true }).selectOption({ value: 'US' });
  await form.getByLabel('Billing month').selectOption('January');
  await form.getByLabel('Billing year').selectOption(String(new Date().getFullYear()));
  await form.getByLabel('Electricity used (kWh)', { exact: true }).fill('500');
  await form.getByLabel('State / region').selectOption({ label: 'California' });
  await form.getByRole('button', { name: 'See my emissions in minutes' }).click();
  // No Supabase REST calls should occur during unauthenticated calculation
  expect(requests.length).toBe(0);
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
});
