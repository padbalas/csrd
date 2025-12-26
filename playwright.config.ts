import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  use: {
    baseURL: 'https://esgrise.com', // OR your github.io URL
    headless: true,
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  reporter: [['html', { open: 'never' }]],
});
