import { test, expect } from './fixtures';
import type { RunResult } from '@/lib/proof/runtime/protocol';

declare global {
  interface Window {
    __frPending?: Promise<RunResult>;
  }
}

test('awaitInput pauses observation until trusted click is performed', async ({ page }) => {
  await page.goto('http://127.0.0.1:4175/__test/parent.html');

  await page.evaluate(() => {
    window.__frWaiting = false;
    window.__frGo = false;
    window.__frPending = window.__frTestRun('trusted-click', 'treatment', {}, { awaitInput: true });
  });

  await page.waitForFunction(() => window.__frWaiting === true, undefined, { timeout: 10_000 });
  await page.frameLocator('iframe[data-run-id]').locator('#target').click();
  await page.evaluate(() => {
    window.__frGo = true;
  });

  const result = await page.evaluate(() => window.__frPending);
  expect(result?.ok).toBe(true);
  if (result?.ok) {
    expect(result.value).toEqual({ trusted: [true] });
  }
});

test('without awaitInput, trusted-click treatment observes no click', async ({ page }) => {
  await page.goto('http://127.0.0.1:4175/__test/parent.html');

  const result = await page.evaluate(() =>
    window.__frTestRun('trusted-click', 'treatment', {}, { awaitInput: false })
  );
  expect(result.ok).toBe(true);
  if (result.ok) {
    expect(result.value).toEqual({ trusted: [] });
  }
});
