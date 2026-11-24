import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from '@playwright/test';

const totalAutopsies = fs
  .readdirSync(path.join(process.cwd(), 'content', 'autopsies'))
  .filter((f) => f.endsWith('.mdx')).length;

test.describe('EPIC-13: Production Failure Autopsies', () => {
  test('navigation: Autopsies link is visible in desktop header and mobile drawer and navigates to /autopsies', async ({
    page,
  }) => {
    // Desktop 1440x900
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/', { waitUntil: 'networkidle' });

    const desktopNav = page.getByRole('navigation', { name: 'Primary navigation' });
    const desktopAutopsiesLink = desktopNav.getByRole('link', { name: 'Autopsies' });
    await expect(desktopAutopsiesLink).toBeVisible();
    await desktopAutopsiesLink.click();
    await expect(page).toHaveURL(/\/autopsies\/?$/);

    // Mobile 390x844
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/', { waitUntil: 'networkidle' });

    const menuToggle = page.getByRole('button', { name: 'Open navigation menu' });
    await expect(menuToggle).toBeVisible();
    await menuToggle.click();

    const mobileDrawer = page.getByRole('navigation', { name: 'Mobile navigation' });
    await expect(mobileDrawer).toBeVisible();
    const mobileAutopsiesLink = mobileDrawer.getByRole('link', { name: 'Autopsies' });
    await expect(mobileAutopsiesLink).toBeVisible();
    await mobileAutopsiesLink.click();
    await expect(page).toHaveURL(/\/autopsies\/?$/);
  });

  test('index /autopsies displays all autopsies and filters accurately by failure_mode', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/autopsies/', { waitUntil: 'networkidle' });

    const cards = page.locator('main article');
    await expect(cards).toHaveCount(totalAutopsies);

    const filterGroup = page.getByRole('group', { name: 'Filter by failure mode' });
    const allBtn = filterGroup.getByRole('button', { name: /All Failure Modes/ });
    await expect(allBtn).toHaveAttribute('aria-pressed', 'true');

    // Filter by Silent Data Corruption
    const corruptionBtn = filterGroup.getByRole('button', { name: /Silent Data Corruption/ });
    await corruptionBtn.click();
    await expect(corruptionBtn).toHaveAttribute('aria-pressed', 'true');

    const corruptionCount = await cards.count();
    expect(corruptionCount).toBeGreaterThan(0);
    expect(corruptionCount).toBeLessThan(totalAutopsies);
    for (let i = 0; i < corruptionCount; i++) {
      await expect(cards.nth(i)).toContainText('Silent Data Corruption');
    }

    // Filter by Main-Thread Freeze
    const freezeBtn = filterGroup.getByRole('button', { name: /Main-Thread Freeze/ });
    await freezeBtn.click();
    await expect(freezeBtn).toHaveAttribute('aria-pressed', 'true');

    const freezeCount = await cards.count();
    expect(freezeCount).toBeGreaterThan(0);
    expect(freezeCount).toBeLessThan(totalAutopsies);
    for (let i = 0; i < freezeCount; i++) {
      await expect(cards.nth(i)).toContainText('Main-Thread Freeze');
    }

    // Reset filter
    await allBtn.click();
    await expect(cards).toHaveCount(totalAutopsies);
  });

  test('autopsy detail /autopsies/double-payment-race-condition renders stepper, lab, fix section, and zero horizontal overflow', async ({
    page,
  }) => {
    const route = '/autopsies/double-payment-race-condition/';

    // Desktop 1440x900
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(route, { waitUntil: 'networkidle' });

    const stepper = page.getByTestId('causal-chain-stepper');
    await expect(stepper).toBeVisible();
    const stepLinks = stepper.locator('a.causal-step-title');
    await expect(stepLinks).toHaveCount(5);
    for (let i = 0; i < 5; i++) {
      await expect(stepLinks.nth(i)).toHaveAttribute('href', /^\/concepts\/[a-z0-9-]+\/?$/);
    }

    const labSection = page.locator('#lab');
    await expect(labSection).toBeVisible();

    const fixSection = page.getByTestId('architectural-fix-section');
    await expect(fixSection).toBeVisible();
    await expect(fixSection.locator('h2')).toBeVisible();
    await expect(fixSection).toContainText('Case file');
    await expect(fixSection).toContainText('Root cause');

    const desktopOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth
    );
    expect(desktopOverflow, 'Horizontal overflow on 1440x900').toBe(false);

    // Mobile 390x844
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(route, { waitUntil: 'networkidle' });

    await expect(page.getByTestId('causal-chain-stepper')).toBeVisible();
    await expect(page.locator('#lab')).toBeVisible();
    await expect(page.getByTestId('architectural-fix-section')).toBeVisible();

    const mobileOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth
    );
    expect(mobileOverflow, 'Horizontal overflow on 390x844').toBe(false);
  });

  test('concept backlinks: /concepts/abortcontroller-cancellation displays seen-in-autopsies links', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/concepts/abortcontroller-cancellation/', { waitUntil: 'networkidle' });

    const seenInAutopsies = page.getByTestId('seen-in-autopsies');
    await expect(seenInAutopsies).toBeVisible();

    await expect(
      seenInAutopsies.locator('a[href*="/autopsies/double-payment-race-condition"]')
    ).toBeVisible();
    await expect(
      seenInAutopsies.locator('a[href*="/autopsies/eight-hour-spa-memory-leak"]')
    ).toBeVisible();
  });

  test('Cmd+K search does not surface unverified autopsies and shows a clean empty state', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/', { waitUntil: 'networkidle' });

    const trigger = page.getByTestId('cmdk-trigger');
    await expect(trigger).toBeVisible();
    await trigger.click();

    const dialog = page.getByRole('dialog', { name: 'Instant search' });
    await expect(dialog).toBeVisible();

    const input = dialog.getByLabel('Instant search input');
    await input.fill('Double Payment');
    await expect(dialog.getByText(/No results for/)).toBeVisible();
    await expect(dialog.getByRole('button', { name: /Double Payment/i })).toHaveCount(0);
  });
});
