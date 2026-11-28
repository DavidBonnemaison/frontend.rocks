import { test, expect } from '@playwright/test';

const PAGE_TARGETS = [
  { name: 'concept', url: '/concepts/css-container-queries/' },
  { name: 'autopsy', url: '/autopsies/double-payment-race-condition/' },
  { name: 'symptom', url: '/symptoms/z-index-ignored/' },
] as const;

const VIEWPORTS = [
  { label: '1280', width: 1280, height: 800 },
  { label: '390', width: 390, height: 844 },
] as const;

const THEMES = ['light', 'dark'] as const;

test.describe('Content pages visual regression', () => {
  for (const target of PAGE_TARGETS) {
    for (const theme of THEMES) {
      for (const vp of VIEWPORTS) {
        test(`${target.name} ${theme} ${vp.label}px`, async ({ page }) => {
          await page.setViewportSize({ width: vp.width, height: vp.height });
          await page.goto(target.url, { waitUntil: 'networkidle' });
          await page.evaluate((t) => {
            document.documentElement.dataset.theme = t;
          }, theme);
          await page.evaluate(() => document.fonts.ready);

          await expect(page).toHaveScreenshot(`${target.name}-${theme}-${vp.label}.png`);
        });
      }
    }
  }

  test('claim permalinks 5 proof kinds gallery 1280px', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/dev/components/', { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);

    const section = page.locator('#claim-permalinks');
    await section.scrollIntoViewIfNeeded();
    await expect(section).toHaveScreenshot('claim-permalinks-1280.png');
  });
});
