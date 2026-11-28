import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from './fixtures';

interface SmokeExperiment {
  id: string;
  instrument: string;
}

function loadSmokeExperimentsFromDisk(): SmokeExperiment[] {
  const dir = path.join(process.cwd(), 'content', 'experiments');
  if (!fs.existsSync(dir)) return [];
  const out: SmokeExperiment[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const viewPath = path.join(dir, entry.name, 'view.json');
    if (!fs.existsSync(viewPath)) continue;
    const raw = JSON.parse(fs.readFileSync(viewPath, 'utf-8')) as {
      instrument?: string;
      smoke?: boolean;
    };
    if (raw.smoke === true && typeof raw.instrument === 'string') {
      out.push({ id: entry.name, instrument: raw.instrument });
    }
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

const SMOKE_EXPERIMENTS = loadSmokeExperimentsFromDisk();

test('smoke list covers required instruments from disk', { tag: '@smoke' }, async () => {
  const instruments = new Set(SMOKE_EXPERIMENTS.map((e) => e.instrument));
  for (const required of [
    'queue-view',
    'layer-stack',
    'diff-view',
    'frame-budget',
    'network-waterfall',
  ]) {
    expect(instruments.has(required)).toBe(true);
  }
});

for (const exp of SMOKE_EXPERIMENTS) {
  test(
    `smoke: experiment lab renders ${exp.id} (${exp.instrument})`,
    { tag: '@smoke' },
    async ({ page }) => {
      const pageErrors: string[] = [];
      page.on('pageerror', (err) => pageErrors.push(err.message));

      await page.goto(`/experiments/${exp.id}/`);
      const lab = page.getByTestId('experiment-lab');
      await expect(lab).toBeVisible({ timeout: 15_000 });
      await expect(lab).toHaveAttribute('data-experiment-id', exp.id);
      await expect(page.getByTestId('experiment-readouts')).toBeVisible();
      expect(pageErrors).toEqual([]);
    },
  );
}

test('container-query-inline-size updates observation when slider changes and has CLS < 0.01', async ({
  page,
}) => {
  await page.addInitScript(() => {
    (window as unknown as { __cls?: number }).__cls = 0;
    if (typeof PerformanceObserver !== 'undefined') {
      try {
        const po = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            const ls = entry as PerformanceEntry & { hadRecentInput?: boolean; value?: number };
            if (!ls.hadRecentInput && typeof ls.value === 'number') {
              (window as unknown as { __cls: number }).__cls += ls.value;
            }
          }
        });
        po.observe({ type: 'layout-shift', buffered: true });
      } catch {
        // Ignore on engines without layout-shift support.
      }
    }
  });

  await page.goto('/experiments/container-query-inline-size/');
  await expect(page.getByTestId('experiment-observed-treatment')).toHaveAttribute(
    'data-status',
    'ok',
    { timeout: 15_000 },
  );
  await expect(page.getByTestId('experiment-observed-treatment')).toContainText('"columns": 2');

  const cls = await page.evaluate(() => (window as unknown as { __cls?: number }).__cls ?? 0);
  expect(cls).toBeLessThan(0.01);

  await page.getByTestId('experiment-param-w').evaluate((el: HTMLInputElement, v) => {
    el.value = v;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }, '300');

  await expect(page.getByTestId('experiment-observed-treatment')).toContainText('"columns": 1', {
    timeout: 15_000,
  });
});

test('served HTML without JS contains panel, question, and controls', async ({ request }) => {
  const res = await request.get('/experiments/container-query-inline-size/');
  expect(res.ok()).toBe(true);
  const html = await res.text();
  expect(html).toContain('container-query-inline-size');
  expect(html).toContain('Does the card switch to two columns');
  expect(html).toContain('experiment-param-w');
});

test('under 720px viewport only a single iframe is mounted', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/experiments/container-query-inline-size/');
  await expect(page.getByTestId('experiment-observed-treatment')).toHaveAttribute(
    'data-status',
    'ok',
    { timeout: 15_000 },
  );
  const iframeCount = await page.locator('[data-testid="experiment-lab-stage"] iframe').count();
  expect(iframeCount).toBe(1);
});

test('recorded-only measured experiment mounts no iframe', async ({ page }) => {
  await page.goto('/experiments/layout-thrashing-forced-sync/');
  await expect(page.getByTestId('experiment-recorded-only')).toBeVisible({ timeout: 15_000 });
  const iframeCount = await page.locator('[data-testid="experiment-lab-stage"] iframe').count();
  expect(iframeCount).toBe(0);
});

test('emulation experiment supports Try it yourself with non-proof label', async ({ page }) => {
  await page.goto('/experiments/device-pixel-ratio-subpixel-sandbox/');
  await expect(page.getByTestId('experiment-try-it-yourself')).toBeVisible({ timeout: 15_000 });
  await page.getByTestId('experiment-try-it-yourself').click();
  await expect(page.getByTestId('experiment-source-caption')).toContainText(
    'Your run (not part of the proof)',
    { timeout: 15_000 },
  );
});
