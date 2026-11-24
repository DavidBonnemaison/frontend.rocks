import { expect, test } from '@playwright/test';

test.describe('EPIC-17 Interactive Experience', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('https://static.cloudflareinsights.com/**', (route) =>
      route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'application/javascript; charset=utf-8' },
        body: '/* stub */',
      })
    );
  });

  test('US-17.1: LiveSandboxLab renders sandboxed iframe without console errors and responds to controls', async ({
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

  test('US-17.2: DevTools Detective supports wrong patch feedback, root cause confirmation, and anchor jumps', async ({
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

  test('US-17.3: Learning Path navigation preserves ?path=, persists localStorage progress, and reflects on homepage & /graph', async ({
    page,
  }) => {
    await page.goto('/');

    // Click the first learning path card link with ?path=
    const pathLink = page.locator('a[href*="/concepts/"][href*="?path="]').first();
    await expect(pathLink).toBeVisible();
    const href = await pathLink.getAttribute('href');
    expect(href).toBeTruthy();
    const expectedPath = new URL(href!, 'http://127.0.0.1:4173').searchParams.get('path');
    expect(expectedPath).toBeTruthy();

    await pathLink.click();
    await page.waitForURL(new RegExp(`path=${expectedPath}`));

    // Top and bottom progress bars both visible at Step 1
    await expect(page.getByTestId('path-progress-bar-top')).toBeVisible();
    await expect(page.getByTestId('path-progress-bar-bottom')).toBeVisible();
    await expect(page.getByTestId('path-step-indicator-top')).toContainText('Step 1 /');

    // Mark Step 1 as understood
    const understoodBtn = page.getByTestId('concept-understood-toggle-top');
    await understoodBtn.click();
    await expect(understoodBtn).toHaveAttribute('aria-pressed', 'true');

    // Navigate to Step 2 via Next link and confirm ?path= is preserved
    await page.getByTestId('path-next-link-top').click();
    await page.waitForURL(new RegExp(`path=${expectedPath}`));
    await expect(page.getByTestId('path-step-indicator-top')).toContainText('Step 2 /');

    // Reload and verify localStorage persistence
    await page.reload();
    await expect(page.getByTestId('path-step-indicator-top')).toContainText('1/');

    // Navigate back to homepage and check completion rate badge
    await page.goto('/');
    await expect(page.locator('body')).toContainText('1/');

    // Navigate to /graph and verify explored filter & explored node marker work
    await page.goto('/graph/');
    const progressSelect = page.getByTestId('graph-progress-filter');
    await expect(progressSelect).toBeVisible();
    await progressSelect.selectOption('explored');
    await expect(progressSelect).toHaveValue('explored');
    await expect(page.locator('[data-explored="true"]').first()).toBeVisible();
  });

  test('US-17.4: /vs/ hub lists pairs and filters by relation type and domain without reload', async ({
    page,
  }) => {
    await page.goto('/vs/');

    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    const cards = page.locator('a[href^="/vs/"]');
    const initialCount = await cards.count();
    expect(initialCount).toBeGreaterThanOrEqual(40);

    // Filter by Replaces Legacy
    const replacesBtn = page.getByRole('button', { name: /Replaces Legacy/i });
    await expect(replacesBtn).toBeVisible();
    await replacesBtn.click();
    await expect(replacesBtn).toHaveAttribute('aria-pressed', 'true');
    const replacesCount = await cards.count();
    expect(replacesCount).toBeGreaterThan(0);
    expect(replacesCount).toBeLessThan(initialCount);

    // Filter by Contrasts With
    const contrastsBtn = page.getByRole('button', { name: /Contrasts With/i });
    await contrastsBtn.click();
    await expect(contrastsBtn).toHaveAttribute('aria-pressed', 'true');
    const contrastsCount = await cards.count();
    expect(contrastsCount).toBeGreaterThan(0);
    expect(contrastsCount).toBeLessThan(initialCount);

    // Verify /obsolescence/ contains a contextual link to /vs/
    await page.goto('/obsolescence/');
    await expect(page.locator('a[href="/vs/"]').first()).toBeVisible();
  });
});
