import { test, expect } from './fixtures';

test.describe('Learning paths', () => {
  test('keeps ?path= while navigating, persists progress and reflects it on the home page and /graph', async ({
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
});
