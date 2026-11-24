import { test, expect } from './fixtures';
import fs from 'node:fs';
import path from 'node:path';

const totalAutopsies = fs
  .readdirSync(path.join(process.cwd(), 'content', 'autopsies'))
  .filter((f) => f.endsWith('.mdx')).length;

test.describe('Listing pages', () => {
  test('lists every autopsy and filters by failure mode @smoke', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/autopsies/', { waitUntil: 'networkidle' });

    const cards = page.locator('main article');
    await expect(cards).toHaveCount(totalAutopsies);

    const filterGroup = page.getByRole('group', { name: 'Filter by failure mode' });
    const allBtn = filterGroup.getByRole('button', { name: /All Failure Modes/ });
    await expect(allBtn).toHaveAttribute('aria-pressed', 'true');

    // Filter by Silent Data Corruption
    const corruptionBtn = filterGroup.getByRole('button', { name: /Silent Data Corruption/ });
    await corruptionBtn.click();
    await expect(corruptionBtn).toHaveAttribute('aria-pressed', 'true');

    const corruptionCount = await cards.count();
    expect(corruptionCount).toBeGreaterThan(0);
    expect(corruptionCount).toBeLessThan(totalAutopsies);
    for (let i = 0; i < corruptionCount; i++) {
      await expect(cards.nth(i)).toContainText('Silent Data Corruption');
    }

    // Filter by Main-Thread Freeze
    const freezeBtn = filterGroup.getByRole('button', { name: /Main-Thread Freeze/ });
    await freezeBtn.click();
    await expect(freezeBtn).toHaveAttribute('aria-pressed', 'true');

    const freezeCount = await cards.count();
    expect(freezeCount).toBeGreaterThan(0);
    expect(freezeCount).toBeLessThan(totalAutopsies);
    for (let i = 0; i < freezeCount; i++) {
      await expect(cards.nth(i)).toContainText('Main-Thread Freeze');
    }

    // Reset filter
    await allBtn.click();
    await expect(cards).toHaveCount(totalAutopsies);
  });

  test('keeps /obsolescence badges on a single line at 390x844', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });

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

  test('flows the external-link icon inline on the mobile /digest', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
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
  });

  test('links the radar to the curated watch', async ({ page }) => {
    await page.goto('/obsolescence/', { waitUntil: 'networkidle' });
    const watchCrossLink = page.getByRole('link', { name: /Read Curated Watch/i });
    await expect(watchCrossLink).toBeVisible();
    await expect(watchCrossLink).toHaveAttribute('href', '/digest/');
  });
});
