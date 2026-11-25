import { test, expect } from './fixtures';
import type { ExperimentBundle } from '@/lib/proof/experiment-schema';
import type { RunResult } from '@/lib/proof/runtime/protocol';

declare global {
  interface Window {
    __frResult?: RunResult;
  }
}

test('idb-versionchange runs on real lab origin and resets storage between runs', async ({ page }) => {
  await page.goto('http://127.0.0.1:4175/__test/parent.html');

  const first = await page.evaluate(() => window.__frTestRun('idb-versionchange', 'treatment', {}));
  expect(first.ok).toBe(true);

  const second = await page.evaluate(() => window.__frTestRun('idb-versionchange', 'treatment', {}));
  expect(second.ok).toBe(true);
  if (first.ok && second.ok) {
    expect(second.value).toEqual(first.value);
    expect(first.value).toEqual({ events: ['versionchange', 'upgradeneeded', 'v2-open'] });
  }

  const control = await page.evaluate(() => window.__frTestRun('idb-versionchange', 'control', {}));
  expect(control.ok).toBe(true);
  if (control.ok) {
    expect(control.value).toEqual({ events: ['versionchange', 'blocked'] });
  }
});

test('unlisted parent origin is ignored by the lab host', async ({ page }) => {
  await page.goto('http://localhost:4175/__test/parent.html');

  const res = await page.evaluate(() => window.__frTestRun('idb-versionchange', 'treatment', {}));
  expect(res.ok).toBe(false);
  if (!res.ok) {
    expect(res.error).toContain('FR_TIMEOUT waiting for fr:loaded');
  }
});

test('top-level lab host runs __frLabRun and populates window.__frResult', async ({ page }) => {
  const bundleRes = await page.request.get('http://127.0.0.1:4174/__bundles/idb-versionchange.json');
  expect(bundleRes.ok()).toBe(true);
  const bundle = (await bundleRes.json()) as ExperimentBundle;

  await page.goto('http://127.0.0.1:4174/x/idb-versionchange/host.html');
  await page.waitForFunction(() => typeof window.__frLabRun === 'function');
  await page.evaluate((b: unknown) => {
    void window.__frLabRun?.({
      channel: 'fr-proof',
      type: 'fr:lab-run',
      runId: 'top-level-1',
      bundle: b as ExperimentBundle,
      variant: 'treatment',
      params: {},
      mutated: false,
      awaitInput: false,
    });
  }, bundle as unknown);

  await page.waitForFunction(() => window.__frResult !== undefined, undefined, { timeout: 15_000 });
  const result = await page.evaluate(() => window.__frResult);
  expect(result?.ok).toBe(true);
});
