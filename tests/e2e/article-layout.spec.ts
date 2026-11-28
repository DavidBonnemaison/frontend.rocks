import { test, expect } from './fixtures';

test.describe('ArticleLayout 3/6/3 grid', () => {
  test('renders sticky left rail, 6-column prose, and wide blocks at 1280px @smoke', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/concepts/css-container-queries/', { waitUntil: 'networkidle' });

    const rail = page.locator('.article-rail');
    await expect(rail).toBeVisible();
    const railPosition = await rail.evaluate((el) => getComputedStyle(el).position);
    expect(railPosition).toBe('sticky');

    const inlineRail = page.locator('.article-rail-inline');
    await expect(inlineRail).toBeHidden();

    // Direct child check for .is-wide blocks inside .article-grid
    const geom = await page.evaluate(() => {
      const grid = document.querySelector('.article-grid');
      const wide = document.querySelector('.article-grid > .is-wide');
      const prose = document.querySelector('.article-grid > :is(p, ol, ul, h2)');
      if (!grid || !wide || !prose) return null;
      return {
        isDirectChild: wide.parentElement === grid,
        gridLeft: grid.getBoundingClientRect().left,
        gridRight: grid.getBoundingClientRect().right,
        wideLeft: wide.getBoundingClientRect().left,
        wideRight: wide.getBoundingClientRect().right,
        proseLeft: prose.getBoundingClientRect().left,
        proseRight: prose.getBoundingClientRect().right,
      };
    });
    expect(geom).not.toBeNull();
    expect(geom!.isDirectChild).toBe(true);
    expect(Math.abs(geom!.wideLeft - geom!.proseLeft)).toBeLessThanOrEqual(2);
    expect(Math.abs(geom!.wideRight - geom!.gridRight)).toBeLessThanOrEqual(2);

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 2
    );
    expect(overflow).toBe(false);
  });

  test('switches to inline details rail without horizontal overflow at 1024px and 390px', async ({
    page,
  }) => {
    for (const width of [1024, 390]) {
      await page.setViewportSize({ width, height: 844 });
      await page.goto('/concepts/css-container-queries/', { waitUntil: 'networkidle' });

      await expect(page.locator('.article-rail')).toBeHidden();
      const inlineDetails = page.locator('details.article-rail-inline');
      await expect(inlineDetails).toBeVisible();
      await expect(inlineDetails).not.toHaveAttribute('open', '');

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth + 2
      );
      expect(overflow, `Horizontal overflow at ${width}px`).toBe(false);
    }
  });
});
