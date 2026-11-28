import { test, expect } from './fixtures';

test.describe('Symptom pages', () => {
  test('renders the symptom index and a symptom page with its causal chain @smoke', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/symptoms/', { waitUntil: 'networkidle' });
    await expect(
      page.getByRole('heading', { name: /Production Symptoms & DevTools Signatures/i })
    ).toBeVisible();
    const zIndexLink = page.locator('a[href="/symptoms/z-index-ignored/"]').first();
    await expect(zIndexLink).toBeVisible();

    await zIndexLink.click();
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/\/symptoms\/z-index-ignored\/$/);
    await expect(
      page.getByRole('heading', { name: /Likely causes, most common first/i })
    ).toBeVisible();
    await expect(page.locator('a[href*="/concepts/css-stacking-context/"]').first()).toBeVisible();

    expect(errors).toEqual([]);
  });
});
