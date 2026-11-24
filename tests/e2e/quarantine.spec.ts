import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';

test.describe('Quarantine: unverified pages stay reachable but are hidden from search and machines', () => {
  async function firstVsHref(page: Page): Promise<string> {
    await page.goto('/vs/', { waitUntil: 'networkidle' });
    const href = await page.locator('a[href^="/vs/"]:not([href="/vs/"])').first().getAttribute('href');
    expect(href).toBeTruthy();
    return href!;
  }

  for (const url of [
    '/concepts/css-stacking-context/',
    '/autopsies/double-payment-race-condition/',
    '/symptoms/z-index-ignored/',
  ]) {
    test(`${url} is noindex and has no JSON-LD`, async ({ page }) => {
      const res = await page.goto(url, { waitUntil: 'networkidle' });
      expect(res?.status()).toBe(200);
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
      await expect(page.locator('script[type="application/ld+json"]')).toHaveCount(0);
    });
  }

  test('first /vs/ pair listed is noindex and has no JSON-LD', async ({ page }) => {
    const href = await firstVsHref(page);
    const res = await page.goto(href, { waitUntil: 'networkidle' });
    expect(res?.status()).toBe(200);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
    await expect(page.locator('script[type="application/ld+json"]')).toHaveCount(0);
  });

  test('listing pages with nothing published are noindex, the homepage is not @smoke', async ({ page }) => {
    for (const url of ['/autopsies/', '/symptoms/', '/vs/', '/digest/']) {
      await page.goto(url, { waitUntil: 'networkidle' });
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
    }
    await page.goto('/', { waitUntil: 'networkidle' });
    await expect(page.locator('meta[name="robots"]')).toHaveCount(0);
  });
});
