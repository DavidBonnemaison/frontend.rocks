import { test, expect } from './fixtures';

test.describe('Comparison pages', () => {
  test('renders the verdict, the comparison matrix and the lab links of a pair @smoke', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/vs/abortcontroller-cancellation-vs-dom-event-propagation/', {
      waitUntil: 'networkidle',
    });

    await expect(page.getByText(/Mechanical Verdict/i)).toBeVisible();
    await expect(page.getByRole('heading', { name: /Comparison Matrix/i })).toBeVisible();
    const labLinks = page.locator('a[href*="#lab"]');
    expect(await labLinks.count()).toBeGreaterThanOrEqual(2);

    expect(errors).toEqual([]);
  });

  test('lists the pairs and filters them by relation type without a reload', async ({
    page,
  }) => {
    await page.goto('/vs/');

    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    const cards = page.locator('a[href^="/vs/"]');
    const initialCount = await cards.count();
    expect(initialCount).toBeGreaterThanOrEqual(1);

    // Each filter shows at most the initial list, and at least one of them shows something.
    const filteredCounts: number[] = [];
    for (const name of [/Replaces Legacy/i, /Contrasts With/i]) {
      const button = page.getByRole('button', { name });
      await expect(button).toBeVisible();
      await button.click();
      await expect(button).toHaveAttribute('aria-pressed', 'true');
      const count = await cards.count();
      expect(count).toBeLessThanOrEqual(initialCount);
      filteredCounts.push(count);
    }
    expect(Math.max(...filteredCounts)).toBeGreaterThan(0);

    // Verify /obsolescence/ contains a contextual link to /vs/
    await page.goto('/obsolescence/');
    await expect(page.locator('a[href="/vs/"]').first()).toBeVisible();
  });
});
