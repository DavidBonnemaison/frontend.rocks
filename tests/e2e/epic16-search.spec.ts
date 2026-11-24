import { test, expect } from '@playwright/test';

interface SearchIndexEntry {
  kind: string;
  id: string;
  title: string;
  subtitle: string;
  href: string;
  badge: string;
}

test.describe('EPIC-16 US-16.1: Command Palette 2.0 & Lazy-Loaded Static Search Index', () => {
  test('homepage static HTML does not serialize searchItems into RSC payload', async ({
    request,
  }) => {
    const res = await request.get('/');
    expect(res.status()).toBe(200);
    const html = await res.text();

    expect(html).not.toContain('"searchItems"');
    expect(html).not.toContain('"searchText"');
    expect(html).not.toContain('zindex-9999-tooltip-war#lab');
  });

  test('Cmd+K lazy-loads /search-index.json once and shows a clean empty state when no content is published', async ({
    page,
    request,
  }) => {
    await page.route('https://static.cloudflareinsights.com/**', (route) =>
      route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'application/javascript; charset=utf-8' },
        body: '/* stub */',
      })
    );

    let searchIndexRequests = 0;
    page.on('request', (req) => {
      if (req.url().endsWith('/search-index.json')) {
        searchIndexRequests += 1;
      }
    });

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/', { waitUntil: 'networkidle' });

    // Not fetched before opening Command Palette
    expect(searchIndexRequests).toBe(0);

    // Open with Cmd/Ctrl+K
    await page.keyboard.press('Control+k');
    const dialog = page.getByRole('dialog', { name: 'Instant search' });
    await expect(dialog).toBeVisible();

    const input = page.getByLabel('Instant search input');
    await expect(input).toBeVisible();

    // Unverified content is not indexed: no concept, autopsy, symptom or lab result.
    await input.fill('z-index header');
    await expect(dialog.getByText(/No results for/)).toBeVisible();
    await expect(dialog.locator('[data-search-kind="concept"]')).toHaveCount(0);
    await expect(dialog.locator('[data-search-kind="autopsy"]')).toHaveCount(0);
    await expect(dialog.locator('[data-search-kind="symptom"]')).toHaveCount(0);

    expect(searchIndexRequests).toBe(1);

    // Close and reopen: must use in-memory cache without refetching
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await page.getByTestId('cmdk-trigger').click();
    await expect(dialog).toBeVisible();
    expect(searchIndexRequests).toBe(1);

    // Every indexed item (if any) points to a published page: the index has no unverified kinds.
    const indexRes = await request.get('/search-index.json');
    expect(indexRes.status()).toBe(200);
    const items = (await indexRes.json()) as SearchIndexEntry[];
    expect(items.filter((item) => item.kind !== 'agent').length).toBe(0);
  });
});
