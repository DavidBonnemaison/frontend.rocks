import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { getRecertSummary } from '@/lib/recertification/loader';
import { RecertSummarySchema, type RecertSummary } from '@/lib/recertification/summary-schema';
import { validateRecertSummary } from '@/lib/recertification/validate';
import { RecertificationStats } from '@/components/proof/RecertificationStats';

const SAMPLE_SUMMARY: RecertSummary = {
  schemaVersion: 1,
  generatedAt: '2026-12-15T12:00:00.000Z',
  pagesBefore: { concept: 130, autopsy: 14, symptom: 18, vs: 12 },
  pagesProven: { concept: 102, autopsy: 0, symptom: 0, vs: 0 },
  pagesMerged: 16,
  pagesDeleted: 12,
  claims: { candidates: 1000, proven: 540, narrowed: 85, dropped: 375 },
  dropRate: 0.375,
};

describe('recertification summary schema and validator', () => {
  it('accepts a valid summary and rejects extra keys via strict()', () => {
    expect(RecertSummarySchema.safeParse(SAMPLE_SUMMARY).success).toBe(true);
    expect(
      RecertSummarySchema.safeParse({
        ...SAMPLE_SUMMARY,
        extraKey: 'not-allowed',
      }).success,
    ).toBe(false);
  });

  it('fails validation when pagesProven.concept does not match disk count', () => {
    const ok = validateRecertSummary(SAMPLE_SUMMARY, 102);
    expect(ok.ok).toBe(true);

    const mismatch = validateRecertSummary(SAMPLE_SUMMARY, 101);
    expect(mismatch.ok).toBe(false);
    if (!mismatch.ok) {
      expect(mismatch.errors[0]).toContain('pagesProven.concept (102)');
      expect(mismatch.errors[0]).toContain('(101)');
    }
  });

  it('returns null from getRecertSummary when summary.json is absent', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fr-recert-summary-'));
    try {
      expect(getRecertSummary(tmp)).toBeNull();
      const dir = path.join(tmp, 'recertification');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'summary.json'), JSON.stringify(SAMPLE_SUMMARY));
      expect(getRecertSummary(tmp)).toEqual(SAMPLE_SUMMARY);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('renders RecertificationStats with injected figures and zero forbidden terms', () => {
    const html = renderToStaticMarkup(React.createElement(RecertificationStats, { summary: SAMPLE_SUMMARY }));
    expect(html).toContain('Re-certification');
    expect(html).toContain('December 2026');
    expect(html).toContain('625 claims survived (85 of them narrowed');
    expect(html).toContain('375 were deleted');
    expect(html).toContain('(37.5%)');
    expect(html).toContain('16 pages were merged into a neighbour, 12 were retired.');

    for (const forbidden of ['gemini', 'prompt', 'pipeline', 'queue', '.agents']) {
      expect(html.toLowerCase()).not.toContain(forbidden);
    }
  });

  it('renders nothing when summary is null', () => {
    const html = renderToStaticMarkup(React.createElement(RecertificationStats, { summary: null }));
    expect(html).toBe('');
  });
});
