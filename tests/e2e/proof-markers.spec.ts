import { test, expect } from './fixtures';

test.describe('Proof markers, proof mode, and spec sidenotes', () => {
  test('opens ClaimPopover from ClaimMarker and closes on Escape', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/dev/components/', { waitUntil: 'networkidle' });

    const marker = page.locator('#proof-visuals .claim-marker').first();
    await expect(marker).toBeVisible();
    await marker.click();

    const popover = page.locator('#proof-visuals .claim-popover').first();
    await expect(popover).toBeVisible();
    await expect(popover.locator('a[href*="/claims/"]').first()).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(popover).toBeHidden();
  });

  test('toggles sidenote inline at 390px with aria-expanded', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/dev/components/', { waitUntil: 'networkidle' });

    const section = page.locator('#sidenote');
    const toggle = section.locator('.sidenote-toggle').first();
    const note = section.locator('.sidenote').first();

    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(note).toBeHidden();

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(note).toBeVisible();
  });

  test('places no claim markers in headings or figcaptions on concept pages', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/concepts/css-container-queries/', { waitUntil: 'networkidle' });

    await expect(page.locator('h1 .claim-marker, h2 .claim-marker, figcaption .claim-marker')).toHaveCount(0);
  });

  test('persists fr-proof-mode in localStorage across reload', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/concepts/css-container-queries/', { waitUntil: 'networkidle' });

    await page.evaluate(() => {
      window.localStorage.setItem('fr-proof-mode', 'on');
    });
    await page.reload({ waitUntil: 'networkidle' });

    const stored = await page.evaluate(() => window.localStorage.getItem('fr-proof-mode'));
    expect(stored).toBe('on');
  });
});
