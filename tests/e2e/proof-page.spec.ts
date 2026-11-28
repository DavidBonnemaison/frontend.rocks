import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from './fixtures';

const DIST_DIR = path.resolve(process.cwd(), 'dist');
const DIST_PROOF_HTML = path.join(DIST_DIR, 'proof', 'index.html');
const DIST_RESULTS_JSON = path.join(DIST_DIR, 'data', 'results.json');

test.describe('/proof page', () => {
  test('renders live stats matching results.json, Dataset JSON-LD, required notices, and no production terms', async ({
    page,
  }) => {
    expect(fs.existsSync(DIST_PROOF_HTML)).toBe(true);
    const rawHtml = fs.readFileSync(DIST_PROOF_HTML, 'utf-8');

    for (const forbidden of ['Gemini', 'prompt', 'pipeline', 'queue', '.agents']) {
      expect(rawHtml.toLowerCase(), `forbidden term "${forbidden}" in /proof`).not.toContain(
        forbidden.toLowerCase()
      );
    }

    await page.goto('/proof/');

    await expect(page.getByRole('heading', { level: 1, name: 'How proofs work' })).toBeVisible();
    await expect(page.locator('body')).toContainText(
      'WebKit here is the WebKit build shipped with Playwright. It is not Safari. Safari support shown on concept pages comes from MDN browser-compat-data.'
    );
    await expect(page.locator('body')).toContainText(
      'Content is produced elsewhere and arrives here through pull requests that must pass the same public checks as any contribution.'
    );

    const stats = page.getByTestId('proof-stats');
    await expect(stats).toBeVisible();

    if (fs.existsSync(DIST_RESULTS_JSON)) {
      const exported = JSON.parse(fs.readFileSync(DIST_RESULTS_JSON, 'utf-8')) as {
        claims: Record<string, { status: string }>;
        experiments: Record<string, unknown>;
      };
      const expectedClaims = Object.keys(exported.claims).length;
      const expectedExperiments = Object.keys(exported.experiments).length;

      await expect(stats.locator('[data-stat="total-claims"]')).toHaveText(String(expectedClaims));
      await expect(stats.locator('[data-stat="experiments"]')).toHaveText(
        String(expectedExperiments)
      );
    }

    const ldText = await page.locator('script[type="application/ld+json"]').textContent();
    expect(ldText).toBeTruthy();
    expect(ldText).not.toContain('ClaimReview');
    const ld = JSON.parse(ldText!);
    expect(ld['@type']).toBe('Dataset');
    expect(Array.isArray(ld.distribution)).toBe(true);
    expect(ld.distribution).toHaveLength(2);

    const summaryPath = path.resolve(process.cwd(), 'content', 'recertification', 'summary.json');
    if (fs.existsSync(summaryPath)) {
      const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf-8')) as {
        pagesMerged: number;
        pagesDeleted: number;
        claims: { proven: number; narrowed: number; dropped: number };
      };
      const recertSection = page.getByTestId('recertification-stats');
      await expect(recertSection).toBeVisible();
      await expect(recertSection).toContainText(
        `${summary.claims.proven + summary.claims.narrowed} claims survived`,
      );
      await expect(recertSection).toContainText(`${summary.claims.dropped} were deleted`);
      await expect(recertSection).toContainText(
        `${summary.pagesMerged} pages were merged into a neighbour, ${summary.pagesDeleted} were retired.`,
      );
    }
  });
});
