import { describe, expect, it } from 'vitest';
import {
  CaseResultSchema,
  ClaimResultSchema,
  emptyProofResults,
  ProofResultsSchema,
} from '../src/lib/proof/results-schema';

function sampleProofResults() {
  return {
    schemaVersion: 1 as const,
    generatedAt: '2026-12-01T02:41:44.000Z',
    runner: { playwright: '1.65.1', node: 'v24.0.0', os: 'linux', react: null },
    engines: { chromium: '143.0.7499.4', firefox: '145.0', webkit: '26.0' },
    experiments: {
      'container-query-inline-size': {
        'applies-at-480': {
          chromium: {
            status: 'pass' as const,
            observed: { treatment: { columns: 2 }, control: { columns: 1 } },
            presented: null,
            error: null,
          },
        },
      },
    },
    experimentMeta: {
      'container-query-inline-size': {
        sourceHash: 'a'.repeat(64),
        runtimeVersion: '1',
        vacuity: {
          chromium: {
            ok: true,
            checks: { differs: true, mutationChanges: true, blankDiffers: true },
            detail: null,
          },
        },
        checkedAt: '2026-12-01T02:41:44.000Z',
      },
    },
    claims: {
      'css-container-queries/applies-at-container-width': {
        status: 'proven' as const,
        proofKind: 'experiment' as const,
        engines: { chromium: 'pass' as const, firefox: 'pass' as const, webkit: 'pass' as const },
        checkedAt: '2026-12-01T02:41:44.000Z',
        provenSince: '2026-12-01T02:41:44.000Z',
        failingSince: null,
        reason: null,
        detail: null,
      },
    },
    pages: {},
    demotedPages: {},
  };
}

describe('proof results schema', () => {
  it('accepts a valid ProofResults payload', () => {
    expect(() => ProofResultsSchema.parse(sampleProofResults())).not.toThrow();
  });

  it('accepts emptyProofResults()', () => {
    expect(() => ProofResultsSchema.parse(emptyProofResults())).not.toThrow();
  });

  it('defaults missing experimentMeta and pages for older files', () => {
    const { experimentMeta: _m, pages: _p, ...older } = sampleProofResults();
    void _m;
    void _p;
    const parsed = ProofResultsSchema.parse(older);
    expect(parsed.experimentMeta).toEqual({});
    expect(parsed.pages).toEqual({});
  });

  it('rejects a CaseResult with status "skipped"', () => {
    const res = CaseResultSchema.safeParse({
      status: 'skipped',
      observed: { treatment: true, control: false },
      presented: null,
      error: null,
    });
    expect(res.success).toBe(false);
  });

  it('rejects engine "safari" in engines map', () => {
    const sample = sampleProofResults();
    const res = ProofResultsSchema.safeParse({
      ...sample,
      engines: { ...sample.engines, safari: '18.0' },
    });
    expect(res.success).toBe(false);
  });

  it('accepts ClaimResult.engines with "missing" and rejects "skipped"', () => {
    const base = {
      status: 'pending' as const,
      proofKind: 'experiment' as const,
      checkedAt: null,
      provenSince: null,
      failingSince: null,
      reason: null,
      detail: null,
    };
    expect(ClaimResultSchema.safeParse({ ...base, engines: { chromium: 'missing' } }).success).toBe(
      true
    );
    expect(ClaimResultSchema.safeParse({ ...base, engines: { chromium: 'skipped' } }).success).toBe(
      false
    );
  });

  it('rejects ClaimResult when failingSince is missing', () => {
    const res = ClaimResultSchema.safeParse({
      status: 'proven',
      proofKind: 'spec-quote',
      engines: null,
      checkedAt: '2026-12-01T02:41:44.000Z',
      provenSince: '2026-12-01T02:41:44.000Z',
      reason: null,
      detail: null,
    });
    expect(res.success).toBe(false);
  });

  it('rejects ProofResults when runner.os is missing', () => {
    const sample = sampleProofResults();
    const res = ProofResultsSchema.safeParse({
      ...sample,
      runner: { playwright: '1.65.1', node: 'v24.0.0', react: null },
    });
    expect(res.success).toBe(false);
  });
});
