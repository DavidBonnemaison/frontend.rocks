import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  fullyParallel: true,
  workers: process.env.CI ? 2 : undefined,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    headless: true,
  },
  webServer: [
    {
      command: 'python3 -m http.server 4173 --directory dist',
      port: 4173,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'npm run proof:lab-dev',
      port: 4174,
      reuseExistingServer: !process.env.CI,
    },
  ],
});
