import { test, expect } from './fixtures';
import fs from 'node:fs';
import path from 'node:path';
import { getFeaturedSymptoms } from '../../src/lib/symptoms/loader';

const AUTOPSY_COUNT = fs
  .readdirSync(path.join(process.cwd(), 'content', 'autopsies'))
  .filter((f) => f.endsWith('.mdx') || f.endsWith('.md')).length;

test.describe('Home page', () => {
  test('shows full path summaries on the mobile home page @smoke', async ({ page }) => {
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
  });

  test('lists the featured symptoms on the home page and links to the symptom page', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/', { waitUntil: 'networkidle' });

    // 2. Door B fed from content/symptoms linking to /symptoms/<slug>/
    const featuredSymptom = getFeaturedSymptoms()[0];
    const symptomRows = page.locator('.home-symptom-row');
    await expect(symptomRows).toHaveCount(getFeaturedSymptoms().length);
    const firstSymptomRow = symptomRows.first();
    await expect(firstSymptomRow).toHaveAttribute('href', `/symptoms/${featuredSymptom.frontmatter.id}/`);

    const browseAllSymptoms = page.getByRole('link', {
      name: /Browse all production symptoms/i,
    });
    await expect(browseAllSymptoms).toBeVisible();
    await expect(browseAllSymptoms).toHaveAttribute('href', '/symptoms/');

    // 3. Dynamic Autopsy counter (matches the number of files in content/autopsies)
    const browseAllAutopsies = page.getByRole('link', {
      name: new RegExp(`Browse all ${AUTOPSY_COUNT} Architecture Autopsies`, 'i'),
    });
    await expect(browseAllAutopsies).toBeVisible();

    // 4. Click first Door B symptom row -> lands on its symptom page
    await firstSymptomRow.click();
    await expect(page).toHaveURL(new RegExp(`/symptoms/${featuredSymptom.frontmatter.id}/$`));
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();


    expect(errors).toEqual([]);
  });
});
