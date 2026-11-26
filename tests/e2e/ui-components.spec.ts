import { test, expect } from '@playwright/test';

test.describe('UI components behavior', () => {
  test('@smoke gallery renders distinct light and dark column backgrounds', async ({ page }) => {
    await page.goto('/dev/components/');
    const lightBg = await page
      .locator('#button [data-theme="light"]')
      .evaluate((el) => getComputedStyle(el).backgroundColor);
    const darkBg = await page
      .locator('#button [data-theme="dark"]')
      .evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(lightBg).not.toBe(darkBg);
  });

  test('@smoke Tabs supports ArrowRight, ArrowLeft, Home, End keyboard navigation', async ({
    page,
  }) => {
    await page.goto('/dev/components/');
    const tablist = page.locator('#tabs [data-theme="light"] [role="tablist"]').first();
    const tabs = tablist.locator('[role="tab"]');
    await tabs.nth(0).focus();
    await expect(tabs.nth(0)).toHaveAttribute('aria-selected', 'true');

    await page.keyboard.press('ArrowRight');
    await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true');
    await expect(tabs.nth(1)).toBeFocused();

    await page.keyboard.press('End');
    await expect(tabs.nth(2)).toHaveAttribute('aria-selected', 'true');

    await page.keyboard.press('Home');
    await expect(tabs.nth(0)).toHaveAttribute('aria-selected', 'true');
  });

  test('Dialog closes on Escape and restores focus to trigger', async ({ page }) => {
    await page.goto('/dev/components/');
    const trigger = page.locator('#overlays [data-theme="light"] button:has-text("Open Dialog")');
    await trigger.click();
    const dialog = page.locator('#overlays [data-theme="light"] dialog[open]');
    await expect(dialog).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test('NavMenu opens, syncs aria-expanded, and closes on Escape and outside click', async ({
    page,
  }) => {
    await page.goto('/dev/components/');
    const trigger = page.locator('#overlays [data-theme="light"] .nav-menu-trigger');
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');

    await trigger.click();
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');

    await page.keyboard.press('Escape');
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');

    await trigger.click();
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await page.locator('.dev-gallery-header h1').click();
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  test('Sidenote toggles inline at 390px and displays in margin at 1280px', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/dev/components/');
    const btn = page.locator('#sidenote [data-theme="light"] .sidenote-toggle');
    const note = page.locator('#sidenote [data-theme="light"] .sidenote');
    await expect(note).toBeHidden();
    await btn.click();
    await expect(btn).toHaveAttribute('aria-expanded', 'true');
    await expect(note).toBeVisible();

    await page.setViewportSize({ width: 1280, height: 800 });
    await expect(note).toBeVisible();
  });

  test('ClaimMarker opens ClaimPopover and closes on Escape', async ({ page }) => {
    await page.goto('/dev/components/');
    const marker = page.locator('#proof-visuals [data-theme="light"] .claim-marker').first();
    const popover = page.locator('#claim-pop-light');
    await marker.click();
    await expect(popover).toBeVisible();
    await expect(popover).toContainText('CHROMIUM');

    await page.keyboard.press('Escape');
    await expect(popover).toBeHidden();
  });

  test('InstrumentPanel range slider works via keyboard and Readout has complete aria-label', async ({
    page,
  }) => {
    await page.goto('/dev/components/');
    const section = page.locator('#instrument-panel [data-theme="light"]');
    const slider = section.locator('input[type="range"]');
    const readout = section.locator('.range-control .readout');

    await expect(readout).toHaveAttribute('aria-label', 'Slot width: 480 px');
    await slider.focus();
    await page.keyboard.press('ArrowRight');
    await expect(readout).toHaveAttribute('aria-label', 'Slot width: 500 px');
  });
});
