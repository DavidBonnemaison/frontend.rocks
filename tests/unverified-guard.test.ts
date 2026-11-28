import { describe, expect, it } from 'vitest';
import { emptyProofResults, type ProofResults } from '@/lib/proof/results-schema';
import { computeEffectivePageStatus } from '@/lib/proof/page-status';
import { robotsForStatus } from '@/lib/publication';
import { AutopsyFrontmatterSchema } from '@/lib/schemas';
import { isAllowedUnverified } from '@/lib/validators/unverified-guard';

function makeResults(overrides?: Partial<ProofResults>): ProofResults {
  const base = emptyProofResults();
  return {
    ...base,
    ...overrides,
  };
}

describe('isAllowedUnverified', () => {
  it('allows an unverified page when one of its own claims has failingSince', () => {
    const claimsByPage = new Map<string, string[]>([
      ['demo-concept', ['demo-concept/first-claim']],
    ]);
    const results = makeResults({
      claims: {
        'demo-concept/first-claim': {
          status: 'failed',
          proofKind: 'experiment',
          engines: { chromium: 'fail', firefox: 'fail', webkit: 'fail' },
          checkedAt: '2026-12-01T02:00:00Z',
          provenSince: null,
          failingSince: '2026-11-29T02:00:00Z',
          reason: null,
          detail: null,
        },
      },
    });

    expect(isAllowedUnverified('demo-concept', claimsByPage, results)).toBe(true);
  });

  it('allows an unverified page listed in demotedPages even if its failing claim was deleted', () => {
    const claimsByPage = new Map<string, string[]>([['demo-concept', []]]);
    const results = makeResults({
      demotedPages: {
        'demo-concept': {
          since: '2026-11-29T02:00:00Z',
          claimIds: ['demo-concept/removed-claim'],
        },
      },
    });

    expect(isAllowedUnverified('demo-concept', claimsByPage, results)).toBe(true);
  });

  it('allows an unverified page when a cited foreign claim has failingSince', () => {
    const claimsByPage = new Map<string, string[]>([['demo-concept', []]]);
    const results = makeResults({
      pages: {
        'demo-concept': {
          coverage: {
            pageId: 'demo-concept',
            status: 'pass',
            enforced: true,
            violations: [],
            stats: {},
            foreignClaimIds: ['other-page/cited-claim'],
          },
        },
      },
      claims: {
        'other-page/cited-claim': {
          status: 'stale',
          proofKind: 'spec-quote',
          engines: null,
          checkedAt: '2026-12-01T02:00:00Z',
          provenSince: null,
          failingSince: '2026-11-28T02:00:00Z',
          reason: null,
          detail: null,
        },
      },
    });

    expect(isAllowedUnverified('demo-concept', claimsByPage, results)).toBe(true);
  });

  it('refuses an unverified page with neither failingSince nor demotedPages entry', () => {
    const claimsByPage = new Map<string, string[]>([
      ['demo-concept', ['demo-concept/clean-claim']],
    ]);
    const results = makeResults({
      claims: {
        'demo-concept/clean-claim': {
          status: 'proven',
          proofKind: 'spec-quote',
          engines: null,
          checkedAt: '2026-12-01T02:00:00Z',
          provenSince: '2026-11-25T02:00:00Z',
          failingSince: null,
          reason: null,
          detail: null,
        },
      },
    });

    expect(isAllowedUnverified('demo-concept', claimsByPage, results)).toBe(false);
  });

  it('keeps demoted pages unverified and noindex via effective status and robotsForStatus', () => {
    const eff = computeEffectivePageStatus({
      pageId: 'demo-concept',
      proofStatus: 'unverified',
      claims: null,
      results: makeResults({
        demotedPages: {
          'demo-concept': {
            since: '2026-11-20T02:00:00Z',
            claimIds: ['demo-concept/first-claim'],
          },
        },
      }),
      now: new Date('2026-12-01T02:00:00Z'),
    });
    expect(eff.status).toBe('unverified');
    expect(robotsForStatus('unverified')).toEqual({ index: false, follow: true });
  });
});

describe('AutopsyFrontmatterSchema traversed_concepts constraint', () => {
  const baseAutopsy = {
    id: 'sample-case',
    case_number: 1,
    piece_color: 'saffron' as const,
    title: 'Sample Incident Case',
    symptom: 'Main thread stalls during click handler',
    failure_mode: 'main-thread-freeze' as const,
    cast: ['julie', 'karim'] as const,
    traversed_concepts: [
      {
        concept_id: 'layout-thrashing',
        step_order: 1,
        role_in_chain: 'Interleaved DOM reads and writes force synchronous reflows.',
      },
      {
        concept_id: 'long-tasks-and-inp',
        step_order: 2,
        role_in_chain: 'Long layout tasks block input responsiveness beyond 200ms.',
      },
    ],
    case_file: {
      trigger: 'Added synchronous height read',
      symptom: 'UI stalls on click',
      root_cause: 'Forced synchronous layout loop',
      bad_fixes: [{ label: 'Memoize child', outcome: 'Did not remove layout read' }],
      fix: 'Batch reads before writes',
      how_to_spot: 'Purple Layout bars in DevTools',
    },
    reading_time_min: 6,
    sources: ['https://web.dev/articles/inp'],
    last_verified_at: '2026-11-27',
  };

  it('allows fewer than 4 traversed_concepts when proof_status is unverified', () => {
    const res = AutopsyFrontmatterSchema.safeParse({
      ...baseAutopsy,
      proof_status: 'unverified',
    });
    expect(res.success).toBe(true);
  });

  it('rejects fewer than 4 traversed_concepts when proof_status is proven', () => {
    const res = AutopsyFrontmatterSchema.safeParse({
      ...baseAutopsy,
      proof_status: 'proven',
    });
    expect(res.success).toBe(false);
  });
});
