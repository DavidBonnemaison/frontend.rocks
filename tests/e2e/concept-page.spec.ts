import { test, expect } from './fixtures';
import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';

function proofStatus(id: string): string {
  const raw = fs.readFileSync(path.join(process.cwd(), 'content', 'concepts', `${id}.mdx`), 'utf-8');
  return String(matter(raw).data.proof_status);
}

test.describe('Concept page', () => {
  test('lists the autopsies that traverse a concept', async ({
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

  test('exposes canonical, og:image and the Embed button, and advertises Markdown and JSON-LD only when proven @smoke', async ({
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
    const proven = proofStatus('css-stacking-context') === 'proven';
    await page.goto('/concepts/css-stacking-context/', { waitUntil: 'networkidle' });

    const canonical = page.locator('link[rel="canonical"]');
    await expect(canonical).toHaveAttribute(
      'href',
      'https://frontend.rocks/concepts/css-stacking-context/'
    );

    // Markdown twin and robots: only a proven page is advertised and indexable.
    await expect(page.locator('link[rel="alternate"][type="text/markdown"]')).toHaveCount(
      proven ? 1 : 0,
    );
    if (proven) {
      await expect(page.locator('meta[name="robots"]')).not.toHaveAttribute('content', /noindex/);
    } else {
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
    }

    const ogImage = page.locator('meta[property="og:image"]');
    await expect(ogImage).toHaveAttribute(
      'content',
      'https://frontend.rocks/og/concepts/css-stacking-context.png'
    );

    // Structured data: only on a proven page.
    if (proven) {
      expect(await page.locator('script[type="application/ld+json"]').count()).toBeGreaterThan(0);
    } else {
      await expect(page.locator('script[type="application/ld+json"]')).toHaveCount(0);
    }

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

  test('has no horizontal overflow on mobile and desktop', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/concepts/event-loop-tasks-microtasks/', { waitUntil: 'networkidle' });
    const mobileOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 2,
    );
    expect(mobileOverflow).toBe(false);

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/concepts/event-loop-tasks-microtasks/', { waitUntil: 'networkidle' });
    const desktopOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 2,
    );
    expect(desktopOverflow).toBe(false);
  });

  test('renders no maturity badge on an architecture pattern and shows a computed Baseline badge on a platform feature', async ({
    page,
  }) => {
    await page.goto('/concepts/hexagonal-ports-adapters-ui/', { waitUntil: 'networkidle' });
    const patternMeta = page.locator('.concept-meta');
    await expect(patternMeta).toBeVisible();
    await expect(
      patternMeta.locator(
        '.badge-baseline-widely, .badge-baseline-newly, .badge-interop-experimental, .badge-legacy-pattern, .badge-superseded'
      )
    ).toHaveCount(0);

    await page.goto('/concepts/css-container-queries/', { waitUntil: 'networkidle' });
    const featureBadge = page
      .locator('.concept-meta')
      .locator('.badge-baseline-widely, .badge-baseline-newly, .badge-interop-experimental');
    await expect(featureBadge).toHaveCount(1);
    await expect(featureBadge).toHaveText(
      /^(Baseline · Widely|Baseline · Newly|Limited availability)$/
    );
  });
});
