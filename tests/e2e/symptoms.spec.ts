import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { getAllSymptoms } from '../../src/lib/symptoms/loader';

test.describe('Symptom pages (US-35.6)', () => {
  test('renders the symptoms index and detail page for migrated MDX symptoms', async ({ page }) => {
    const symptoms = getAllSymptoms();
    expect(symptoms.length).toBe(25);

    await page.goto('/symptoms/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    // Renamed symptom slug is accessible at its new canonical URL
    await page.goto('/symptoms/double-charge-on-double-click/');
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/double-click/i);
    await expect(page.locator('#likely-causes-heading')).toBeVisible();

    // If any proven symptom exists, verify its signature block is populated
    const proven = symptoms.find((s) => s.frontmatter.proof_status === 'proven');
    if (proven) {
      await page.goto(`/symptoms/${proven.frontmatter.id}/`);
      const sig = page.getByTestId('symptom-signature');
      await expect(sig).toBeVisible();
      expect((await sig.innerText()).trim().length).toBeGreaterThan(0);
    }
  });

  test('dist/_redirects contains the 301 redirect for the renamed symptom', async () => {
    const redirectsPath = path.resolve(process.cwd(), 'dist', '_redirects');
    expect(fs.existsSync(redirectsPath)).toBe(true);
    const content = fs.readFileSync(redirectsPath, 'utf-8');
    expect(content).toContain(
      '/symptoms/double-payment-race-condition/ /symptoms/double-charge-on-double-click/ 301'
    );
  });
});
