import { describe, expect, it } from 'vitest';
import type { ArtifactKind, ProofArtifact } from '../src/lib/proof/artifact-schema';
import type { Claim, EngineId } from '../src/lib/proof/claim-schema';
import {
  computeClaimResults,
  nextDemotedPages,
  pagesToDemote,
  pagesToPromote,
  type ComputeInput,
} from '../src/lib/proof/claim-status';
import type { PageRef } from '../src/lib/proof/page-registry';
import {
  emptyProofResults,
  type CaseResult,
  type ClaimResult,
  type ProofResults,
} from '../src/lib/proof/results-schema';

const NOW = '2026-12-10T02:17:00.000Z';
const EARLIER = '2026-12-01T02:17:00.000Z';

function makeExpClaim(id: string, opts?: { engines?: EngineId[]; expectKeys?: string[] }): Claim {
  return {
    id,
    type: 'observable',
    statement: 'Observable browser behavior statement long enough.',
    scope: opts?.engines ? { engines: opts.engines } : undefined,
    proof: {
      kind: 'experiment',
      experimentId: 'exp-a',
      expectKeys: opts?.expectKeys ?? ['k1'],
    },
  };
}

function makeCase(status: CaseResult['status']): CaseResult {
  return {
    status,
    observed: { treatment: true, control: false },
    presented: null,
    error: status === 'error' ? 'FR_TIMEOUT' : status === 'vacuous' ? 'vacuous' : null,
  };
}

function baseInput(overrides?: Partial<ComputeInput>): ComputeInput {
  return {
    claims: [],
    experiments: {},
    experimentMeta: {},
    currentSourceHashes: new Map([['exp-a', 'a'.repeat(64)]]),
    currentRuntimeVersion: '1',
    currentExpectKeys: new Map([['exp-a', new Set(['k1', 'k2'])]]),
    verifierReports: new Map(),
    freshExperiments: new Set(['exp-a']),
    previous: {},
    now: NOW,
    ...overrides,
  };
}

describe('computeClaimResults', () => {
  it('1. marks observable claim proven when all 3 engines pass', () => {
    const res = computeClaimResults(
      baseInput({
        claims: [makeExpClaim('p/c1')],
        experiments: {
          'exp-a': {
            k1: { chromium: makeCase('pass'), firefox: makeCase('pass'), webkit: makeCase('pass') },
          },
        },
      })
    );
    expect(res['p/c1']).toMatchObject({
      status: 'proven',
      proofKind: 'experiment',
      engines: { chromium: 'pass', firefox: 'pass', webkit: 'pass' },
      provenSince: NOW,
      failingSince: null,
    });
  });

  it('2. marks diverges when some engines pass and one fails', () => {
    const res = computeClaimResults(
      baseInput({
        claims: [makeExpClaim('p/c1')],
        experiments: {
          'exp-a': {
            k1: { chromium: makeCase('pass'), firefox: makeCase('pass'), webkit: makeCase('fail') },
          },
        },
      })
    );
    expect(res['p/c1'].status).toBe('diverges');
    expect(res['p/c1'].engines?.webkit).toBe('fail');
  });

  it('3. marks failed when all engines fail', () => {
    const res = computeClaimResults(
      baseInput({
        claims: [makeExpClaim('p/c1')],
        experiments: {
          'exp-a': {
            k1: { chromium: makeCase('fail'), firefox: makeCase('fail'), webkit: makeCase('fail') },
          },
        },
      })
    );
    expect(res['p/c1'].status).toBe('failed');
  });

  it('4. treats vacuous in a scope engine as fail (causing diverges with pass elsewhere)', () => {
    const res = computeClaimResults(
      baseInput({
        claims: [makeExpClaim('p/c1')],
        experiments: {
          'exp-a': {
            k1: {
              chromium: makeCase('pass'),
              firefox: makeCase('pass'),
              webkit: makeCase('vacuous'),
            },
          },
        },
      })
    );
    expect(res['p/c1'].status).toBe('diverges');
    expect(res['p/c1'].engines?.webkit).toBe('fail');
  });

  it('5. ignores engines outside scope and omits them from ClaimResult.engines', () => {
    const res = computeClaimResults(
      baseInput({
        claims: [makeExpClaim('p/c1', { engines: ['chromium'] })],
        experiments: {
          'exp-a': {
            k1: { chromium: makeCase('pass'), webkit: makeCase('fail') },
          },
        },
      })
    );
    expect(res['p/c1'].status).toBe('proven');
    expect(res['p/c1'].engines).toEqual({ chromium: 'pass' });
  });

  it('6. returns pending when there are no results and no previous entry', () => {
    const res = computeClaimResults(baseInput({ claims: [makeExpClaim('p/c1')] }));
    expect(res['p/c1'].status).toBe('pending');
  });

  it('7. preserves previous proven status on timeout/error in one engine', () => {
    const prev: ClaimResult = {
      status: 'proven',
      proofKind: 'experiment',
      engines: { chromium: 'pass', firefox: 'pass', webkit: 'pass' },
      checkedAt: EARLIER,
      provenSince: EARLIER,
      failingSince: null,
      reason: null,
      detail: null,
    };
    const res = computeClaimResults(
      baseInput({
        claims: [makeExpClaim('p/c1')],
        experiments: {
          'exp-a': {
            k1: {
              chromium: makeCase('pass'),
              firefox: makeCase('pass'),
              webkit: makeCase('error'),
            },
          },
        },
        previous: { 'p/c1': prev },
      })
    );
    expect(res['p/c1'].status).toBe('proven');
    expect(res['p/c1'].checkedAt).toBe(EARLIER);
    expect(res['p/c1'].detail).toContain('webkit');
  });

  it('8. returns pending on error with pass elsewhere when no previous status exists', () => {
    const res = computeClaimResults(
      baseInput({
        claims: [makeExpClaim('p/c1')],
        experiments: {
          'exp-a': {
            k1: {
              chromium: makeCase('pass'),
              firefox: makeCase('pass'),
              webkit: makeCase('error'),
            },
          },
        },
      })
    );
    expect(res['p/c1'].status).toBe('pending');
  });

  it('9. prioritizes fail over missing within the same engine', () => {
    const res = computeClaimResults(
      baseInput({
        claims: [makeExpClaim('p/c1', { expectKeys: ['k1', 'k2'] })],
        experiments: {
          'exp-a': {
            k1: { chromium: makeCase('fail'), firefox: makeCase('pass'), webkit: makeCase('pass') },
            k2: { firefox: makeCase('pass'), webkit: makeCase('pass') },
          },
        },
      })
    );
    expect(res['p/c1'].engines?.chromium).toBe('fail');
    expect(res['p/c1'].status).toBe('diverges');
  });

  it('10. marks stale when sourceHash changed without re-running and stays stale idempotently', () => {
    const prev: ClaimResult = {
      status: 'proven',
      proofKind: 'experiment',
      engines: { chromium: 'pass', firefox: 'pass', webkit: 'pass' },
      checkedAt: EARLIER,
      provenSince: EARLIER,
      failingSince: null,
      reason: null,
      detail: null,
    };
    const first = computeClaimResults(
      baseInput({
        claims: [makeExpClaim('p/c1')],
        experimentMeta: {
          'exp-a': {
            sourceHash: 'b'.repeat(64),
            runtimeVersion: '1',
            vacuity: {},
            checkedAt: EARLIER,
          },
        },
        freshExperiments: new Set(),
        previous: { 'p/c1': prev },
      })
    );
    expect(first['p/c1'].status).toBe('stale');

    const second = computeClaimResults(
      baseInput({
        claims: [makeExpClaim('p/c1')],
        experimentMeta: {
          'exp-a': {
            sourceHash: 'b'.repeat(64),
            runtimeVersion: '1',
            vacuity: {},
            checkedAt: EARLIER,
          },
        },
        freshExperiments: new Set(),
        previous: first,
      })
    );
    expect(second['p/c1'].status).toBe('stale');
    expect(second['p/c1']).toEqual(first['p/c1']);
  });

  it('11. marks stale when runtimeVersion changed without re-running', () => {
    const prev: ClaimResult = {
      status: 'proven',
      proofKind: 'experiment',
      engines: { chromium: 'pass', firefox: 'pass', webkit: 'pass' },
      checkedAt: EARLIER,
      provenSince: EARLIER,
      failingSince: null,
      reason: null,
      detail: null,
    };
    const res = computeClaimResults(
      baseInput({
        claims: [makeExpClaim('p/c1')],
        experimentMeta: {
          'exp-a': {
            sourceHash: 'a'.repeat(64),
            runtimeVersion: '0',
            vacuity: {},
            checkedAt: EARLIER,
          },
        },
        freshExperiments: new Set(),
        previous: { 'p/c1': prev },
      })
    );
    expect(res['p/c1'].status).toBe('stale');
  });

  it('12. marks failed when expectKeys references a key absent from the bundle', () => {
    const res = computeClaimResults(
      baseInput({
        claims: [makeExpClaim('p/c1', { expectKeys: ['does-not-exist'] })],
      })
    );
    expect(res['p/c1'].status).toBe('failed');
    expect(res['p/c1'].detail).toContain('does-not-exist');
  });

  it('13. handles normative claims from verifier reports (present, missing entry, absent report)', () => {
    const claim: Claim = {
      id: 'p/spec-1',
      type: 'normative',
      statement: 'Normative spec requirement statement long enough.',
      proof: {
        kind: 'spec-quote',
        url: 'https://html.spec.whatwg.org/multipage/',
        anchor: 'sec',
        quote: 'A normative quote long enough to satisfy the schema.',
      },
    };
    const makeArtifact = (status: 'proven' | 'failed' | 'stale', includeClaim = true): Map<ArtifactKind, ProofArtifact> =>
      new Map([
        [
          'spec-quotes',
          {
            schemaVersion: 1,
            kind: 'spec-quotes',
            generatedAt: NOW,
            mode: 'online',
            tooling: {},
            claims: includeClaim
              ? {
                  'p/spec-1': {
                    claimId: 'p/spec-1',
                    status,
                    reason: status === 'proven' ? null : 'quote-not-found',
                    message: status === 'proven' ? null : 'missing',
                    details: {},
                    checkedAt: NOW,
                  },
                }
              : {},
            pages: {},
          },
        ],
      ]);

    expect(
      computeClaimResults(baseInput({ claims: [claim], verifierReports: makeArtifact('proven') }))[
        'p/spec-1'
      ].status
    ).toBe('proven');
    expect(
      computeClaimResults(baseInput({ claims: [claim], verifierReports: makeArtifact('failed') }))[
        'p/spec-1'
      ].status
    ).toBe('failed');
    expect(
      computeClaimResults(baseInput({ claims: [claim], verifierReports: makeArtifact('stale') }))[
        'p/spec-1'
      ].status
    ).toBe('stale');
    expect(
      computeClaimResults(
        baseInput({ claims: [claim], verifierReports: makeArtifact('proven', false) })
      )['p/spec-1'].status
    ).toBe('pending');

    const prevProven: ClaimResult = {
      status: 'proven',
      proofKind: 'spec-quote',
      engines: null,
      checkedAt: EARLIER,
      provenSince: EARLIER,
      failingSince: null,
      reason: null,
      detail: null,
    };
    expect(
      computeClaimResults(baseInput({ claims: [claim], previous: { 'p/spec-1': prevProven } }))[
        'p/spec-1'
      ].status
    ).toBe('proven');
    expect(computeClaimResults(baseInput({ claims: [claim] }))['p/spec-1'].status).toBe('pending');
  });

  it('14. computes derived claims in topological order regardless of input array order', () => {
    const c1 = makeExpClaim('p/c1', { expectKeys: ['k1'] });
    const c2 = makeExpClaim('p/c2', { expectKeys: ['k2'] });
    const d1: Claim = {
      id: 'p/d1',
      type: 'derived',
      statement: 'Derived claim combining two base claims.',
      proof: { kind: 'derived', from: ['p/c1', 'p/c2'], reasoning: 'Follows directly from both.' },
    };
    const d2: Claim = {
      id: 'p/d2',
      type: 'derived',
      statement: 'Second-level derived claim depending on d1.',
      proof: { kind: 'derived', from: ['p/d1'], reasoning: 'Follows transitively from d1.' },
    };

    // Put derived claims BEFORE their dependencies.
    const allProven = computeClaimResults(
      baseInput({
        claims: [d2, d1, c1, c2],
        experiments: {
          'exp-a': {
            k1: { chromium: makeCase('pass'), firefox: makeCase('pass'), webkit: makeCase('pass') },
            k2: { chromium: makeCase('pass'), firefox: makeCase('pass'), webkit: makeCase('pass') },
          },
        },
      })
    );
    expect(allProven['p/d1'].status).toBe('proven');
    expect(allProven['p/d2'].status).toBe('proven');

    // failed + stale -> failed; stale + pending -> stale
    const specFailed: Claim = {
      id: 'p/sf',
      type: 'normative',
      statement: 'Normative claim that fails verification.',
      proof: {
        kind: 'spec-quote',
        url: 'https://example.org/spec',
        anchor: 'a',
        quote: 'Quote text long enough for schema validation.',
      },
    };
    const specStale: Claim = {
      id: 'p/ss',
      type: 'normative',
      statement: 'Normative claim that is stale now.',
      proof: {
        kind: 'spec-quote',
        url: 'https://example.org/spec',
        anchor: 'b',
        quote: 'Another quote text long enough for validation.',
      },
    };
    const dFailedStale: Claim = {
      id: 'p/dfs',
      type: 'derived',
      statement: 'Derived from one failed and one stale claim.',
      proof: { kind: 'derived', from: ['p/sf', 'p/ss'], reasoning: 'Combines failed and stale.' },
    };
    const dStalePending: Claim = {
      id: 'p/dsp',
      type: 'derived',
      statement: 'Derived from one stale and one pending claim.',
      proof: { kind: 'derived', from: ['p/ss', 'p/c1'], reasoning: 'Combines stale and pending.' },
    };
    const verifierReports = new Map<ArtifactKind, ProofArtifact>([
      [
        'spec-quotes',
        {
          schemaVersion: 1,
          kind: 'spec-quotes',
          generatedAt: NOW,
          mode: 'online',
          tooling: {},
          claims: {
            'p/sf': { claimId: 'p/sf', status: 'failed', reason: 'r', message: null, details: {}, checkedAt: NOW },
            'p/ss': { claimId: 'p/ss', status: 'stale', reason: 'r', message: null, details: {}, checkedAt: NOW },
          },
          pages: {},
        },
      ],
    ]);
    const mixed = computeClaimResults(
      baseInput({
        claims: [dFailedStale, dStalePending, specFailed, specStale, c1],
        verifierReports,
      })
    );
    expect(mixed['p/dfs'].status).toBe('failed');
    expect(mixed['p/dsp'].status).toBe('stale');
  });

  it('15. tracks provenSince and failingSince transitions accurately', () => {
    const claim = makeExpClaim('p/c1');
    const passExp = {
      'exp-a': {
        k1: { chromium: makeCase('pass'), firefox: makeCase('pass'), webkit: makeCase('pass') },
      },
    };
    const failExp = {
      'exp-a': {
        k1: { chromium: makeCase('fail'), firefox: makeCase('fail'), webkit: makeCase('fail') },
      },
    };

    const t1 = '2026-12-01T02:00:00.000Z';
    const t2 = '2026-12-02T02:00:00.000Z';
    const t3 = '2026-12-03T02:00:00.000Z';
    const t4 = '2026-12-04T02:00:00.000Z';
    const t5 = '2026-12-05T02:00:00.000Z';

    const r1 = computeClaimResults(baseInput({ claims: [claim], experiments: passExp, now: t1 }));
    expect(r1['p/c1'].provenSince).toBe(t1);
    expect(r1['p/c1'].failingSince).toBeNull();

    const r2 = computeClaimResults(
      baseInput({ claims: [claim], experiments: passExp, previous: r1, now: t2 })
    );
    expect(r2['p/c1'].provenSince).toBe(t1);

    const r3 = computeClaimResults(
      baseInput({ claims: [claim], experiments: failExp, previous: r2, now: t3 })
    );
    expect(r3['p/c1'].failingSince).toBe(t3);

    const r4 = computeClaimResults(
      baseInput({ claims: [claim], experiments: failExp, previous: r3, now: t4 })
    );
    expect(r4['p/c1'].failingSince).toBe(t3);

    const r5 = computeClaimResults(
      baseInput({ claims: [claim], experiments: passExp, previous: r4, now: t5 })
    );
    expect(r5['p/c1'].failingSince).toBeNull();
    expect(r5['p/c1'].provenSince).toBe(t5);
  });
});

describe('demotion and promotion helpers', () => {
  function makeResults(claims: ProofResults['claims'], pages: ProofResults['pages'] = {}): ProofResults {
    return { ...emptyProofResults(), claims, pages };
  }

  function makeFailedClaim(failingSince: string): ClaimResult {
    return {
      status: 'failed',
      proofKind: 'experiment',
      engines: { chromium: 'fail', firefox: 'fail', webkit: 'fail' },
      checkedAt: NOW,
      provenSince: null,
      failingSince,
      reason: null,
      detail: null,
    };
  }

  function makeProvenClaim(): ClaimResult {
    return {
      status: 'proven',
      proofKind: 'experiment',
      engines: { chromium: 'pass', firefox: 'pass', webkit: 'pass' },
      checkedAt: NOW,
      provenSince: EARLIER,
      failingSince: null,
      reason: null,
      detail: null,
    };
  }

  it('16. pagesToDemote demotes proven pages at J-8 (including vs pairs) and ignores J-6, unverified, and symptoms without mdxPath', () => {
    const pages: PageRef[] = [
      { id: 'c-old', kind: 'concept', proofStatus: 'proven', mdxPath: 'content/concepts/c-old.mdx' },
      { id: 'c-recent', kind: 'concept', proofStatus: 'proven', mdxPath: 'content/concepts/c-recent.mdx' },
      { id: 'c-unv', kind: 'concept', proofStatus: 'unverified', mdxPath: 'content/concepts/c-unv.mdx' },
      { id: 'vs-a-vs-b', kind: 'vs', proofStatus: 'proven', mdxPath: null },
      { id: 'sym-ts', kind: 'symptom', proofStatus: 'proven', mdxPath: null },
    ];
    const claimsByPage = new Map<string, Claim[]>([
      ['c-old', [makeExpClaim('c-old/c1')]],
      ['c-recent', [makeExpClaim('c-recent/c1')]],
      ['c-unv', [makeExpClaim('c-unv/c1')]],
      ['vs-a-vs-b', [makeExpClaim('vs-a-vs-b/c1')]],
      ['sym-ts', [makeExpClaim('sym-ts/c1')]],
    ]);
    const results = makeResults({
      'c-old/c1': makeFailedClaim('2026-12-02T02:17:00.000Z'), // J-8
      'c-recent/c1': makeFailedClaim('2026-12-04T02:17:00.000Z'), // J-6
      'c-unv/c1': makeFailedClaim('2026-12-02T02:17:00.000Z'),
      'vs-a-vs-b/c1': makeFailedClaim('2026-12-02T02:17:00.000Z'),
      'sym-ts/c1': makeFailedClaim('2026-12-02T02:17:00.000Z'),
    });

    const demoted = pagesToDemote(pages, claimsByPage, results, NOW);
    expect(demoted).toEqual([
      { pageId: 'c-old', kind: 'concept', file: 'content/concepts/c-old.mdx', claimIds: ['c-old/c1'] },
      { pageId: 'vs-a-vs-b', kind: 'vs', file: 'content/vs/pairs.json', claimIds: ['vs-a-vs-b/c1'] },
    ]);
  });

  it('17. pagesToDemote includes pages whose foreign cited claim failed for >= 7 days', () => {
    const pages: PageRef[] = [
      { id: 'deep-dive-x', kind: 'deep-dive', proofStatus: 'proven', mdxPath: 'content/deep-dives/deep-dive-x.mdx' },
    ];
    const claimsByPage = new Map<string, Claim[]>();
    const results = makeResults(
      { 'other-page/c1': makeFailedClaim('2026-12-02T02:17:00.000Z') },
      {
        'deep-dive-x': {
          coverage: {
            pageId: 'deep-dive-x',
            status: 'pass',
            enforced: true,
            violations: [],
            stats: {},
            foreignClaimIds: ['other-page/c1'],
          },
        },
      }
    );

    expect(pagesToDemote(pages, claimsByPage, results, NOW)).toEqual([
      {
        pageId: 'deep-dive-x',
        kind: 'deep-dive',
        file: 'content/deep-dives/deep-dive-x.mdx',
        claimIds: ['other-page/c1'],
      },
    ]);
  });

  it('18. pagesToPromote promotes only demoted unverified pages whose claims are all proven', () => {
    const pages: PageRef[] = [
      { id: 'p-fixed', kind: 'concept', proofStatus: 'unverified', mdxPath: 'content/concepts/p-fixed.mdx' },
      { id: 'p-broken', kind: 'concept', proofStatus: 'unverified', mdxPath: 'content/concepts/p-broken.mdx' },
      { id: 'p-never', kind: 'concept', proofStatus: 'unverified', mdxPath: 'content/concepts/p-never.mdx' },
    ];
    const claimsByPage = new Map<string, Claim[]>([
      ['p-fixed', [makeExpClaim('p-fixed/c1')]],
      ['p-broken', [makeExpClaim('p-broken/c1')]],
      ['p-never', [makeExpClaim('p-never/c1')]],
    ]);
    const previous: ProofResults = {
      ...emptyProofResults(),
      demotedPages: {
        'p-fixed': { since: EARLIER, claimIds: ['p-fixed/c1'] },
        'p-broken': { since: EARLIER, claimIds: ['p-broken/c1'] },
      },
    };
    const results = makeResults({
      'p-fixed/c1': makeProvenClaim(),
      'p-broken/c1': makeFailedClaim(EARLIER),
      'p-never/c1': makeProvenClaim(),
    });

    expect(pagesToPromote(pages, claimsByPage, previous, results)).toEqual([
      { pageId: 'p-fixed', kind: 'concept', file: 'content/concepts/p-fixed.mdx', claimIds: ['p-fixed/c1'] },
    ]);
  });

  it('19. nextDemotedPages maintains the registry across demotions, promotions, manual fixes, and removals', () => {
    const previous: ProofResults = {
      ...emptyProofResults(),
      demotedPages: {
        'still-pending-pr': { since: EARLIER, claimIds: ['still-pending-pr/c1'] },
        'promoted-page': { since: EARLIER, claimIds: ['promoted-page/c1'] },
        'restored-by-hand': { since: EARLIER, claimIds: ['restored-by-hand/c1'] },
        'deleted-page': { since: EARLIER, claimIds: ['deleted-page/c1'] },
      },
    };
    const pages: PageRef[] = [
      { id: 'still-pending-pr', kind: 'concept', proofStatus: 'proven', mdxPath: 'content/concepts/still-pending-pr.mdx' },
      { id: 'promoted-page', kind: 'concept', proofStatus: 'unverified', mdxPath: 'content/concepts/promoted-page.mdx' },
      { id: 'restored-by-hand', kind: 'concept', proofStatus: 'proven', mdxPath: 'content/concepts/restored-by-hand.mdx' },
      { id: 'newly-demoted', kind: 'concept', proofStatus: 'proven', mdxPath: 'content/concepts/newly-demoted.mdx' },
    ];
    const demoted = [
      { pageId: 'still-pending-pr', kind: 'concept' as const, file: 'content/concepts/still-pending-pr.mdx', claimIds: ['still-pending-pr/c1'] },
      { pageId: 'newly-demoted', kind: 'concept' as const, file: 'content/concepts/newly-demoted.mdx', claimIds: ['newly-demoted/c1'] },
    ];
    const promoted = [
      { pageId: 'promoted-page', kind: 'concept' as const, file: 'content/concepts/promoted-page.mdx', claimIds: ['promoted-page/c1'] },
    ];

    expect(nextDemotedPages(previous, pages, demoted, promoted, NOW)).toEqual({
      'still-pending-pr': { since: EARLIER, claimIds: ['still-pending-pr/c1'] },
      'newly-demoted': { since: NOW, claimIds: ['newly-demoted/c1'] },
    });
  });
});
