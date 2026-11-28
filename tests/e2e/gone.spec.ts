import { test, expect } from './fixtures';

test.describe('/gone/ page', () => {
  test('renders retired page notice with noindex and navigation links', async ({ page }) => {
    await page.goto('/gone/');

    await expect(
      page.getByRole('heading', { level: 1, name: 'This page was retired' }),
    ).toBeVisible();

    const robots = await page.locator('meta[name="robots"]').getAttribute('content');
    expect(robots?.toLowerCase()).toContain('noindex');

    await expect(page.locator('a[href="/proof/"]').first()).toBeVisible();
  });
});
