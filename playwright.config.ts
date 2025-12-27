import { defineConfig } from '@playwright/test';

export default defineConfig({
  globalSetup: './tests/auth.setup.ts',
  testDir: './tests',
  timeout: 30_000,
  use: {
    baseURL: process.env.CW_BASE_URL || 'https://www.esgrise.com', // OR your github.io URL
    headless: true,
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  reporter: [['html', { open: 'never' }]],
});
