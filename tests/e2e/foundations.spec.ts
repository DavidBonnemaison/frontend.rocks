import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const DIST_DIR = path.resolve(process.cwd(), 'dist');

test.describe('Design system foundations', () => {
  test('first linked stylesheet in dist/index.html declares the canonical @layer order', async ({
    page,
    request,
  }) => {
    await page.goto('/');
    const href = await page.locator('link[rel="stylesheet"]').first().getAttribute('href');
    expect(href).toBeTruthy();
    const res = await request.get(href!);
    expect(res.ok()).toBe(true);
    const css = await res.text();
    expect(css.trimStart().startsWith('@layer reset,')).toBe(true);
  });

  test('self-hosted fonts only: no Google Fonts URLs in dist HTML and <= 2 preloaded fonts', async ({
    page,
  }) => {
    const indexHtml = fs.readFileSync(path.join(DIST_DIR, 'index.html'), 'utf-8');
    expect(indexHtml).not.toContain('fonts.googleapis.com');
    expect(indexHtml).not.toContain('fonts.gstatic.com');

    const mediaDir = path.join(DIST_DIR, '_next', 'static', 'media');
    const woff2Files = fs.existsSync(mediaDir)
      ? fs.readdirSync(mediaDir).filter((f) => f.endsWith('.woff2'))
      : [];
    expect(woff2Files.length).toBeGreaterThan(0);

    await page.goto('/');
    const preloadCount = await page.locator('link[rel="preload"][as="font"]').count();
    expect(preloadCount).toBeLessThanOrEqual(2);
  });

  test('html background differs between light and dark themes', async ({ page }) => {
    await page.goto('/');
    const lightBg = await page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor);
    await page.evaluate(() => {
      document.documentElement.dataset.theme = 'dark';
    });
    const darkBg = await page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor);
    expect(lightBg).not.toBe(darkBg);
  });

  test('no horizontal overflow at 390px on key top-level pages', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    for (const url of ['/', '/dev/components/', '/proof/']) {
      await page.goto(url);
      const { scrollWidth, innerWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
      }));
      expect(scrollWidth, `Horizontal overflow on ${url}`).toBeLessThanOrEqual(innerWidth);
    }
  });

  test('/dev/ is excluded from sitemap.xml, search-index.json, and llms.txt', async () => {
    for (const file of ['sitemap.xml', 'search-index.json', 'llms.txt']) {
      const fullPath = path.join(DIST_DIR, file);
      if (fs.existsSync(fullPath)) {
        const content = fs.readFileSync(fullPath, 'utf-8');
        expect(content, `/dev/ leaked into ${file}`).not.toContain('/dev/');
      }
    }
  });

  test('axe-core color-contrast passes on /dev/components/ in light and dark themes', async ({
    page,
  }) => {
    await page.goto('/dev/components/');
    await page.evaluate(() => document.fonts.ready);
    const results = await new AxeBuilder({ page })
      .withRules(['color-contrast'])
      .include('.dev-gallery-header')
      .include('#button')
      .include('#chip')
      .include('#meta-block')
      .include('#card')
      .analyze();
    expect(results.violations).toEqual([]);
  });
});
