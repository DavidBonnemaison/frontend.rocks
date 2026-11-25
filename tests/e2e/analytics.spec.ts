import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';

interface DebugAnalyticsEntry {
  path: string;
  event: boolean;
}

async function readDebugEvents(page: Page): Promise<DebugAnalyticsEntry[]> {
  return page.evaluate(() => {
    const win = window as Window & { __frAnalyticsDebug?: DebugAnalyticsEntry[] };
    return win.__frAnalyticsDebug ?? [];
  });
}

test.describe('Analytics event instrumentation', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('fr-analytics-debug', '1');
    });
  });

  test('tracks experiment_interact once per pageview on step-machine labs @smoke', async ({
    page,
  }) => {
    await page.goto('/concepts/event-loop-tasks-microtasks/', { waitUntil: 'networkidle' });

    const nextBtn = page.getByTestId('lab-next');
    await expect(nextBtn).toBeVisible();
    await nextBtn.click();
    await nextBtn.click();

    const events = await readDebugEvents(page);
    const labEvents = events.filter(
      (e) => e.event && e.path === 'experiment_interact/event-loop-tasks-microtasks',
    );
    expect(labEvents).toHaveLength(1);
  });

  test('tracks search_zero_results and search_query without leaking user input', async ({
    page,
  }) => {
    await page.goto('/', { waitUntil: 'networkidle' });

    await page.keyboard.press('Control+k');
    const dialog = page.getByRole('dialog', { name: 'Instant search' });
    await expect(dialog).toBeVisible();

    const input = dialog.getByLabel('Instant search input');
    await input.fill('zzzzqqq');
    await expect(dialog.getByText(/No results for/)).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();

    const events = await readDebugEvents(page);
    expect(events.filter((e) => e.event && e.path === 'search_zero_results')).toHaveLength(1);
    expect(events.filter((e) => e.event && e.path === 'search_query')).toHaveLength(1);
    for (const entry of events) {
      expect(entry.path).not.toContain('zzzzqqq');
    }
  });

  test('tracks embed_copy when copying a lab iframe snippet', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto('/concepts/event-loop-tasks-microtasks/', { waitUntil: 'networkidle' });

    const embedBtn = page.getByTestId('lab-embed-button');
    await expect(embedBtn).toBeVisible();
    await embedBtn.click();

    await expect
      .poll(async () => {
        const events = await readDebugEvents(page);
        return events.filter(
          (e) => e.event && e.path === 'embed_copy/event-loop-tasks-microtasks',
        ).length;
      })
      .toBe(1);
  });

  test('tracks spec_link_click on #sources links via click delegation', async ({
    page,
    context,
  }) => {
    await context.route('**/*', (route) => {
      const url = route.request().url();
      if (url.startsWith('http://127.0.0.1') || url.startsWith('http://localhost')) {
        return route.continue();
      }
      return route.fulfill({ status: 200, contentType: 'text/html', body: '' });
    });

    await page.goto('/concepts/event-loop-tasks-microtasks/', { waitUntil: 'networkidle' });

    const firstSourceLink = page.locator('#sources a').first();
    await expect(firstSourceLink).toBeVisible();

    const popupPromise = page.waitForEvent('popup').catch(() => null);
    await firstSourceLink.click();
    const popup = await popupPromise;
    if (popup) await popup.close();

    const events = await readDebugEvents(page);
    expect(
      events.filter((e) => e.event && e.path === 'spec_link_click/event-loop-tasks-microtasks'),
    ).toHaveLength(1);
  });

  test('tracks pageviews on initial load and internal navigation', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });

    const homeEvents = await readDebugEvents(page);
    const homePageviews = homeEvents.filter((e) => !e.event);
    expect(homePageviews).toEqual([{ path: '/', event: false }]);

    const conceptLink = page.locator('a[href*="/concepts/"]').first();
    await expect(conceptLink).toBeVisible();
    await conceptLink.click();
    await page.waitForURL(/\/concepts\/[^/]+\//);

    const expectedPath = new URL(page.url()).pathname;

    await expect
      .poll(async () => {
        const events = await readDebugEvents(page);
        const pageviews = events.filter((e) => !e.event);
        return pageviews[pageviews.length - 1]?.path;
      })
      .toBe(expectedPath);

    const afterEvents = await readDebugEvents(page);
    const matching = afterEvents.filter((e) => !e.event && e.path === expectedPath);
    expect(matching).toHaveLength(1);
  });
});
