import { test, expect } from './fixtures';

test.describe('Content pages block order and anatomy', () => {
  test('renders concept page blocks in order: header, figure, connections, sources', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/concepts/css-container-queries/', { waitUntil: 'networkidle' });

    const header = page.locator('[data-block="header"]');
    const figure = page.locator('[data-block="figure"]');
    const connections = page.locator('[data-block="connections"]');
    const sources = page.locator('#sources');

    await expect(header).toBeVisible();
    await expect(figure).toBeVisible();
    await expect(connections).toBeVisible();
    await expect(sources).toBeVisible();

    const tops = await Promise.all([
      header.evaluate((el) => el.getBoundingClientRect().top + window.scrollY),
      figure.evaluate((el) => el.getBoundingClientRect().top + window.scrollY),
      connections.evaluate((el) => el.getBoundingClientRect().top + window.scrollY),
      sources.evaluate((el) => el.getBoundingClientRect().top + window.scrollY),
    ]);

    expect(tops[0]).toBeLessThan(tops[1]);
    expect(tops[1]).toBeLessThan(tops[2]);
    expect(tops[2]).toBeLessThan(tops[3]);
  });

  test('renders autopsy PieceBlock hero, composite note, numbered chapters, case file, and causal chain', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/autopsies/double-payment-race-condition/', { waitUntil: 'networkidle' });

    await expect(page.locator('.piece-block[data-size="hero"]')).toBeVisible();
    await expect(page.getByTestId('composite-case-note')).toBeVisible();
    await expect(page.locator('h2[data-chapter="true"]').first()).toBeVisible();
    await expect(page.getByTestId('case-file-card')).toBeVisible();
    await expect(page.getByTestId('devtools-detective')).toBeVisible();
    await expect(page.getByTestId('causal-chain-stepper')).toBeVisible();
    await expect(page.locator('#sources')).toBeVisible();
  });

  test('renders symptom console block, likely causes, and no invented engine chips', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/symptoms/z-index-ignored/', { waitUntil: 'networkidle' });

    await expect(page.locator('[data-block="console"]')).toBeVisible();
    await expect(page.getByTestId('symptom-signature')).toBeAttached();
    await expect(page.getByTestId('symptom-engines')).toHaveCount(0);
    await expect(page.locator('[data-block="causes"]')).toBeVisible();
    await expect(
      page.getByRole('heading', { name: /LIKELY CAUSES, MOST COMMON FIRST/i })
    ).toBeVisible();
  });

  test('renders all 5 claim proof kinds in /dev/components/ gallery', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/dev/components/', { waitUntil: 'networkidle' });

    const section = page.locator('#claim-permalinks');
    await expect(section).toBeVisible();
    for (const kind of ['experiment', 'spec-quote', 'source-quote', 'bcd', 'derived']) {
      await expect(
        section.locator(`[data-demo-proof-kind="${kind}"]`).first()
      ).toBeVisible();
    }
  });
});
