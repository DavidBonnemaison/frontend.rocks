import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PageProofSummary } from '@/lib/proof/page-proof.types';
import { ProofChip } from '@/components/proof/ProofChip';
import { ProofDegradedBanner } from '@/components/proof/ProofDegradedBanner';
import { ProofPanel } from '@/components/proof/ProofPanel';

const FIXTURES_DIR = path.resolve(__dirname, 'fixtures', 'proof');

describe('ProofChip, ProofDegradedBanner, and ProofPanel', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('renders ProofChip and ProofPanel from fixture summary without browser brands', async () => {
    vi.stubEnv('FRONTEND_ROCKS_CONTENT_DIR', FIXTURES_DIR);
    vi.resetModules();
    const { summarizePageProof } = await import('@/lib/proof/page-proof');
    const summary = summarizePageProof(
      'sample-concept',
      'proven',
      new Date('2026-12-02T00:00:00.000Z')
    );
    expect(summary).not.toBeNull();

    const chipHtml = renderToStaticMarkup(React.createElement(ProofChip, { summary: summary! }));
    expect(chipHtml).toContain('data-testid="proof-chip"');
    expect(chipHtml).toContain('4 claims');
    expect(chipHtml).toContain('Chromium, Firefox, WebKit');
    expect(chipHtml).toContain('Dec 1');
    expect(chipHtml).not.toMatch(/\b(Safari|Chrome|Edge)\b/);

    const panelHtml = renderToStaticMarkup(React.createElement(ProofPanel, { summary: summary! }));
    expect(panelHtml).toContain('id="proof"');
    expect(panelHtml).toContain('data-testid="proof-panel"');
    const rows = panelHtml.match(/data-testid="proof-row"/g) ?? [];
    expect(rows).toHaveLength(4);
    expect(panelHtml).toContain('id="claim-container-applies"');
    expect(panelHtml).toContain('out of scope');
    expect(panelHtml).toMatch(/colspan="3"/i);
    expect(panelHtml).not.toMatch(/\b(Safari|Chrome|Edge)\b/);
  });

  it('renders ProofDegradedBanner with both UTC dates for degraded pages', () => {
    const summary: PageProofSummary = {
      pageId: 'sample-concept',
      effectiveStatus: 'degraded',
      degradedSince: '2026-12-01T02:00:00.000Z',
      unverifiedOn: '2026-12-08T02:00:00.000Z',
      total: 2,
      byStatus: { pending: 0, proven: 1, diverges: 1, failed: 0, stale: 0 },
      byType: { observable: 2, normative: 0, implementation: 0, support: 0, measured: 0, derived: 0 },
      engines: { chromium: '159.0', firefox: '159.0', webkit: '27.2' },
      lastCheckedAt: '2026-12-03T02:00:00.000Z',
      rows: [],
      hasExperiments: false,
      experimentIds: [],
    };

    const html = renderToStaticMarkup(React.createElement(ProofDegradedBanner, { summary }));
    expect(html).toContain('data-testid="proof-degraded-banner"');
    expect(html).toContain('role="status"');
    expect(html).toContain('Dec 1, 2026');
    expect(html).toContain('Dec 8, 2026');
  });
});
