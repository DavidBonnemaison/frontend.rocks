import { test, expect } from '@playwright/test';

test.describe('EPIC-16 US-16.3: Shiki Syntax Highlighting & Copy Code Button', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('https://static.cloudflareinsights.com/**', (route) =>
      route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'application/javascript; charset=utf-8' },
        body: '/* stub */',
      })
    );
  });

  test('renders Shiki highlighted spans and toggles Copy -> Copied on a concept code block', async ({
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

  test('renders Shiki highlighted code blocks with Copy button on an autopsy page', async ({
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
