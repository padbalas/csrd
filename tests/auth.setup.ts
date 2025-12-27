import { chromium } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const STORAGE_PATH = path.join(__dirname, '..', 'auth-state.json');

async function globalSetup() {
  const email = process.env.CW_EMAIL;
  const password = process.env.CW_PASSWORD;
  const rawBaseURL = process.env.CW_BASE_URL || 'https://www.esgrise.com';
  const baseURL = /https?:\/\/(www\.)?esgrise\.com\/?$/i.test(rawBaseURL)
    ? 'https://www.esgrise.com'
    : rawBaseURL;

  if (!email || !password) {
    // No credentials provided; skip auth state creation so unauth tests can still run.
    return;
  }

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  await page.goto(baseURL);
  await page.waitForFunction(() => (window as any).supabaseClient);
  await page.evaluate(async ({ email, password }) => {
    const client = (window as any).supabaseClient;
    if (!client) throw new Error('Supabase client unavailable');
    await client.auth.signInWithPassword({ email, password });
  }, { email, password });

  // Wait for sign-in to complete (redirect or visible sign-out, or error)
  await page.waitForFunction(async () => {
    const client = (window as any).supabaseClient;
    if (!client) return false;
    const { data } = await client.auth.getSession();
    return !!data?.session;
  }, { timeout: 20000 });
  const storageState = await page.context().storageState();
  fs.writeFileSync(STORAGE_PATH, JSON.stringify(storageState, null, 2));

  await browser.close();
}

export default globalSetup;
