import { test, expect } from './fixtures';

test.describe('Embeddable labs', () => {
  test('renders the lab without header or footer and with an attribution bar @smoke', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });

    await page.setViewportSize({ width: 800, height: 520 });
    await page.goto('/embed/lab/css-stacking-context/', { waitUntil: 'networkidle' });

    await expect(page.locator('header')).toHaveCount(0);
    await expect(page.locator('footer.site-footer')).toHaveCount(0);
    await expect(page.getByTestId('lab-embed-button')).toHaveCount(0);

    await expect(page.getByTestId('lab-constraint-simulator')).toBeVisible();
    const attribution = page.getByTestId('embed-attribution-bar');
    await expect(attribution).toBeVisible();
    await expect(attribution).toContainText('Interactive model by frontend.rocks');
    const link = attribution.locator('a');
    await expect(link).toHaveAttribute(
      'href',
      'https://frontend.rocks/concepts/css-stacking-context/#lab'
    );
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('rel', 'noopener noreferrer');

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth
    );
    expect(overflow).toBe(false);
    expect(errors).toEqual([]);
  });
});
