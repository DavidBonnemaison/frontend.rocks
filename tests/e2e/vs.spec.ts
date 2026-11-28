import { expect, test } from '@playwright/test';
import { loadVsPairEntries } from '../../src/lib/vs-pairs';

test.describe('Comparison /vs/ pages (US-35.7)', () => {
  test('renders the /vs/ hub and, when pairs.json has proven pairs, displays side-by-side experiment variants', async ({
    page,
  }) => {
    await page.goto('/vs/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    const provenEntry = loadVsPairEntries().find((p) => p.proof_status === 'proven');
    if (provenEntry) {
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.goto(`/vs/${provenEntry.slug}/`, { waitUntil: 'networkidle' });
      await expect(page.getByText(provenEntry.question)).toBeVisible();
      await expect(page.locator('[data-side-by-side="true"]')).toBeVisible();
    }
  });
});
