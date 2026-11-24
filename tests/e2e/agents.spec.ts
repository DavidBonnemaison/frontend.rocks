import { test, expect } from './fixtures';

test.describe('Agents page (/agents/)', () => {
  test('renders all 3 sections, a Copy button on every code block, the MCP tools and the raw machine links @smoke', async ({
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

    const response = await page.goto('/agents/', { waitUntil: 'networkidle' });
    expect(response?.status()).toBe(200);

    // Single H1 and 3 main sections
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(
      page.getByRole('heading', { level: 2, name: /Install the Audit Skill/i })
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { level: 2, name: /Connect the MCP Server/i })
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { level: 2, name: /Raw Machine Interfaces/i })
    ).toBeVisible();

    // Every code block has a visible Copy button
    const codeBlocks = page.locator('main pre');
    const blockCount = await codeBlocks.count();
    expect(blockCount).toBeGreaterThan(0);

    for (let i = 0; i < blockCount; i += 1) {
      const shell = codeBlocks.nth(i).locator('xpath=ancestor::*[contains(@class,"code-block-shell")]');
      await expect(shell.getByTestId('copy-code-button')).toBeVisible();
    }

    const codeShells = page.locator('.code-block-shell');

    // Clicking the first Copy button copies the skill install command
    const firstCopyBtn = codeShells.first().getByTestId('copy-code-button');
    await firstCopyBtn.click();
    await expect(firstCopyBtn).toHaveAttribute('data-copied', 'true');
    const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboardText).toContain('npx skills add DavidBonnemaison/frontend-rocks-skills');

    // Only the hosted endpoint is documented: no npm package and no stdio setup
    const mcpSection = page.locator('#mcp-server');
    await expect(mcpSection).toContainText('https://frontend.rocks/mcp');
    await expect(page.getByText('npx -y @frontend-rocks/mcp')).toHaveCount(0);

    // All 4 MCP tool names are documented
    for (const toolName of [
      'diagnose_symptom',
      'get_concept_internals',
      'check_pattern_obsolescence',
      'find_related_autopsy',
    ]) {
      await expect(page.getByRole('heading', { level: 4, name: toolName })).toBeVisible();
    }

    // Raw machine interface links exist with expected hrefs
    const machineSection = page.locator('#machine-interfaces');
    for (const href of [
      '/llms.txt',
      '/llms-full.txt',
      '/graph.json',
      '/audit-rules.json',
    ]) {
      await expect(machineSection.locator(`a[href="${href}"]`)).toBeVisible();
    }

    // Only proven content has a catalog and Markdown twins: the page shows rules or a clean empty state,
    // and never links a twin when there are no rules.
    const emptyState = page.getByTestId('agents-empty-catalog');
    if (await emptyState.count()) {
      await expect(emptyState).toHaveText('No proven audit rules yet.');
      await expect(machineSection.locator('a[href$=".md"]')).toHaveCount(0);
    } else {
      await expect(page.locator('.agents-rule-item').first()).toBeVisible();
    }

    expect(errors).toEqual([]);
  });

  test('links from the home footer to /agents/ without horizontal overflow on mobile', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/', { waitUntil: 'networkidle' });

    const footerAgentsLink = page.locator('footer.site-footer a[href="/agents/"]');
    await expect(footerAgentsLink).toBeVisible();
    await footerAgentsLink.click();
    await page.waitForURL('**/agents/');

    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    const hasHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth
    );
    expect(hasHorizontalOverflow).toBe(false);
    expect(errors).toEqual([]);
  });
});
