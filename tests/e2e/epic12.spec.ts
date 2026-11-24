import { test, expect } from '@playwright/test';

const TARGET_ROUTES = [
  '/',
  '/graph/',
  '/digest/',
  '/obsolescence/',
  '/concepts/event-loop-tasks-microtasks/',
];

const RAW_KEBAB_SLUGS =
  /\b(obsolescence-alert|spec-update|browser-release|deep-dive|baseline-widely|baseline-newly|interop-experimental|legacy-pattern)\b/;

test.describe('EPIC-12: Mobile UX, Semantic Tokens, Graph Readability & Typographic Hygiene', () => {
  test('validates zero horizontal overflow, compact mobile header, and zero raw -> or kebab-case slugs on 390x844', async ({
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

  test('validates desktop 1440x900 routes, zero raw -> or kebab-case slugs, and graph progressive edges', async ({
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

  test('validates /graph mobile Domain Groups view and /obsolescence single-line badges on 390x844', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });

    // /graph mobile Domain Groups
    await page.goto('/graph/', { waitUntil: 'networkidle' });
    const domainBtn = page.getByTestId('graph-mode-domains');
    await expect(domainBtn).toBeVisible();
    await domainBtn.click();
    const domainAccordions = page.locator('[data-testid^="domain-group-"]');
    await expect(domainAccordions).toHaveCount(11);

    // /obsolescence badges do not wrap onto 2 lines
    await page.goto('/obsolescence/', { waitUntil: 'networkidle' });
    const badges = page.locator('.badge');
    const count = await badges.count();
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < Math.min(count, 20); i++) {
      const h = await badges.nth(i).evaluate((el) => el.getBoundingClientRect().height);
      expect(h, `Badge ${i} wrapped onto multiple lines`).toBeLessThanOrEqual(32);
    }
  });

  test('validates StepMachineLab memory inspector and code wrapping on 390x844', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/concepts/event-loop-tasks-microtasks/', { waitUntil: 'networkidle' });

    const lab = page.getByTestId('lab-step-machine');
    await expect(lab).toBeVisible();

    // Advance to step 2 to trigger state modification highlight
    await page.getByTestId('lab-next').click();

    const labOverflow = await lab.evaluate((el) => el.scrollWidth > el.clientWidth);
    expect(labOverflow, 'StepMachineLab horizontal overflow on 390px').toBe(false);
  });

  test('validates polish adjustments: graph fit-to-width, home path non-truncation, mobile select alignment, digest inline icon', async ({
    page,
  }) => {
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

    // 2. Mobile / path descriptions not truncated
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/', { waitUntil: 'networkidle' });
    const summaries = page.locator('.home-path-summary');
    const summaryCount = await summaries.count();
    expect(summaryCount).toBeGreaterThan(0);
    for (let i = 0; i < summaryCount; i++) {
      const truncated = await summaries
        .nth(i)
        .evaluate((el) => el.scrollHeight > el.clientHeight + 2);
      expect(truncated, `Path summary ${i} truncated on 390px`).toBe(false);
    }

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

    // 4. Mobile /digest external icon flows inline right after the title text
    await page.goto('/digest/', { waitUntil: 'networkidle' });
    const iconInlineResult = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('main article a[target="_blank"]'));
      if (links.length === 0) return { ok: false, reason: 'no links' };
      for (const link of links) {
        const display = getComputedStyle(link).display;
        if (display.includes('flex') || display.includes('grid')) {
          return { ok: false, reason: `unexpected display ${display}` };
        }
        const svg = link.querySelector('svg');
        const textNode = Array.from(link.childNodes).find((n) => n.nodeType === Node.TEXT_NODE && n.textContent?.trim());
        if (!svg || !textNode) return { ok: false, reason: 'missing svg or text' };
        const range = document.createRange();
        range.selectNodeContents(textNode);
        const rects = range.getClientRects();
        const lastTextRect = rects[rects.length - 1];
        const svgRect = svg.getBoundingClientRect();
        if (!lastTextRect) return { ok: false, reason: 'no text rects' };
        const gap = svgRect.left - lastTextRect.right;
        const sameLine = Math.abs(svgRect.top - lastTextRect.top) <= lastTextRect.height;
        if (!sameLine || gap < -2 || gap > 16) {
          return { ok: false, reason: `gap=${gap}, sameLine=${sameLine}` };
        }
      }
      return { ok: true };
    });
    expect(iconInlineResult).toEqual({ ok: true });

    // 5. Verify /concepts/event-loop-tasks-microtasks/ at 390x844 & 1440x900
    await page.goto('/concepts/event-loop-tasks-microtasks/', { waitUntil: 'networkidle' });
    const mobileOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 2,
    );
    expect(mobileOverflow).toBe(false);

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/concepts/event-loop-tasks-microtasks/', { waitUntil: 'networkidle' });
    const desktopOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 2,
    );
    expect(desktopOverflow).toBe(false);
  });
});
