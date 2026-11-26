import AxeBuilder from '@axe-core/playwright';
import { test, expect } from './fixtures';

test.describe('Instruments gallery accessibility, keyboard navigation, and bundle isolation', () => {
  test('passes axe-core with zero violations on /dev/instruments/ in light and dark themes', async ({
    page,
  }) => {
    await page.goto('/dev/instruments/');
    await page.evaluate(() => document.fonts.ready);
    await expect(page.getByText('Loading instrument…')).toHaveCount(0, { timeout: 15_000 });

    const lightResults = await new AxeBuilder({ page }).analyze();
    expect(lightResults.violations).toEqual([]);

    await page.getByTestId('gallery-theme-dark').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

    const darkResults = await new AxeBuilder({ page }).analyze();
    expect(darkResults.violations).toEqual([]);
  });

  test('supports full keyboard navigation on QueueView, BoxTree, and Timeline', async ({ page }) => {
    await page.goto('/dev/instruments/');
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

    // QueueView keyboard stepping
    const qv = page.getByTestId('inst-queue-view-ordinal');
    const qvStage = qv.locator('[tabindex="0"]').first();
    await qvStage.focus();
    await expect(qv).toContainText('STEP 1 / 15');
    await page.keyboard.press('ArrowRight');
    await expect(qv).toContainText('STEP 2 / 15');
    await page.keyboard.press('End');
    await expect(qv).toContainText('STEP 15 / 15');
    await page.keyboard.press('Home');
    await expect(qv).toContainText('STEP 1 / 15');

    // Timeline keyboard stepping
    const tl = page.getByTestId('inst-timeline-ordinal');
    const tlStage = tl.locator('[tabindex="0"]').first();
    await tlStage.focus();
    await expect(tl).toContainText('EVENT 1 / 5');
    await page.keyboard.press('ArrowRight');
    await expect(tl).toContainText('EVENT 2 / 5');

    // BoxTree ARIA tree keyboard navigation (collapse/expand & arrow movement)
    const bt = page.getByTestId('inst-box-tree-ordinal');
    const rootItem = bt.locator('[role="treeitem"]').first();
    await rootItem.focus();
    await expect(rootItem).toHaveAttribute('aria-expanded', 'true');
    await page.keyboard.press('ArrowLeft');
    await expect(rootItem).toHaveAttribute('aria-expanded', 'false');
    await page.keyboard.press('ArrowRight');
    await expect(rootItem).toHaveAttribute('aria-expanded', 'true');
    await page.keyboard.press('ArrowDown');
    const secondItem = bt.locator('[role="treeitem"]').nth(1);
    await expect(secondItem).toBeFocused();
  });

  test('does not load any instrument chunk on a page without an Experiment, and records loaded instruments on the gallery', async ({
    page,
  }) => {
    await page.goto('/');
    const loadedOnHome = await page.evaluate(() => {
      const s = (globalThis as { __frInstrumentsLoaded?: Set<string> }).__frInstrumentsLoaded;
      return s === undefined ? null : [...s];
    });
    expect(loadedOnHome).toBeNull();

    await page.goto('/dev/instruments/');
    await expect(page.getByText('Loading instrument…')).toHaveCount(0, { timeout: 15_000 });

    await expect
      .poll(
        async () =>
          page.evaluate(() => {
            const s = (globalThis as { __frInstrumentsLoaded?: Set<string> }).__frInstrumentsLoaded;
            return s ? [...s].sort() : [];
          }),
        { timeout: 15_000 },
      )
      .toEqual([
        'box-tree',
        'diff-view',
        'event-path',
        'frame-budget',
        'layer-stack',
        'network-waterfall',
        'queue-view',
        'timeline',
      ]);
  });

  test('marks /dev/instruments/ as noindex, nofollow', async ({ page }) => {
    await page.goto('/dev/instruments/');
    const robotsMeta = await page.locator('meta[name="robots"]').getAttribute('content');
    expect(robotsMeta).toContain('noindex');
    expect(robotsMeta).toContain('nofollow');
  });
});
