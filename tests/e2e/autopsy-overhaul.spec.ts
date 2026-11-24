import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from '@playwright/test';

const AUTOPSY_ROUTES = [
  '/autopsies/useeffect-dependency-loop-ddos/',
  '/autopsies/fourteen-rerenders-one-click/',
  '/autopsies/zindex-9999-tooltip-war/',
];

const VIEWPORTS = [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
];

test.describe('Architecture Autopsies Visual & Narrative Overhaul', () => {
  test('renders composite note, 6+ narrative chapters, stepper, lab, and case file at 1440x900 and 390x844', async ({
    page,
  }) => {
    await page.route('https://static.cloudflareinsights.com/**', (route) => route.abort());

    for (const viewport of VIEWPORTS) {
      await page.setViewportSize(viewport);

      // Index page check
      await page.goto('/autopsies/', { waitUntil: 'networkidle' });
      const indexOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth
      );
      expect(indexOverflow).toBe(false);

      for (const route of AUTOPSY_ROUTES) {
        await page.goto(route, { waitUntil: 'networkidle' });

        // 1. Zero horizontal overflow
        const hasOverflow = await page.evaluate(
          () => document.documentElement.scrollWidth > document.documentElement.clientWidth
        );
        expect(hasOverflow, `Overflow on ${route} at ${viewport.width}x${viewport.height}`).toBe(
          false
        );

        // 2. Composite case note
        await expect(page.getByTestId('composite-case-note')).toBeVisible();

        // 3. Free-form narrative chapters (>= 6 h2s)
        const narrativeHeadings = page.locator('#incident-report h2');
        expect(await narrativeHeadings.count()).toBeGreaterThanOrEqual(6);

        // 4. Inline CausalChainStepper, FailureSimulator (#lab), and CaseFileCard
        await expect(page.getByTestId('causal-chain-stepper')).toBeVisible();
        await expect(page.locator('#lab')).toBeVisible();
        await expect(page.getByTestId('case-file-card')).toBeVisible();
        await expect(page.getByTestId('architectural-fix-section')).toBeVisible();
      }
    }
  });

  test('verifies 1000x420 cover PNGs and mobile og/labs/*-preview.png exist in public/ and dist/ for all 13 autopsies', async () => {
    const repoRoot = path.resolve(process.cwd());
    const autopsyFiles = fs
      .readdirSync(path.join(repoRoot, 'content/autopsies'))
      .filter((f) => f.endsWith('.mdx'));

    expect(autopsyFiles.length).toBeGreaterThanOrEqual(13);

    for (const file of autopsyFiles) {
      const slug = file.replace(/\.mdx$/, '');
      const publicPng = path.join(repoRoot, 'public/og/labs', `${slug}-preview.png`);
      const distPng = path.join(repoRoot, 'dist/og/labs', `${slug}-preview.png`);

      expect(fs.existsSync(publicPng), `Missing ${publicPng}`).toBe(true);
      expect(fs.existsSync(distPng), `Missing ${distPng}`).toBe(true);
      expect(fs.statSync(publicPng).size).toBeGreaterThan(5000);

      const publicCover = path.join(repoRoot, 'public/og/autopsies', `${slug}-cover.png`);
      const distCover = path.join(repoRoot, 'dist/og/autopsies', `${slug}-cover.png`);
      expect(fs.existsSync(publicCover), `Missing ${publicCover}`).toBe(true);
      expect(fs.existsSync(distCover), `Missing ${distCover}`).toBe(true);

      const buf = fs.readFileSync(distCover);
      expect(buf.readUInt32BE(16)).toBe(1000);
      expect(buf.readUInt32BE(20)).toBe(420);
    }
  });
});
