import { test, expect } from './fixtures';

test.describe('Diagnostic tool (/diagnose)', () => {
  test('analyzes every demo trace locally in a Web Worker with zero outgoing network requests and valid prescription links @smoke', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });

    await page.goto('/diagnose/', { waitUntil: 'networkidle' });

    // Privacy guarantee banner is clearly visible
    await expect(
      page.getByText('Runs 100% locally in a Web Worker. Zero bytes leave your browser.')
    ).toBeVisible();

    // Track outgoing network requests during demo trace analysis
    const outgoingRequests: string[] = [];
    let tracking = false;
    page.on('request', (req) => {
      if (!tracking) return;
      const url = req.url();
      // Ignore Next.js static worker chunk loading on first worker boot if any
      if (url.includes('/_next/static/')) return;
      outgoingRequests.push(`${req.method()} ${url}`);
    });

    const demoExpectations = [
      {
        id: 'layout-thrashing-loop',
        expectedDetector: 'forced-reflow',
        expectedHref: '/concepts/layout-thrashing/',
      },
      {
        id: 'network-waterfall-bundle',
        expectedDetector: 'request-waterfall',
        expectedHref: '/concepts/preload-scanner-hints/',
      },
      {
        id: 'main-thread-long-task',
        expectedDetector: 'long-tasks',
        expectedHref: '/concepts/long-tasks-and-inp/',
      },
    ];

    for (const demo of demoExpectations) {
      tracking = true;
      await page.locator(`button[data-demo-id="${demo.id}"]`).click();

      const findingCard = page.locator(
        `article.diagnose-finding-card[data-detector="${demo.expectedDetector}"]`
      );
      await expect(findingCard).toBeVisible();

      const prescriptionLinks = page.locator('.diagnose-prescription-link');
      const count = await prescriptionLinks.count();
      expect(count).toBeGreaterThan(0);

      await expect(
        page.locator(`.diagnose-prescription-link[href="${demo.expectedHref}"]`).first()
      ).toBeVisible();

      // Verify every rendered prescription link points to a valid internal route pattern
      for (let i = 0; i < count; i += 1) {
        const href = await prescriptionLinks.nth(i).getAttribute('href');
        expect(href).toMatch(/^\/(concepts|symptoms|autopsies)\/[a-z0-9-]+\/$/);
      }
      tracking = false;
    }

    // Zero outgoing network requests during local analysis
    expect(outgoingRequests).toEqual([]);
    expect(errors).toEqual([]);
  });
});
