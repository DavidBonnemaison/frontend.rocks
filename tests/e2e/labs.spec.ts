import fs from 'fs';
import path from 'path';
import { test, expect } from './fixtures';

const CONCEPTS_DIR = path.join(process.cwd(), 'content', 'concepts');
const conceptIds = fs
  .readdirSync(CONCEPTS_DIR)
  .filter((f) => f.endsWith('.mdx') || f.endsWith('.md'))
  .map((f) => f.replace(/\.mdx?$/, ''))
  .sort();

const ALIGNED_SLUGS = [
  'browser-rendering-pipeline',
  'css-stacking-context',
  'gpu-compositor-layers',
  'event-loop-tasks-microtasks',
];

for (const slug of ALIGNED_SLUGS) {
  if (!conceptIds.includes(slug)) {
    throw new Error(`Expected aligned concept slug "${slug}" in content/concepts`);
  }
}

for (const id of conceptIds) {
  test.describe(`Interactive Lab & Layout — ${id}`, () => {
    test(`zero console errors, zero horizontal overflow (desktop & mobile), interactive controls & screenshots${ALIGNED_SLUGS.includes(id) ? ' @smoke' : ''}`, async ({
      page,
    }) => {
      const consoleErrors: string[] = [];
      page.on('console', (msg) => {
        if (msg.type() === 'error') consoleErrors.push(msg.text());
      });
      page.on('pageerror', (err) => {
        consoleErrors.push(err.message);
      });

      const shotDir = path.join(process.cwd(), 'artifacts', 'screenshots', id);
      fs.mkdirSync(shotDir, { recursive: true });

      await page.setViewportSize({ width: 1280, height: 800 });
      await page.goto(`/concepts/${id}/`, { waitUntil: 'networkidle' });

      const desktopOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth
      );
      expect(desktopOverflow, 'Desktop horizontal overflow').toBe(false);

      await page.screenshot({ path: path.join(shotDir, 'initial.png'), fullPage: false });

      const stepMachine = page.getByTestId('lab-step-machine');
      const comparator = page.getByTestId('lab-pattern-comparator');
      const simulator = page.getByTestId('lab-constraint-simulator');

      if ((await stepMachine.count()) > 0) {
        const nextBtn = page.getByTestId('lab-next');
        while (await nextBtn.isEnabled()) {
          await nextBtn.click();
        }
        await page.screenshot({ path: path.join(shotDir, 'intermediate.png'), fullPage: false });
        await page.getByTestId('lab-reset').click();
      } else if ((await comparator.count()) > 0) {
        await page.getByRole('button', { name: 'Before', exact: true }).click();
        await page.screenshot({ path: path.join(shotDir, 'intermediate.png'), fullPage: false });
        await page.getByRole('button', { name: 'After', exact: true }).click();
        await page.getByTestId('lab-reset').click();
      } else if ((await simulator.count()) > 0) {
        const switches = simulator.locator('button[role="switch"]');
        if ((await switches.count()) > 0) {
          const firstSwitch = switches.first();
          await expect(firstSwitch).toHaveText(/^(On|Off)$/);
          await firstSwitch.click();
          await expect(firstSwitch).toHaveText(/^(On|Off)$/);
        }
        const ranges = simulator.locator('input[type="range"]');
        if ((await ranges.count()) > 0) {
          const maxVal = (await ranges.first().getAttribute('max')) ?? '100';
          await ranges.first().fill(maxVal);
        }
        await page.screenshot({ path: path.join(shotDir, 'intermediate.png'), fullPage: false });
        await page.getByTestId('lab-reset').click();
      }

      await page.screenshot({ path: path.join(shotDir, 'final.png'), fullPage: false });

      await page.setViewportSize({ width: 390, height: 844 });
      const mobileOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth
      );
      expect(mobileOverflow, 'Mobile horizontal overflow').toBe(false);

      expect(consoleErrors, `Console/Page errors on ${id}`).toEqual([]);
    });
  });
}

test.describe('Lab behaviours', () => {
  test('keeps the step machine inspector inside the mobile viewport @smoke', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/concepts/event-loop-tasks-microtasks/', { waitUntil: 'networkidle' });

    const lab = page.getByTestId('lab-step-machine');
    await expect(lab).toBeVisible();

    // Advance to step 2 to trigger state modification highlight
    await page.getByTestId('lab-next').click();

    const labOverflow = await lab.evaluate((el) => el.scrollWidth > el.clientWidth);
    expect(labOverflow, 'StepMachineLab horizontal overflow on 390px').toBe(false);
  });

  test('renders the sandboxed live lab and updates it from its controls', async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => consoleErrors.push(err.message));

    await page.goto('/concepts/block-formatting-context/');

    const iframe = page.locator('iframe[sandbox="allow-scripts"]').first();
    await expect(iframe).toBeVisible();
    await expect(iframe).toHaveAttribute('sandbox', 'allow-scripts');

    const initialSrcDoc = await iframe.getAttribute('srcdoc');
    expect(initialSrcDoc).toBeTruthy();

    // Toggle a control inside the sandbox lab and verify srcDoc updates deterministically
    const toggleBtn = page.locator('button[role="switch"]').first();
    await expect(toggleBtn).toBeVisible();
    await toggleBtn.click();

    const updatedSrcDoc = await iframe.getAttribute('srcdoc');
    expect(updatedSrcDoc).toBeTruthy();
    expect(updatedSrcDoc).not.toBe(initialSrcDoc);

    // Verify /embed/lab/[lab_id]/ also renders cleanly
    await page.goto('/embed/lab/block-formatting-context/');
    await expect(page.locator('iframe[sandbox="allow-scripts"]').first()).toBeVisible();

    expect(consoleErrors).toEqual([]);
  });
});
