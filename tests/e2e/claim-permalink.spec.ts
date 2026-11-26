import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from './fixtures';

interface PublicClaimsExport {
  claims: Array<{
    id: string;
    url: string;
    proof: { kind: string };
  }>;
}

const DIST_DIR = path.resolve(process.cwd(), 'dist');
const DIST_CLAIMS_JSON = path.join(DIST_DIR, 'data', 'claims.json');
const DIST_CLAIMS_DIR = path.join(DIST_DIR, 'claims');

function listGeneratedClaimHtmlFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  const walk = (cur: string) => {
    for (const entry of fs.readdirSync(cur, { withFileTypes: true })) {
      const full = path.join(cur, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name === 'index.html') out.push(full);
    }
  };
  walk(dir);
  return out;
}

test.describe('claim permalinks', () => {
  test('dist/claims matches dist/data/claims.json and never emits ClaimReview', async ({
    page,
  }) => {
    const htmlFiles = listGeneratedClaimHtmlFiles(DIST_CLAIMS_DIR);
    for (const file of htmlFiles) {
      const html = fs.readFileSync(file, 'utf-8');
      expect(html, `ClaimReview forbidden in ${file}`).not.toContain('ClaimReview');
    }

    if (!fs.existsSync(DIST_CLAIMS_JSON)) {
      test.info().annotations.push({ type: 'note', description: 'dist/data/claims.json missing' });
      return;
    }

    const data = JSON.parse(fs.readFileSync(DIST_CLAIMS_JSON, 'utf-8')) as PublicClaimsExport;
    if (data.claims.length === 0) {
      // Placeholder /_/_/ must exist and be noindex
      await page.goto('/claims/_/_/');
      await expect(page.getByTestId('claim-permalink')).toContainText('No published claims yet.');
      const robots = await page.locator('meta[name="robots"]').getAttribute('content');
      expect(robots).toContain('noindex');
      return;
    }

    const expectedPaths = new Set(
      data.claims.map((c) => {
        const [p, s] = c.id.split('/');
        return path.join(DIST_CLAIMS_DIR, p, s, 'index.html');
      })
    );
    expect(new Set(htmlFiles)).toEqual(expectedPaths);

    // Visit one sample claim of each proof kind present.
    const seenKinds = new Set<string>();
    for (const claim of data.claims) {
      if (seenKinds.has(claim.proof.kind)) continue;
      seenKinds.add(claim.proof.kind);
      const u = new URL(claim.url);
      await page.goto(u.pathname);
      await expect(page.getByTestId('claim-permalink')).toBeVisible();
      const ldText = await page.locator('script[type="application/ld+json"]').textContent();
      expect(ldText).toBeTruthy();
      expect(ldText).not.toContain('ClaimReview');
      const ld = JSON.parse(ldText!);
      expect(ld['@type']).toBe('WebPage');
    }
  });
});
