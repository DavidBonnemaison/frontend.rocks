import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from '@playwright/test';

const AUTOPSY_COUNT = fs
  .readdirSync(path.join(process.cwd(), 'content', 'autopsies'))
  .filter((f) => f.endsWith('.mdx') || f.endsWith('.md')).length;

test.describe('US-16.2: Unified Symptoms, Rationalized Navbar & Dynamic Autopsy Counter', () => {
  test('renders unified Door B symptoms linking to /symptoms/<slug>/, rationalized SiteHeader, Radar->Watch cross-link, and dynamic autopsy count', async ({
    page,
  }) => {
    const errors: string[] = [];
    await page.route('https://static.cloudflareinsights.com/**', (route) =>
      route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'application/javascript; charset=utf-8' },
        body: '/* stub */',
      })
    );
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/', { waitUntil: 'networkidle' });

    // 1. Rationalized SiteHeader navigation
    const desktopNav = page.getByRole('navigation', { name: 'Primary navigation' });
    const navLabels = await desktopNav.locator('a').allInnerTexts();
    expect(navLabels).toEqual(['Home', 'Autopsies', 'Symptoms', 'Diagnose', 'Concept Map', 'Index', 'Radar']);

    await expect(desktopNav.getByRole('link', { name: 'Symptoms' })).toHaveAttribute(
      'href',
      '/symptoms/'
    );
    await expect(desktopNav.getByRole('link', { name: 'Radar' })).toHaveAttribute(
      'href',
      '/obsolescence/'
    );

    // 2. Door B fed from PRODUCTION_SYMPTOMS linking to /symptoms/<slug>/
    const symptomRows = page.locator('.home-symptom-row');
    await expect(symptomRows).toHaveCount(6);
    const firstSymptomRow = symptomRows.first();
    await expect(firstSymptomRow).toHaveAttribute('href', '/symptoms/z-index-ignored/');

    const browseAllSymptoms = page.getByRole('link', {
      name: /Browse all production symptoms/i,
    });
    await expect(browseAllSymptoms).toBeVisible();
    await expect(browseAllSymptoms).toHaveAttribute('href', '/symptoms/');

    // 3. Dynamic Autopsy counter (matches content/autopsies count instead of hardcoded 12)
    const browseAllAutopsies = page.getByRole('link', {
      name: new RegExp(`Browse all ${AUTOPSY_COUNT} Architecture Autopsies`, 'i'),
    });
    await expect(browseAllAutopsies).toBeVisible();
    await expect(page.getByText(/Browse all 12 Architecture Autopsies/i)).toHaveCount(0);

    // 4. Click first Door B symptom row -> lands on /symptoms/z-index-ignored/
    await firstSymptomRow.click();
    await expect(page).toHaveURL(/\/symptoms\/z-index-ignored\/$/);
    await expect(
      page.getByRole('heading', { name: /z-index: 9999 is ignored/i })
    ).toBeVisible();

    // 5. Radar page has cross-link to Curated Watch (/digest/)
    await page.goto('/obsolescence/', { waitUntil: 'networkidle' });
    const watchCrossLink = page.getByRole('link', { name: /Read Curated Watch/i });
    await expect(watchCrossLink).toBeVisible();
    await expect(watchCrossLink).toHaveAttribute('href', '/digest/');

    // 6. Autopsy #14 (indexeddb-versionchange-deadlock) displays Case #14
    await page.goto('/autopsies/indexeddb-versionchange-deadlock/', { waitUntil: 'networkidle' });
    await expect(page.getByText(/Case #14/i).first()).toBeVisible();

    expect(errors).toEqual([]);
  });
});
