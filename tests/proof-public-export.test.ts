import { describe, expect, it } from 'vitest';
import type { PublishedClaimEntry } from '@/lib/proof/published-claims';
import {
  buildPublicProofExports,
  PublicClaimsExportSchema,
  PublicResultsExportSchema,
  stableJsonStringify,
} from '@/lib/proof/public-export-schema';
import { emptyProofResults, type ProofResults } from '@/lib/proof/results-schema';

describe('public proof exports', () => {
  const latest: ProofResults = {
    ...emptyProofResults(),
    generatedAt: '2026-12-01T02:41:44.000Z',
    runner: { playwright: '1.65.1', node: '24.0.0', os: 'linux', react: '19.3.1' },
    engines: { chromium: '159.0', firefox: '159.0', webkit: '27.2' },
    experiments: {
      'exp-pub': {
        'case-1': {
          chromium: {
            status: 'pass',
            observed: { treatment: { ok: true }, control: { ok: false } },
            presented: null,
            error: null,
          },
        },
      },
      'exp-unverified': {
        'case-2': {
          chromium: {
            status: 'pass',
            observed: { treatment: { ok: true }, control: { ok: false } },
            presented: null,
            error: null,
          },
        },
      },
    },
    claims: {
      'page-b/obs': {
        status: 'proven',
        proofKind: 'experiment',
        engines: { chromium: 'pass' },
        checkedAt: '2026-12-01T02:41:44.000Z',
        provenSince: '2026-11-20T02:00:00.000Z',
        failingSince: null,
        reason: null,
        detail: null,
      },
      'page-a/spec': {
        status: 'proven',
        proofKind: 'spec-quote',
        engines: null,
        checkedAt: '2026-12-01T02:41:44.000Z',
        provenSince: '2026-11-20T02:00:00.000Z',
        failingSince: null,
        reason: null,
        detail: null,
      },
      'unverified-page/secret': {
        status: 'proven',
        proofKind: 'experiment',
        engines: { chromium: 'pass' },
        checkedAt: '2026-12-01T02:41:44.000Z',
        provenSince: '2026-11-20T02:00:00.000Z',
        failingSince: null,
        reason: null,
        detail: null,
      },
    },
  };

  const publishedClaims: PublishedClaimEntry[] = [
    {
      pageId: 'page-b',
      pageKind: 'concept',
      pageUrl: '/concepts/page-b/',
      claim: {
        id: 'page-b/obs',
        type: 'observable',
        statement: 'Observable claim on page-b backed by a real experiment.',
        scope: { engines: ['chromium'] },
        proof: { kind: 'experiment', experimentId: 'exp-pub', expectKeys: ['case-1'] },
      },
    },
    {
      pageId: 'page-a',
      pageKind: 'concept',
      pageUrl: '/concepts/page-a/',
      claim: {
        id: 'page-a/spec',
        type: 'normative',
        statement: 'Normative claim on page-a backed by a verified spec quote.',
        proof: {
          kind: 'spec-quote',
          url: 'https://drafts.csswg.org/css-contain-3/',
          anchor: 'size-container',
          quote: 'A query container for size queries must establish inline-size containment.',
        },
      },
    },
  ];

  it('filters to published claims and experiments, sorts stably by id, and validates against schemas', () => {
    const { resultsExport, claimsExport, publishedExperimentIds } = buildPublicProofExports({
      siteUrl: 'https://frontend.rocks',
      latest,
      publishedClaims,
    });

    expect(() => PublicResultsExportSchema.parse(resultsExport)).not.toThrow();
    expect(() => PublicClaimsExportSchema.parse(claimsExport)).not.toThrow();

    expect(resultsExport.license).toBe('CC-BY-4.0');
    expect(claimsExport.license).toBe('CC-BY-4.0');

    // Sorted by id: page-a/spec before page-b/obs
    expect(claimsExport.claims.map((c) => c.id)).toEqual(['page-a/spec', 'page-b/obs']);
    expect(Object.keys(resultsExport.claims)).toEqual(['page-a/spec', 'page-b/obs']);
    expect(resultsExport.claims['unverified-page/secret']).toBeUndefined();
    expect(Object.keys(resultsExport.experiments)).toEqual(['exp-pub']);
    expect(resultsExport.experiments['exp-unverified']).toBeUndefined();
    expect(publishedExperimentIds).toEqual(['exp-pub']);

    // Deterministic serialization regardless of input order
    const reversed = buildPublicProofExports({
      siteUrl: 'https://frontend.rocks',
      latest,
      publishedClaims: [...publishedClaims].reverse(),
    });
    expect(stableJsonStringify(resultsExport)).toBe(stableJsonStringify(reversed.resultsExport));
    expect(stableJsonStringify(claimsExport)).toBe(stableJsonStringify(reversed.claimsExport));
  });
});
