import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from './fixtures';

interface PublicClaimsExport {
  claims: Array<{
    id: string;
    page: string;
  }>;
}

const DIST_CLAIMS_PATH = path.resolve(process.cwd(), 'dist', 'data', 'claims.json');

function loadPublishedPages(): Array<{ pathname: string; claimCount: number }> {
  if (!fs.existsSync(DIST_CLAIMS_PATH)) return [];
  const data = JSON.parse(fs.readFileSync(DIST_CLAIMS_PATH, 'utf-8')) as PublicClaimsExport;
  const counts = new Map<string, number>();
  for (const c of data.claims) {
    const u = new URL(c.page);
    counts.set(u.pathname, (counts.get(u.pathname) ?? 0) + 1);
  }
  return [...counts.entries()].map(([pathname, claimCount]) => ({ pathname, claimCount }));
}

test.describe('proof receipts on published pages', () => {
  test('every published page renders proof chip and panel without browser brand names', async ({
    page,
  }) => {
    const pages = loadPublishedPages();
    if (pages.length === 0) {
      test.info().annotations.push({ type: 'note', description: 'no proven page yet' });
      return;
    }

    for (const { pathname, claimCount } of pages) {
      await page.goto(pathname);
      const chip = page.getByTestId('proof-chip');
      const panel = page.getByTestId('proof-panel');
      await expect(chip).toBeVisible();
      await expect(panel).toBeVisible();
      await expect(panel.getByTestId('proof-row')).toHaveCount(claimCount);

      const chipText = await chip.innerText();
      const panelText = await panel.innerText();
      expect(chipText).not.toMatch(/\b(Safari|Chrome|Edge)\b/);
      expect(panelText).not.toMatch(/\b(Safari|Chrome|Edge)\b/);

      await chip.click();
      await expect(page).toHaveURL(/#proof$/);
    }
  });

  test('unverified concept pages render neither proof-chip nor proof-panel', async ({ page }) => {
    await page.goto('/concepts/browser-rendering-pipeline/');
    const publishedPages = new Set(loadPublishedPages().map((p) => p.pathname));
    if (publishedPages.has('/concepts/browser-rendering-pipeline/')) {
      return;
    }
    await expect(page.getByTestId('proof-chip')).toHaveCount(0);
    await expect(page.getByTestId('proof-panel')).toHaveCount(0);
  });
});
