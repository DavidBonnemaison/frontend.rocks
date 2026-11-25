import { describe, expect, it } from 'vitest';
import {
  ClaimSchema,
  ClaimsFileSchema,
  ExperimentIdSchema,
  makeClaimId,
  splitClaimId,
  type Claim,
} from '@/lib/proof/claim-schema';

function validClaim(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'css-container-queries/size-containment',
    type: 'normative',
    statement: 'Size containment on the inline axis breaks the parent-child sizing cycle.',
    proof: {
      kind: 'spec-quote',
      url: 'https://drafts.csswg.org/css-conditional-5/',
      anchor: 'container-queries',
      quote: 'Size containment on the inline axis breaks the parent-child sizing cycle.',
    },
    ...overrides,
  };
}

describe('claim-schema', () => {
  it('rejects reserved experiment ids "index" and "vendor"', () => {
    expect(ExperimentIdSchema.safeParse('index').success).toBe(false);
    expect(ExperimentIdSchema.safeParse('vendor').success).toBe(false);
    expect(ExperimentIdSchema.safeParse('container-query-width').success).toBe(true);
  });

  it('accepts a valid normative spec-quote claim', () => {
    const res = ClaimSchema.safeParse(validClaim());
    expect(res.success).toBe(true);
  });

  it('accepts all 6 valid type/proof.kind combinations', () => {
    const cases: Claim[] = [
      {
        id: 'sample-page/observable-claim',
        type: 'observable',
        statement: 'Setting container-type inline-size activates matching @container rules.',
        proof: {
          kind: 'experiment',
          experimentId: 'container-query-inline-size',
          expectKeys: ['applies-at-480'],
        },
      },
      {
        id: 'sample-page/measured-claim',
        type: 'measured',
        statement: 'Interleaving layout reads and writes takes at least 3x longer than batching.',
        proof: {
          kind: 'experiment',
          experimentId: 'layout-thrashing-cost',
          expectKeys: ['interleaved-slower'],
        },
      },
      {
        id: 'sample-page/normative-claim',
        type: 'normative',
        statement: 'A microtask checkpoint drains all queued microtasks before returning.',
        proof: {
          kind: 'spec-quote',
          url: 'https://html.spec.whatwg.org/multipage/webappapis.html',
          anchor: 'perform-a-microtask-checkpoint',
          quote: 'While the event loop microtask queue is not empty, run the oldest microtask.',
        },
      },
      {
        id: 'sample-page/implementation-claim',
        type: 'implementation',
        statement: 'Blink promotes elements with active transform animations to compositor layers.',
        proof: {
          kind: 'source-quote',
          repo: 'chromium/chromium',
          commit: '0123456789abcdef0123456789abcdef01234567',
          path: 'third_party/blink/renderer/core/paint/compositing/compositing_reason_finder.cc',
          lines: [42, 48],
          quote: 'CompositingReason::kActiveTransformAnimation',
        },
      },
      {
        id: 'sample-page/support-claim',
        type: 'support',
        statement: 'CSS container queries are supported across all baseline browser engines.',
        proof: {
          kind: 'bcd',
          bcdKey: 'css.properties.container-type',
          webFeatureId: 'container-queries',
        },
      },
      {
        id: 'sample-page/derived-claim',
        type: 'derived',
        statement: 'Container queries require inline-size containment to resolve without cycles.',
        proof: {
          kind: 'derived',
          from: ['sample-page/normative-claim', 'sample-page/observable-claim'],
          reasoning: 'Follows directly from the spec requirement and the observed container behavior.',
        },
      },
    ];

    for (const claim of cases) {
      expect(ClaimSchema.safeParse(claim).success).toBe(true);
    }
  });

  it('rejects mismatched claim type and proof kind', () => {
    const res = ClaimSchema.safeParse(
      validClaim({
        type: 'observable',
      })
    );
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.issues.some((i) => i.message.includes('requires proof kind "experiment"'))).toBe(true);
    }
  });

  it('rejects invalid claim ids (uppercase or missing slash)', () => {
    expect(ClaimSchema.safeParse(validClaim({ id: 'CSS/Foo' })).success).toBe(false);
    expect(ClaimSchema.safeParse(validClaim({ id: 'css-container-queries' })).success).toBe(false);
  });

  it('enforces statement length bounds and no leading/trailing whitespace', () => {
    expect(ClaimSchema.safeParse(validClaim({ statement: 'a'.repeat(19) })).success).toBe(false);
    expect(ClaimSchema.safeParse(validClaim({ statement: 'a'.repeat(281) })).success).toBe(false);
    expect(
      ClaimSchema.safeParse(validClaim({ statement: 'Size containment breaks sizing cycles. ' })).success
    ).toBe(false);
  });

  it('rejects spec-quote url containing a fragment', () => {
    const res = ClaimSchema.safeParse(
      validClaim({
        proof: {
          kind: 'spec-quote',
          url: 'https://drafts.csswg.org/css-conditional-5/#container-queries',
          anchor: 'container-queries',
          quote: 'Size containment on the inline axis breaks the parent-child sizing cycle.',
        },
      })
    );
    expect(res.success).toBe(false);
  });

  it('validates source-quote commit length, line range order, and allowed repos', () => {
    const baseSource = {
      type: 'implementation',
      proof: {
        kind: 'source-quote',
        repo: 'chromium/chromium',
        commit: '0123456789abcdef0123456789abcdef01234567',
        path: 'src/file.cc',
        lines: [5, 10],
        quote: 'return true;',
      },
    };

    expect(
      ClaimSchema.safeParse(
        validClaim({ ...baseSource, proof: { ...baseSource.proof, commit: 'a'.repeat(39) } })
      ).success
    ).toBe(false);
    expect(
      ClaimSchema.safeParse(
        validClaim({ ...baseSource, proof: { ...baseSource.proof, lines: [10, 5] } })
      ).success
    ).toBe(false);
    expect(
      ClaimSchema.safeParse(
        validClaim({ ...baseSource, proof: { ...baseSource.proof, repo: 'chromium/src' } })
      ).success
    ).toBe(false);
  });

  it('rejects bcdKey without a dot', () => {
    const res = ClaimSchema.safeParse(
      validClaim({
        type: 'support',
        proof: { kind: 'bcd', bcdKey: 'container-type' },
      })
    );
    expect(res.success).toBe(false);
  });

  it('rejects a derived claim deriving from itself', () => {
    const res = ClaimSchema.safeParse(
      validClaim({
        id: 'css-container-queries/self',
        type: 'derived',
        proof: {
          kind: 'derived',
          from: ['css-container-queries/self'],
          reasoning: 'Circular self-reference should always be rejected by the schema.',
        },
      })
    );
    expect(res.success).toBe(false);
  });

  it('rejects duplicate or unknown engines in scope.engines', () => {
    expect(
      ClaimSchema.safeParse(validClaim({ scope: { engines: ['chromium', 'chromium'] } })).success
    ).toBe(false);
    expect(ClaimSchema.safeParse(validClaim({ scope: { engines: ['safari'] } })).success).toBe(false);
  });

  it('rejects unknown keys at claim level and inside every proof kind', () => {
    expect(ClaimSchema.safeParse(validClaim({ status: 'proven' })).success).toBe(false);

    const proofsWithExtra = [
      {
        type: 'observable',
        proof: { kind: 'experiment', experimentId: 'exp-1', expectKeys: ['k1'], note: 'x' },
      },
      {
        type: 'normative',
        proof: {
          kind: 'spec-quote',
          url: 'https://drafts.csswg.org/css-conditional-5/',
          anchor: 'container-queries',
          quote: 'Size containment on the inline axis breaks the parent-child sizing cycle.',
          note: 'x',
        },
      },
      {
        type: 'implementation',
        proof: {
          kind: 'source-quote',
          repo: 'chromium/chromium',
          commit: '0123456789abcdef0123456789abcdef01234567',
          path: 'src/file.cc',
          lines: [1, 2],
          quote: 'return true;',
          note: 'x',
        },
      },
      {
        type: 'support',
        proof: { kind: 'bcd', bcdKey: 'css.properties.container-type', note: 'x' },
      },
      {
        type: 'derived',
        proof: {
          kind: 'derived',
          from: ['other/claim-a'],
          reasoning: 'Valid reasoning string with at least twenty characters.',
          note: 'x',
        },
      },
    ];

    for (const override of proofsWithExtra) {
      expect(ClaimSchema.safeParse(validClaim(override)).success).toBe(false);
    }
  });

  it('validates ClaimsFileSchema prefix, uniqueness, and non-empty claims', () => {
    expect(
      ClaimsFileSchema.safeParse({
        pageId: 'css-container-queries',
        claims: [validClaim({ id: 'other-page/size-containment' })],
      }).success
    ).toBe(false);

    expect(
      ClaimsFileSchema.safeParse({
        pageId: 'css-container-queries',
        claims: [validClaim(), validClaim()],
      }).success
    ).toBe(false);

    expect(
      ClaimsFileSchema.safeParse({
        pageId: 'css-container-queries',
        claims: [],
      }).success
    ).toBe(false);
  });

  it('splits and constructs claim ids', () => {
    expect(splitClaimId('a-b/c-d')).toEqual({ pageId: 'a-b', slug: 'c-d' });
    expect(makeClaimId('a-b', 'c-d')).toBe('a-b/c-d');
    expect(() => makeClaimId('a', 'Bad Slug')).toThrow();
  });
});
