import { test, expect } from '@playwright/test';

const SECTIONS = [
  'button',
  'chip',
  'meta-block',
  'card',
  'sidenote',
  'code-block',
  'tabs',
  'theme-toggle',
  'overlays',
  'proof-visuals',
  'instrument-panel',
  'schematic',
  'piece-block',
] as const;

const MOBILE_SECTIONS = ['sidenote', 'instrument-panel', 'piece-block'] as const;

test.describe('Component gallery visual regression', () => {
  test('desktop 1280px captures for every gallery section', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/dev/components/');
    await page.evaluate(() => document.fonts.ready);

    for (const id of SECTIONS) {
      const section = page.locator(`#${id}`);
      await section.scrollIntoViewIfNeeded();
      await expect(section).toHaveScreenshot(`${id}-1280.png`);
    }
  });

  test('mobile 390px captures for responsive gallery sections', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/dev/components/');
    await page.evaluate(() => document.fonts.ready);

    for (const id of MOBILE_SECTIONS) {
      const section = page.locator(`#${id}`);
      await section.scrollIntoViewIfNeeded();
      await expect(section).toHaveScreenshot(`${id}-390.png`);
    }
  });
});
