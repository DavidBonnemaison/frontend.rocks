import { test, expect } from './fixtures';

test.describe('Code blocks', () => {
  test('highlights a concept code block and toggles its Copy button @smoke', async ({
    page,
    context,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });

    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/concepts/css-stacking-context/', { waitUntil: 'networkidle' });

    const codeShell = page.locator('.code-block-shell').first();
    await expect(codeShell).toBeVisible();

    const shikiPre = codeShell.locator('pre.shiki');
    await expect(shikiPre).toBeVisible();
    const highlightedSpans = shikiPre.locator('span[style*="color:"]');
    expect(await highlightedSpans.count()).toBeGreaterThan(0);

    const copyBtn = codeShell.getByTestId('copy-code-button');
    await expect(copyBtn).toBeVisible();
    await expect(copyBtn).toHaveText('Copy');
    await expect(copyBtn).toHaveAttribute('aria-label', 'Copy code to clipboard');
    await expect(copyBtn).toHaveAttribute('data-copied', 'false');

    await copyBtn.click();

    await expect(copyBtn).toHaveText('Copied');
    await expect(copyBtn).toHaveAttribute('aria-label', 'Copied to clipboard');
    await expect(copyBtn).toHaveAttribute('data-copied', 'true');

    const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboardText.trim().length).toBeGreaterThan(0);

    expect(errors).toEqual([]);
  });

  test('highlights an autopsy code block and gives it a Copy button', async ({
    page,
    context,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });

    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/autopsies/double-payment-race-condition/', { waitUntil: 'networkidle' });

    const codeShell = page.locator('.code-block-shell').first();
    await expect(codeShell).toBeVisible();
    await expect(codeShell.locator('pre.shiki')).toBeVisible();

    const copyBtn = codeShell.getByTestId('copy-code-button');
    await expect(copyBtn).toBeVisible();
    await copyBtn.click();
    await expect(copyBtn).toHaveText('Copied');

    expect(errors).toEqual([]);
  });
});
