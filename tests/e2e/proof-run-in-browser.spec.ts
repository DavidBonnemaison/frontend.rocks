import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from './fixtures';

interface PublicClaimsExport {
  claims: Array<{
    id: string;
    page: string;
    type: string;
    proof: { kind: string; experimentId?: string };
  }>;
}

const DIST_CLAIMS_PATH = path.resolve(process.cwd(), 'dist', 'data', 'claims.json');

function findFirstPublishedExperimentPage(): string | null {
  if (!fs.existsSync(DIST_CLAIMS_PATH)) return null;
  const data = JSON.parse(fs.readFileSync(DIST_CLAIMS_PATH, 'utf-8')) as PublicClaimsExport;
  const match = data.claims.find((c) => c.type === 'observable' && c.proof.kind === 'experiment');
  if (!match) return null;
  return new URL(match.page).pathname;
}

test.describe('in-browser proof runner', () => {
  test('lazy-loads runtime only on click and confirms runnable experiments', async ({ page }) => {
    const pathname = findFirstPublishedExperimentPage();
    if (!pathname) {
      test.info().annotations.push({
        type: 'note',
        description: 'no published page with observable experiment yet',
      });
      return;
    }

    const requestedUrls: string[] = [];
    page.on('request', (req) => requestedUrls.push(req.url()));

    await page.addInitScript(() => {
      window.localStorage.setItem('fr-analytics-debug', '1');
    });

    await page.goto(pathname);
    const button = page.getByTestId('run-proofs-button');
    if ((await button.count()) === 0) {
      test.info().annotations.push({
        type: 'note',
        description: 'no runnable experiment on first published page',
      });
      return;
    }

    // Runtime chunk must not be requested before click.
    expect(requestedUrls.some((u) => /proof\/runtime|runtime\/browser/i.test(u))).toBe(false);

    await button.click();
    const result = page.getByTestId('run-proofs-result');
    await expect(result).toBeVisible({ timeout: 30_000 });
    await expect(result).toContainText(/\d+\/\d+ confirmed in your browser/);

    const events = await page.evaluate(() => window.__frAnalyticsDebug ?? []);
    const runEvents = events.filter((e) => e.path.startsWith('proof_run_in_browser'));
    expect(runEvents).toHaveLength(1);
    expect(runEvents[0].path).toMatch(
      /^proof_run_in_browser;engine=(blink|gecko|webkit|unknown);outcome=(all-confirmed|some-failed)$/
    );
  });
});
