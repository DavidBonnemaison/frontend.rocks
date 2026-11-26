import { describe, expect, it } from 'vitest';
import type { ClaimsFile } from '@/lib/proof/claim-schema';
import { computeEffectivePageStatus } from '@/lib/proof/page-status';
import { emptyProofResults, type ClaimResult, type ProofResults } from '@/lib/proof/results-schema';

function makeClaims(pageId: string, slugs: string[]): ClaimsFile {
  return {
    pageId,
    claims: slugs.map((slug) => ({
      id: `${pageId}/${slug}`,
      type: 'normative',
      statement: `Canonical normative statement for ${slug} in tests.`,
      proof: {
        kind: 'spec-quote',
        url: 'https://drafts.csswg.org/css-contain-3/',
        anchor: 'size-container',
        quote: 'A query container for size queries must establish inline-size containment.',
      },
    })),
  };
}

function makeClaimResult(overrides: Partial<ClaimResult>): ClaimResult {
  return {
    status: 'proven',
    proofKind: 'spec-quote',
    engines: null,
    checkedAt: '2026-12-01T02:00:00.000Z',
    provenSince: '2026-11-01T02:00:00.000Z',
    failingSince: null,
    reason: null,
    detail: null,
    ...overrides,
  };
}

function makeResults(
  claims: Record<string, ClaimResult>,
  foreignByPage: Record<string, string[]> = {}
): ProofResults {
  const base = emptyProofResults();
  const pages: ProofResults['pages'] = {};
  for (const [pageId, foreignClaimIds] of Object.entries(foreignByPage)) {
    pages[pageId] = {
      coverage: {
        pageId,
        status: 'pass',
        enforced: true,
        violations: [],
        stats: {},
        foreignClaimIds,
      },
    };
  }
  return { ...base, claims, pages };
}

describe('computeEffectivePageStatus', () => {
  const now = new Date('2026-12-10T12:00:00.000Z');
  const claims = makeClaims('page-a', ['c1', 'c2']);

  it('returns proven when frontmatter is proven and all claims are proven', () => {
    const results = makeResults({
      'page-a/c1': makeClaimResult({ status: 'proven' }),
      'page-a/c2': makeClaimResult({ status: 'proven' }),
    });
    expect(
      computeEffectivePageStatus({ pageId: 'page-a', proofStatus: 'proven', claims, results, now })
    ).toEqual({ status: 'proven', degradedSince: null });
  });

  it('returns degraded when a claim diverges for 3 days (< 7)', () => {
    const failingSince = '2026-12-07T02:00:00.000Z';
    const results = makeResults({
      'page-a/c1': makeClaimResult({ status: 'proven' }),
      'page-a/c2': makeClaimResult({ status: 'diverges', provenSince: null, failingSince }),
    });
    expect(
      computeEffectivePageStatus({ pageId: 'page-a', proofStatus: 'proven', claims, results, now })
    ).toEqual({ status: 'degraded', degradedSince: failingSince });
  });

  it('returns unverified when a claim fails for 8 days (>= 7)', () => {
    const failingSince = '2026-12-02T02:00:00.000Z';
    const results = makeResults({
      'page-a/c1': makeClaimResult({ status: 'proven' }),
      'page-a/c2': makeClaimResult({ status: 'diverges', provenSince: null, failingSince }),
    });
    expect(
      computeEffectivePageStatus({ pageId: 'page-a', proofStatus: 'proven', claims, results, now })
    ).toEqual({ status: 'unverified', degradedSince: null });
  });

  it('returns unverified when a claim is pending and never proven', () => {
    const results = makeResults({
      'page-a/c1': makeClaimResult({ status: 'proven' }),
      'page-a/c2': makeClaimResult({
        status: 'pending',
        checkedAt: null,
        provenSince: null,
        failingSince: null,
      }),
    });
    expect(
      computeEffectivePageStatus({ pageId: 'page-a', proofStatus: 'proven', claims, results, now })
    ).toEqual({ status: 'unverified', degradedSince: null });
  });

  it('returns unverified when frontmatter is unverified regardless of results', () => {
    const results = makeResults({
      'page-a/c1': makeClaimResult({ status: 'proven' }),
      'page-a/c2': makeClaimResult({ status: 'proven' }),
    });
    expect(
      computeEffectivePageStatus({
        pageId: 'page-a',
        proofStatus: 'unverified',
        claims,
        results,
        now,
      })
    ).toEqual({ status: 'unverified', degradedSince: null });
  });

  it('degrades and then unverifies a page when a cited foreign claim regresses', () => {
    const failing3d = '2026-12-07T02:00:00.000Z';
    const results3d = makeResults(
      {
        'page-a/c1': makeClaimResult({ status: 'proven' }),
        'page-a/c2': makeClaimResult({ status: 'proven' }),
        'page-b/foreign': makeClaimResult({
          status: 'failed',
          provenSince: null,
          failingSince: failing3d,
        }),
      },
      { 'page-a': ['page-b/foreign'] }
    );
    expect(
      computeEffectivePageStatus({
        pageId: 'page-a',
        proofStatus: 'proven',
        claims,
        results: results3d,
        now,
      })
    ).toEqual({ status: 'degraded', degradedSince: failing3d });

    const failing8d = '2026-12-02T02:00:00.000Z';
    const results8d = makeResults(
      {
        'page-a/c1': makeClaimResult({ status: 'proven' }),
        'page-a/c2': makeClaimResult({ status: 'proven' }),
        'page-b/foreign': makeClaimResult({
          status: 'failed',
          provenSince: null,
          failingSince: failing8d,
        }),
      },
      { 'page-a': ['page-b/foreign'] }
    );
    expect(
      computeEffectivePageStatus({
        pageId: 'page-a',
        proofStatus: 'proven',
        claims,
        results: results8d,
        now,
      })
    ).toEqual({ status: 'unverified', degradedSince: null });
  });
});
