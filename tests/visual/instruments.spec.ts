import { test, expect } from '@playwright/test';

const INSTRUMENT_SECTIONS = [
  'queue-view',
  'timeline',
  'layer-stack',
  'box-tree',
  'frame-budget',
  'event-path',
  'network-waterfall',
  'diff-view',
] as const;

async function waitForInstrumentsReady(page: import('@playwright/test').Page) {
  await page.evaluate(() => document.fonts.ready);
  await expect(page.getByText('Loading instrument…')).toHaveCount(0, { timeout: 15_000 });
  await expect
    .poll(
      async () =>
        page.evaluate(() => {
          const s = (globalThis as { __frInstrumentsLoaded?: Set<string> }).__frInstrumentsLoaded;
          return s ? s.size : 0;
        }),
      { timeout: 15_000 },
    )
    .toBe(8);
}

test.describe('Instruments gallery visual regression', () => {
  test('desktop 1280px captures for every instrument in light theme', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/dev/instruments/');
    await waitForInstrumentsReady(page);

    for (const name of INSTRUMENT_SECTIONS) {
      const section = page.locator(`#inst-${name}`);
      await section.scrollIntoViewIfNeeded();
      await expect(section).toHaveScreenshot(`inst-${name}-light-1280.png`);
    }
  });

  test('desktop 1280px captures for every instrument in dark theme', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/dev/instruments/');
    await waitForInstrumentsReady(page);

    await page.getByTestId('gallery-theme-dark').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

    for (const name of INSTRUMENT_SECTIONS) {
      const section = page.locator(`#inst-${name}`);
      await section.scrollIntoViewIfNeeded();
      await expect(section).toHaveScreenshot(`inst-${name}-dark-1280.png`);
    }
  });
});
