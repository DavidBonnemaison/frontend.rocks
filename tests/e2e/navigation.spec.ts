import { test, expect } from './fixtures';

test.describe('Navigation', () => {
  test('renders the storefront, the graph with edge notes and the secondary routes without errors', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/', { waitUntil: 'networkidle' });

    // Editorial Hero & CTAs
    await expect(
      page.getByRole('heading', { name: /How Browsers Actually Work/i })
    ).toBeVisible();
    const primaryCta = page.getByRole('link', { name: /Try a Lab in 30s/i });
    await expect(primaryCta).toHaveAttribute('href', '/concepts/css-stacking-context/#lab');
    const secondaryCta = page.getByRole('link', { name: /Explore the Concept Map/i });
    await expect(secondaryCta).toHaveAttribute('href', '/graph/');

    // No raw technical identifiers leaked on /
    const homeBodyText = await page.locator('main').innerText();
    expect(homeBodyText).not.toMatch(/\b(requires|under_the_hood|WeeklyDigest|ConstraintSimulatorLab)\b/);

    // Door A, Door B, Door C
    await expect(page.getByRole('heading', { name: /Guided Learning Paths/i })).toBeVisible();
    await expect(page.getByTestId('home-path-preview')).toBeVisible();
    await expect(page.getByRole('heading', { name: /Debug by Production Symptom/i })).toBeVisible();
    await expect(page.getByText(/My z-index: 9999 is ignored/i)).toBeVisible();
    await expect(
      page.getByRole('heading', { name: /Latest Watch & Obsolescence Signals/i })
    ).toBeVisible();

    // Mobile 390px check on /
    await page.setViewportSize({ width: 390, height: 844 });
    const homeMobileOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth
    );
    expect(homeMobileOverflow, 'Home mobile horizontal overflow').toBe(false);

    // Navigate to /graph on desktop
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/graph/', { waitUntil: 'networkidle' });
    await expect(page.getByRole('img', { name: /Directed frontend concepts/i })).toBeVisible();

    // Click an edge and verify its note explanation appears in the fixed contextual panel
    const firstEdge = page.locator('[data-testid^="graph-edge-"]').first();
    await expect(firstEdge).toBeVisible();
    await firstEdge.click({ force: true });
    const contextPanel = page.getByTestId('graph-context-panel');
    await expect(contextPanel.getByText(/Edge Explanation/i)).toBeVisible();

    // Mobile 390px check on /graph: defaults to Dependency Tree with zero horizontal overflow
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByTestId('graph-dependency-tree')).toBeVisible();
    const graphMobileOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth
    );
    expect(graphMobileOverflow, 'Graph mobile horizontal overflow').toBe(false);

    // Open Cmd+K search
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.getByTestId('cmdk-trigger').click();
    const input = page.getByPlaceholder(/API, symptom/i);
    await expect(input).toBeVisible();
    await input.fill('z-index ignored');
    // Unverified content is not indexed: clean empty state instead of a concept result.
    await expect(page.getByText(/No results for/)).toBeVisible();
    await expect(
      page.getByRole('button', { name: /CSS Stacking Context.*Hierarchical/i })
    ).toHaveCount(0);
    await page.keyboard.press('Escape');

    // Visit Index, Digest, Obsolescence
    await page.goto('/index-list/', { waitUntil: 'networkidle' });
    await expect(page.getByRole('heading', { name: /Structured Concept Index/i })).toBeVisible();

    await page.goto('/digest/', { waitUntil: 'networkidle' });
    await expect(page.getByText(/Issue #46/)).toBeVisible();

    await page.goto('/obsolescence/', { waitUntil: 'networkidle' });
    await expect(page.getByRole('heading', { name: /Obsolescence Radar/i })).toBeVisible();
    await expect(page.getByText(/ResizeObserver/i).first()).toBeVisible();

    expect(errors).toEqual([]);
  });

  test('links to the autopsies from the desktop header and the mobile drawer @smoke', async ({
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

  test('shows the primary navigation in order', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/', { waitUntil: 'networkidle' });

    const desktopNav = page.getByRole('navigation', { name: 'Primary navigation' });
    const navLabels = await desktopNav.locator('a').allInnerTexts();
    expect(navLabels).toEqual(['Home', 'Autopsies', 'Symptoms', 'Diagnose', 'Concept Map', 'Index', 'Radar']);

    await expect(desktopNav.getByRole('link', { name: 'Symptoms' })).toHaveAttribute(
      'href',
      '/symptoms/'
    );
    await expect(desktopNav.getByRole('link', { name: 'Radar' })).toHaveAttribute(
      'href',
      '/obsolescence/'
    );

    expect(errors).toEqual([]);
  });
});
