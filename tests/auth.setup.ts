import { chromium } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const STORAGE_PATH = path.join(__dirname, '..', 'auth-state.json');

async function globalSetup() {
  const email = process.env.CW_EMAIL;
  const password = process.env.CW_PASSWORD;
  const baseURL = process.env.CW_BASE_URL || 'https://www.esgrise.com';

  if (!email || !password) {
    // No credentials provided; skip auth state creation so unauth tests can still run.
    return;
  }

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  await page.goto(baseURL);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.locator('#auth-email').fill(email);
  await page.locator('#auth-password').fill(password);
  await page.locator('#auth-submit').click();

  // Wait for sign-out control to confirm session established
  await page.waitForSelector('#header-signout', { state: 'attached', timeout: 15000 });
  const storageState = await page.context().storageState();
  fs.writeFileSync(STORAGE_PATH, JSON.stringify(storageState, null, 2));

  await browser.close();
}

export default globalSetup;
