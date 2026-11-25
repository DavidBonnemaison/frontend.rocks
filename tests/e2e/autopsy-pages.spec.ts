import { test, expect } from './fixtures';
import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';

const AUTOPSY_IDS = fs
  .readdirSync(path.join(process.cwd(), 'content', 'autopsies'))
  .filter((f) => f.endsWith('.mdx'))
  .map((f) => f.replace(/\.mdx$/, ''))
  .sort();
const DETAIL_AUTOPSY = AUTOPSY_IDS[0];

const AUTOPSY_ROUTES = [
  '/autopsies/useeffect-dependency-loop-ddos/',
  '/autopsies/fourteen-rerenders-one-click/',
  '/autopsies/zindex-9999-tooltip-war/',
];

const VIEWPORTS = [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
];

function frontmatterOf(kind: 'autopsies' | 'concepts', id: string) {
  const raw = fs.readFileSync(path.join(process.cwd(), 'content', kind, `${id}.mdx`), 'utf-8');
  return matter(raw).data as {
    case_number: number;
    lab_id?: string;
    traversed_concepts: { concept_id: string; step_order: number }[];
  };
}

function labOf(labId: string) {
  return JSON.parse(
    fs.readFileSync(path.join(process.cwd(), 'content', 'labs', `${labId}.json`), 'utf-8'),
  ) as { type: string; steps: unknown[] };
}

test.describe('Autopsy pages', () => {
  test('renders the stepper, the lab, the fix section and no horizontal overflow @smoke', async ({
    page,
  }) => {
    const route = `/autopsies/${DETAIL_AUTOPSY}/`;
    const stepCount = frontmatterOf('autopsies', DETAIL_AUTOPSY).traversed_concepts.length;

    // Desktop 1440x900
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(route, { waitUntil: 'networkidle' });

    const stepper = page.getByTestId('causal-chain-stepper');
    await expect(stepper).toBeVisible();
    const stepLinks = stepper.locator('a.causal-step-title');
    await expect(stepLinks).toHaveCount(stepCount);
    for (let i = 0; i < stepCount; i++) {
      await expect(stepLinks.nth(i)).toHaveAttribute('href', /^\/concepts\/[a-z0-9-]+\/?$/);
    }

    const labSection = page.locator('#lab');
    await expect(labSection).toBeVisible();

    const fixSection = page.getByTestId('architectural-fix-section');
    await expect(fixSection).toBeVisible();
    await expect(fixSection.locator('h2')).toBeVisible();
    await expect(fixSection).toContainText('Case file');
    await expect(fixSection).toContainText('Root cause');

    const desktopOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth
    );
    expect(desktopOverflow, 'Horizontal overflow on 1440x900').toBe(false);

    // Mobile 390x844
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(route, { waitUntil: 'networkidle' });

    await expect(page.getByTestId('causal-chain-stepper')).toBeVisible();
    await expect(page.locator('#lab')).toBeVisible();
    await expect(page.getByTestId('architectural-fix-section')).toBeVisible();

    const mobileOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth
    );
    expect(mobileOverflow, 'Horizontal overflow on 390x844').toBe(false);
  });

  test('renders the composite note, the narrative chapters, the stepper, the lab and the case file on desktop and mobile', async ({
    page,
  }) => {

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

  test('lets the reader pick a wrong patch, then the root cause, in the DevTools detective', async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => consoleErrors.push(err.message));

    await page.goto('/autopsies/zindex-9999-tooltip-war/');

    const detective = page.getByTestId('devtools-detective');
    await expect(detective).toBeVisible();

    const options = detective.getByTestId('detective-option');
    const optionCount = await options.count();
    expect(optionCount).toBeGreaterThanOrEqual(3);
    expect(optionCount).toBeLessThanOrEqual(4);

    // Click a distractor (bad_fix) first
    const wrongOption = detective
      .locator('[data-testid="detective-option"][data-is-root-cause="false"]')
      .first();
    await wrongOption.click();
    await expect(wrongOption).toHaveAttribute('aria-pressed', 'true');

    const feedback = detective.getByTestId('detective-feedback');
    await expect(feedback).toContainText('Patch failed');
    await expect(detective.getByTestId('detective-reveal')).toBeVisible();

    // Now click the true root cause
    const rootCauseOption = detective
      .locator('[data-testid="detective-option"][data-is-root-cause="true"]')
      .first();
    await rootCauseOption.click();
    await expect(rootCauseOption).toHaveAttribute('aria-pressed', 'true');
    await expect(feedback).toContainText('Root cause confirmed');

    const causalLink = detective.getByTestId('detective-link-causal-chain');
    await expect(causalLink).toHaveAttribute('href', '#causal-chain');
    await expect(page.locator('#causal-chain')).toBeAttached();

    const simLink = detective.getByTestId('detective-link-failure-simulator');
    if ((await simLink.count()) > 0) {
      await expect(simLink).toHaveAttribute('href', '#failure-simulator');
      await expect(page.locator('#failure-simulator')).toBeAttached();
    }

    expect(consoleErrors).toEqual([]);
  });

  test('shows the case number of an autopsy', async ({ page }) => {
    const id = 'indexeddb-versionchange-deadlock';
    const caseNumber = frontmatterOf('autopsies', id).case_number;
    await page.goto(`/autopsies/${id}/`, { waitUntil: 'networkidle' });
    await expect(page.getByText(new RegExp(`Case #${caseNumber}`, 'i')).first()).toBeVisible();
  });

  for (const id of AUTOPSY_IDS) {
    test(`renders the stepper and the lab of ${id}, and walks the lab to its last step`, async ({ page }) => {
      const fm = frontmatterOf('autopsies', id);
      const lab = labOf(fm.lab_id ?? id);

      for (const viewport of [
        { width: 1440, height: 900 },
        { width: 390, height: 844 },
      ]) {
        await page.setViewportSize(viewport);
        await page.goto(`/autopsies/${id}/`, { waitUntil: 'networkidle' });
        await expect(page.getByTestId('causal-chain-stepper')).toBeVisible();
        await expect(page.locator('#lab')).toBeVisible();
        const hasOverflow = await page.evaluate(
          () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
        );
        expect(hasOverflow, `Horizontal overflow on ${id} at ${viewport.width}px`).toBe(false);
      }

      if (lab.type === 'step-machine') {
        const next = page.locator('#lab').getByTestId('lab-next');
        for (let step = 1; step < lab.steps.length; step += 1) {
          await expect(next).toBeEnabled();
          await next.click();
        }
        await expect(next).toBeDisabled();
      }
    });

    test(`lists ${id} in the seen-in-autopsies block of its first traversed concept`, async ({ page }) => {
      const fm = frontmatterOf('autopsies', id);
      const [first] = [...fm.traversed_concepts].sort((a, b) => a.step_order - b.step_order);
      await page.goto(`/concepts/${first.concept_id}/`, { waitUntil: 'networkidle' });
      await expect(
        page.getByTestId('seen-in-autopsies').locator(`a[href*="/autopsies/${id}"]`).first(),
      ).toBeVisible();
    });
  }
});
