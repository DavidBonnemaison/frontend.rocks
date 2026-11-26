import { test, expect } from '@playwright/test';

test.describe('Theme default and persistence', () => {
  test('first-time visitor gets light theme even when system prefers dark', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/');
    const theme = await page.evaluate(() => document.documentElement.dataset.theme);
    expect(theme).toBe('light');
  });

  test('stored fr-theme=dark applies immediately on domcontentloaded without flash', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('fr-theme', 'dark');
    });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const theme = await page.evaluate(() => document.documentElement.dataset.theme);
    expect(theme).toBe('dark');
  });

  test('unknown stored value (e.g. system) falls back to light theme', async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('fr-theme', 'system');
    });
    await page.goto('/');
    const theme = await page.evaluate(() => document.documentElement.dataset.theme);
    expect(theme).toBe('light');
  });

  test('ThemeToggle switches between light and dark and persists across reload', async ({
    page,
  }) => {
    await page.goto('/dev/components/');
    const toggle = page.locator('#theme-toggle [data-theme="light"] input[role="switch"]').first();
    await expect(toggle).toHaveAttribute('aria-checked', 'false');
    await toggle.click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

    const stored = await page.evaluate(() => window.localStorage.getItem('fr-theme'));
    expect(stored).toBe('dark');

    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  });
});
