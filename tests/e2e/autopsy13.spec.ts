import { test, expect } from '@playwright/test';

test.describe('Autopsy #13: useeffect-dependency-loop-ddos', () => {
  test('renders on /autopsies, steps through all 5 StepMachineLab states, and links back from virtual-dom-reconciliation', async ({
    page,
  }) => {
    await page.route('https://static.cloudflareinsights.com/**', (route) => route.abort());

    for (const viewport of [
      { width: 1440, height: 900 },
      { width: 390, height: 844 },
    ]) {
      await page.setViewportSize(viewport);

      // 1. Verify /autopsies/ lists Autopsy #13
      await page.goto('/autopsies/', { waitUntil: 'networkidle' });
      await expect(
        page.getByRole('link', { name: /The useEffect Dependency Loop That DDoSed Our Own API/i })
      ).toBeVisible();

      // 2. Verify /autopsies/useeffect-dependency-loop-ddos/ and step through all 5 simulator steps
      await page.goto('/autopsies/useeffect-dependency-loop-ddos/', { waitUntil: 'networkidle' });
      await expect(page.locator('h1')).toContainText('useEffect Dependency Loop');

      const hasOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth
      );
      expect(hasOverflow).toBe(false);

      const lab = page.locator('#lab');
      await expect(lab).toBeVisible();

      const nextBtn = lab.getByRole('button', { name: /Next/i });

      // Step 1
      await expect(lab).toContainText('@0x7f1a04');
      await nextBtn.click();

      // Step 2
      await expect(lab).toContainText('@0x7f1b88');
      await nextBtn.click();

      // Step 3
      await expect(lab).toContainText('@0x7f2c10');
      await nextBtn.click();

      // Step 4
      await expect(lab).toContainText('429 Too Many Requests');
      await nextBtn.click();

      // Step 5
      await expect(lab).toContainText("primitive ('open')");

      // Verify memory inspector values are not clipped horizontally
      const inspectorOverflow = await lab.evaluate((el) => {
        const pre = el.querySelector('pre, code');
        return pre ? pre.scrollWidth > el.clientWidth + 2 : false;
      });
      expect(inspectorOverflow).toBe(false);

      // 3. Verify backlink in Seen in Architecture Autopsies on /concepts/virtual-dom-reconciliation/
      await page.goto('/concepts/virtual-dom-reconciliation/', { waitUntil: 'networkidle' });
      const backlinks = page.locator('text=Seen in Architecture Autopsies').locator('..');
      await expect(backlinks).toContainText('useEffect Dependency Loop');
    }
  });
});
