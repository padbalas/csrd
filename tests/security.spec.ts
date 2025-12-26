import { test, expect } from '@playwright/test';

// Assert anon key usage in client configuration (no service_role) by scanning exposed constants
test('client uses anon key placeholders, not service role', async ({ page }) => {
  await page.goto('/');
  const supabaseKey = await page.evaluate(() => (window as any).SUPABASE_ANON_KEY || null);
  expect(supabaseKey).not.toContain('service_role');
});

// Ensure unauthenticated calculation does not trigger Supabase writes (blocked via network intercept)
test('unauthenticated calculate avoids Supabase writes', async ({ page }) => {
  const requests: string[] = [];
  await page.route('**supabase.co/rest/**', (route) => {
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
