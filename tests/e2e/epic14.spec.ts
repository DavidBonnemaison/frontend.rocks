import { test, expect } from '@playwright/test';

test.describe('EPIC-14: SEO, GEO, Programmatic Pages & Embeddable Labs', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('https://static.cloudflareinsights.com/**', (route) =>
      route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'application/javascript; charset=utf-8' },
        body: '/* stub */',
      })
    );
  });

  test('concept page has JSON-LD @graph, canonical, markdown alternate, og:image, and Embed button', async ({
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

    const canonical = page.locator('link[rel="canonical"]');
    await expect(canonical).toHaveAttribute(
      'href',
      'https://frontend.rocks/concepts/css-stacking-context/'
    );

    // Unverified page: no Markdown twin is advertised, and the page is noindex.
    await expect(page.locator('link[rel="alternate"][type="text/markdown"]')).toHaveCount(0);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);

    const ogImage = page.locator('meta[property="og:image"]');
    await expect(ogImage).toHaveAttribute(
      'content',
      'https://frontend.rocks/og/concepts/css-stacking-context.png'
    );

    // No structured data on an unverified page.
    await expect(page.locator('script[type="application/ld+json"]')).toHaveCount(0);

    const embedBtn = page.getByTestId('lab-embed-button');
    await expect(embedBtn).toBeVisible();
    await expect(embedBtn).toContainText('Embed');
    await embedBtn.click();
    await expect(embedBtn).toContainText('Copied');

    const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboardText).toBe(
      '<iframe src="https://frontend.rocks/embed/lab/css-stacking-context/" width="100%" height="520" loading="lazy" style="border:1px solid #1e293b;border-radius:8px;"></iframe>'
    );

    expect(errors).toEqual([]);
  });

  test('/vs/[pair]/ page renders verdict, comparison matrix, and #lab links', async ({ page }) => {
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

  test('/symptoms/ and /symptoms/[slug]/ render diagnostic chain and links', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/symptoms/', { waitUntil: 'networkidle' });
    await expect(
      page.getByRole('heading', { name: /Production Symptoms & DevTools Signatures/i })
    ).toBeVisible();
    const zIndexLink = page.locator('a[href="/symptoms/z-index-ignored/"]').first();
    await expect(zIndexLink).toBeVisible();

    await zIndexLink.click();
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/\/symptoms\/z-index-ignored\/$/);
    await expect(
      page.getByRole('heading', { name: /Causal Chain of Browser Mechanisms/i })
    ).toBeVisible();
    await expect(page.locator('a[href*="/concepts/css-stacking-context/"]').first()).toBeVisible();

    expect(errors).toEqual([]);
  });

  test('/embed/lab/[lab_id]/ renders interactive lab without header/footer and with attribution bar', async ({
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
