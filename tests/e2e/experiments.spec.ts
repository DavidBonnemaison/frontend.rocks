import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';

const observed = (page: Page, variant: 'treatment' | 'control') =>
  page.getByTestId(`experiment-observed-${variant}`);

test('container query experiment reads the container width', { tag: '@smoke' }, async ({ page }) => {
  await page.goto('/experiments/container-query-inline-size/');
  await expect(observed(page, 'treatment')).toHaveAttribute('data-status', 'ok', { timeout: 15_000 });
  await expect(observed(page, 'treatment')).toContainText('"columns": 2');
  await expect(observed(page, 'control')).toContainText('"columns": 1');
  await page.getByTestId('experiment-param-w').evaluate((el: HTMLInputElement, v) => {
    el.value = v;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }, '300');
  await expect(observed(page, 'treatment')).toContainText('"columns": 1', { timeout: 15_000 });
});

test('promise reaction runs before an earlier timer', async ({ page }) => {
  await page.goto('/experiments/microtasks-before-timers/');
  await expect(observed(page, 'treatment')).toHaveAttribute('data-status', 'ok', { timeout: 15_000 });
  const text = (await observed(page, 'treatment').textContent()) ?? '';
  expect(text.indexOf('callback-queued-second')).toBeGreaterThan(-1);
  expect(text.indexOf('callback-queued-second')).toBeLessThan(text.indexOf('timer-queued-first'));
});

test('opacity traps the tooltip under the header', async ({ page }) => {
  await page.goto('/experiments/stacking-context-traps-z-index/');
  await expect(observed(page, 'treatment')).toContainText('"topmost": "header"', { timeout: 15_000 });
  await expect(observed(page, 'control')).toContainText('"topmost": "tooltip"');
});

test('run-all evaluates every case in the browser', async ({ page }) => {
  await page.goto('/experiments/container-query-inline-size/');
  await page.getByTestId('atelier-run-all').click();
  await expect(page.getByTestId('atelier-case-two-columns-at-480')).toHaveAttribute('data-status', 'pass', {
    timeout: 20_000,
  });
  await expect(page.getByTestId('atelier-case-one-column-at-300')).toHaveAttribute('data-status', 'pass');
});
