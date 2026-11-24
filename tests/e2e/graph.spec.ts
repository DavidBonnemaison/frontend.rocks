import { test, expect } from './fixtures';
import { DOMAIN_VALUES } from '../../src/lib/schemas';

test.describe('Concept graph', () => {
  test('groups the mobile /graph view by domain, one accordion per domain', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });

    await page.goto('/graph/', { waitUntil: 'networkidle' });
    const domainBtn = page.getByTestId('graph-mode-domains');
    await expect(domainBtn).toBeVisible();
    await domainBtn.click();
    const domainAccordions = page.locator('[data-testid^="domain-group-"]');
    await expect(domainAccordions).toHaveCount(DOMAIN_VALUES.length);
  });

  test('fits the desktop graph stage in its viewport and aligns the mobile filter selects', async ({ page }) => {
    // 1. Desktop /graph fit-to-width zoom
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/graph/', { waitUntil: 'networkidle' });
    const fitsWidth = await page.evaluate(() => {
      const vp = document.querySelector('.graph-viewport');
      const stage = document.querySelector('.graph-svg-stage');
      if (!vp || !stage) return false;
      const vpRect = vp.getBoundingClientRect();
      const stageRect = stage.getBoundingClientRect();
      return stageRect.width <= vpRect.width + 1;
    });
    expect(fitsWidth, 'Graph SVG stage fits within desktop viewport container').toBe(true);

    await page.setViewportSize({ width: 390, height: 844 });
    // 3. Mobile /graph Domain & Maturity selects have identical left edge and width
    await page.goto('/graph/', { waitUntil: 'networkidle' });
    const selectsAligned = await page.evaluate(() => {
      const selects = Array.from(document.querySelectorAll('.graph-filter-label .sim-select'));
      if (selects.length < 2) return false;
      const r0 = selects[0].getBoundingClientRect();
      const r1 = selects[1].getBoundingClientRect();
      return Math.abs(r0.left - r1.left) <= 1 && Math.abs(r0.width - r1.width) <= 1;
    });
    expect(selectsAligned, 'Domain and Maturity selects aligned on 390px').toBe(true);
  });
});
