import { test, expect } from './fixtures';

interface SearchIndexEntry {
  kind: string;
  id: string;
  title: string;
  subtitle: string;
  href: string;
  badge: string;
}

test.describe('Command palette and search index', () => {
  test('does not surface unverified autopsies and shows a clean empty state', async ({
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

  test('keeps the search items out of the home page HTML payload', async ({
    request,
  }) => {
    const res = await request.get('/');
    expect(res.status()).toBe(200);
    const html = await res.text();

    expect(html).not.toContain('"searchItems"');
    expect(html).not.toContain('"searchText"');
    expect(html).not.toContain('zindex-9999-tooltip-war#lab');
  });

  test('lazy-loads /search-index.json once and caches it @smoke', async ({
    page,
    request,
  }) => {

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
