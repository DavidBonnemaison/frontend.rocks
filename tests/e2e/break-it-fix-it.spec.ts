import { test, expect } from './fixtures';

test('Break it / Fix it lazy-loads CodeMirror, verifies fix locally with zero network requests, and persists completion', async ({
  page,
}) => {
  await page.goto('/experiments/container-query-inline-size/');
  await expect(page.getByTestId('experiment-edit-code')).toBeVisible({ timeout: 15_000 });

  // CodeMirror must NOT be loaded before clicking "Edit the code"
  const loadedBefore = await page.evaluate(
    () => (globalThis as Record<string, unknown>).__frCodeMirrorLoaded,
  );
  expect(loadedBefore).toBeUndefined();

  await page.getByTestId('experiment-edit-code').click();
  await expect(page.getByTestId('challenge-code-editor')).toBeVisible({ timeout: 15_000 });

  const loadedAfter = await page.evaluate(
    () => (globalThis as Record<string, unknown>).__frCodeMirrorLoaded,
  );
  expect(loadedAfter).toBe(true);

  // Track network requests during "Check my fix"
  const requestsDuringCheck: string[] = [];
  const onRequest = (req: { url: () => string }) => {
    requestsDuringCheck.push(req.url());
  };
  page.on('request', onRequest);

  // 1. Unchanged control CSS fails
  await page.getByTestId('challenge-check-fix').click();
  await expect(page.getByTestId('challenge-feedback')).toHaveAttribute('data-outcome', 'fail', {
    timeout: 15_000,
  });

  // 2. Forbidden substring is rejected before execution
  const cmContent = page.locator('[data-testid="challenge-code-editor"] .cm-content');
  await cmContent.click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.insertText('@media (min-width: 420px) { .card {} }');
  await page.getByTestId('challenge-check-fix').click();
  await expect(page.getByTestId('challenge-feedback')).toHaveAttribute(
    'data-outcome',
    'forbidden',
    { timeout: 10_000 },
  );

  // 3. Valid fix passes
  await cmContent.click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.insertText('.slot { container-type: inline-size; }');
  await page.getByTestId('challenge-check-fix').click();
  await expect(page.getByTestId('challenge-feedback')).toHaveAttribute('data-outcome', 'success', {
    timeout: 15_000,
  });

  page.off('request', onRequest);
  expect(requestsDuringCheck).toEqual([]);

  // 4. Completion persisted in localStorage['fr-challenges']
  const solved = await page.evaluate(() => {
    const raw = window.localStorage.getItem('fr-challenges');
    return raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
  });
  expect(solved['container-query-inline-size']).toBe(true);

  // 5. Escape returns focus to the "Edit the code" button
  await cmContent.click();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('challenge-panel')).toHaveCount(0);
  await expect(page.getByTestId('experiment-edit-code')).toBeFocused();
});
