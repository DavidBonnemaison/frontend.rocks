import { test, expect } from './fixtures';

const TARGET_ROUTES = [
  '/',
  '/graph/',
  '/digest/',
  '/obsolescence/',
  '/concepts/event-loop-tasks-microtasks/',
];

const RAW_KEBAB_SLUGS =
  /\b(obsolescence-alert|spec-update|browser-release|deep-dive|baseline-widely|baseline-newly|interop-experimental|legacy-pattern)\b/;

test.describe('Responsive layout and typographic hygiene', () => {
  test('has no horizontal overflow, a compact header and no raw -> or kebab-case slug at 390x844', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });

    for (const route of TARGET_ROUTES) {
      await page.goto(route, { waitUntil: 'networkidle' });

      // 1. Mobile header height <= 60px before opening menu
      const headerHeight = await page.locator('header.site-header').evaluate((el) => {
        return el.getBoundingClientRect().height;
      });
      expect(headerHeight, `Header height on ${route} at 390px`).toBeLessThanOrEqual(60);

      // 2. Zero horizontal overflow
      const hasOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth
      );
      expect(hasOverflow, `Horizontal overflow on ${route} at 390px`).toBe(false);

      // 3. Zero literal '->' or raw kebab-case slugs in rendered text
      const mainText = await page.locator('main').innerText();
      expect(mainText, `Raw -> found on ${route}`).not.toContain('->');
      expect(mainText, `Raw kebab-case slug found on ${route}`).not.toMatch(RAW_KEBAB_SLUGS);
    }
  });

  test('has no horizontal overflow, no raw -> or kebab-case slug and low-opacity graph edges at 1440x900', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });

    for (const route of TARGET_ROUTES) {
      await page.goto(route, { waitUntil: 'networkidle' });

      const hasOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth
      );
      expect(hasOverflow, `Horizontal overflow on ${route} at 1440px`).toBe(false);

      const mainText = await page.locator('main').innerText();
      expect(mainText, `Raw -> found on ${route}`).not.toContain('->');
      expect(mainText, `Raw kebab-case slug found on ${route}`).not.toMatch(RAW_KEBAB_SLUGS);
    }

    // Graph desktop checks: zoom controls + low default edge opacity
    await page.goto('/graph/', { waitUntil: 'networkidle' });
    await expect(page.getByRole('button', { name: 'Zoom in' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Zoom out' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Reset zoom' })).toBeVisible();

    const firstEdgeOpacity = await page
      .locator('[data-testid^="graph-edge-"]')
      .first()
      .evaluate((el) => {
        const visiblePath = el.previousElementSibling ?? el;
        return getComputedStyle(visiblePath).opacity;
      });
    expect(Number(firstEdgeOpacity)).toBeLessThanOrEqual(0.1);
  });
});
