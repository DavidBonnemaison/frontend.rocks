import { describe, expect, it } from 'vitest';
import { diffProofResults } from '@/lib/proof/nightly/diff';
import { emptyProofResults, type ProofResults } from '@/lib/proof/results-schema';

const PREV_AT = '2026-11-30T02:17:00.000Z';
const NOW = new Date('2026-12-01T02:17:00.000Z');

describe('diffProofResults', () => {
  it('detects new claims, regressions, recoveries, engine version changes, and observed changes deterministically', () => {
    const previous: ProofResults = {
      ...emptyProofResults(),
      generatedAt: PREV_AT,
      engines: { chromium: '142.0.0.0', firefox: '145.0', webkit: '26.0' },
      experiments: {
        'exp-a': {
          k1: {
            chromium: {
              status: 'pass',
              observed: { treatment: { cols: 2 }, control: { cols: 1 } },
              presented: null,
              error: null,
            },
            webkit: {
              status: 'pass',
              observed: { treatment: { cols: 2 }, control: { cols: 1 } },
              presented: null,
              error: null,
            },
          },
        },
      },
      claims: {
        'page-b/recovers': {
          status: 'diverges',
          proofKind: 'experiment',
          engines: { chromium: 'pass', firefox: 'pass', webkit: 'fail' },
          checkedAt: PREV_AT,
          provenSince: null,
          failingSince: PREV_AT,
          reason: null,
          detail: null,
        },
        'page-a/regresses': {
          status: 'proven',
          proofKind: 'experiment',
          engines: { chromium: 'pass', firefox: 'pass', webkit: 'pass' },
          checkedAt: PREV_AT,
          provenSince: PREV_AT,
          failingSince: null,
          reason: null,
          detail: null,
        },
      },
    };

    const next: ProofResults = {
      ...emptyProofResults(),
      generatedAt: NOW.toISOString(),
      engines: { chromium: '143.0.7499.4', firefox: '145.0', webkit: '26.0' },
      experiments: {
        'exp-a': {
          k1: {
            chromium: {
              status: 'pass',
              observed: { control: { cols: 1 }, treatment: { cols: 2 } }, // same JSON, different key order
              presented: null,
              error: null,
            },
            webkit: {
              status: 'fail',
              observed: { treatment: { cols: 1 }, control: { cols: 1 } },
              presented: null,
              error: null,
            },
          },
        },
      },
      claims: {
        'page-c/brand-new': {
          status: 'failed',
          proofKind: 'spec-quote',
          engines: null,
          checkedAt: NOW.toISOString(),
          provenSince: null,
          failingSince: null,
          reason: 'quote-not-found',
          detail: 'missing',
        },
        'page-b/recovers': {
          status: 'proven',
          proofKind: 'experiment',
          engines: { chromium: 'pass', firefox: 'pass', webkit: 'pass' },
          checkedAt: NOW.toISOString(),
          provenSince: NOW.toISOString(),
          failingSince: null,
          reason: null,
          detail: null,
        },
        'page-a/regresses': {
          status: 'diverges',
          proofKind: 'experiment',
          engines: { chromium: 'pass', firefox: 'pass', webkit: 'fail' },
          checkedAt: NOW.toISOString(),
          provenSince: null,
          failingSince: NOW.toISOString(),
          reason: null,
          detail: 'webkit failed',
        },
      },
    };

    const diff = diffProofResults(previous, next, NOW, ['transient timeout']);

    expect(diff.at).toBe('2026-12-01T02:17:00.000Z');
    // Sorted deterministically by claimId
    expect(diff.statusChanged).toEqual([
      { claimId: 'page-a/regresses', pageId: 'page-a', from: 'proven', to: 'diverges' },
      { claimId: 'page-b/recovers', pageId: 'page-b', from: 'diverges', to: 'proven' },
      { claimId: 'page-c/brand-new', pageId: 'page-c', from: null, to: 'failed' },
    ]);

    // Brand-new failed claim is never a regression
    expect(diff.regressions).toEqual([
      {
        claimId: 'page-a/regresses',
        pageId: 'page-a',
        from: 'proven',
        to: 'diverges',
        engines: { chromium: 'pass', firefox: 'pass', webkit: 'fail' },
        detail: 'webkit failed',
      },
    ]);

    expect(diff.recoveries).toEqual([
      { claimId: 'page-b/recovers', pageId: 'page-b', from: 'diverges', to: 'proven' },
    ]);

    expect(diff.engineVersionsChanged).toEqual({
      chromium: { from: '142.0.0.0', to: '143.0.7499.4' },
    });

    // Only webkit actually changed observed value (chromium key order difference is ignored)
    expect(diff.observedChanged).toEqual([
      {
        experimentId: 'exp-a',
        expectKey: 'k1',
        engine: 'webkit',
        before: { treatment: { cols: 2 }, control: { cols: 1 } },
        after: { treatment: { cols: 1 }, control: { cols: 1 } },
      },
    ]);

    expect(diff.infraErrors).toEqual(['transient timeout']);
  });
});
