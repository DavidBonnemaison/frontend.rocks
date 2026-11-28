import { test, expect } from './fixtures';

test.describe('ReadingProgress CSS scroll-driven bar', () => {
  test('scales proportionally to scroll position when scroll() timeline is supported, or stays display:none', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/concepts/event-loop-tasks-microtasks/', { waitUntil: 'networkidle' });

    const bar = page.getByTestId('reading-progress');
    await expect(bar).toBeAttached();

    const supportsScrollTimeline = await page.evaluate(() =>
      CSS.supports('animation-timeline: scroll()')
    );

    if (!supportsScrollTimeline) {
      const display = await bar.evaluate((el) => getComputedStyle(el).display);
      expect(display).toBe('none');
      return;
    }

    // Scroll to 50% of the scrollable height (instant to bypass html scroll-behavior: smooth)
    await page.evaluate(() => {
      const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
      window.scrollTo({ top: Math.round(maxScroll * 0.5), behavior: 'instant' });
    });
    await page.waitForTimeout(100);

    const scaleX = await bar.evaluate((el) => {
      const tf = getComputedStyle(el).transform;
      if (!tf || tf === 'none') return 0;
      const match = /matrix\(([^,]+),/.exec(tf);
      return match ? parseFloat(match[1]) : 0;
    });

    expect(scaleX).toBeGreaterThanOrEqual(0.4);
    expect(scaleX).toBeLessThanOrEqual(0.6);
  });
});
