import { describe, expect, it } from 'vitest';
import { UNANCHORED, type Claim, type ClaimsFile } from '@/lib/proof/claim-schema';
import type { PageRef } from '@/lib/proof/page-registry';
import { validateClaimsCorpus } from '@/lib/validators/claims-validator';

function makePage(
  id: string,
  kind: PageRef['kind'] = 'concept',
  proofStatus: PageRef['proofStatus'] = 'unverified'
): PageRef {
  return { id, kind, proofStatus, mdxPath: null };
}

function specClaim(id: string, anchor = 'container-queries'): Claim {
  return {
    id,
    type: 'normative',
    statement: 'Size containment on the inline axis breaks the parent-child sizing cycle.',
    proof: {
      kind: 'spec-quote',
      url: 'https://drafts.csswg.org/css-conditional-5/',
      anchor,
      quote: 'Size containment on the inline axis breaks the parent-child sizing cycle.',
    },
  };
}

function derivedClaim(id: string, from: string[]): Claim {
  return {
    id,
    type: 'derived',
    statement: 'Derived statement with sufficient length to pass schema bounds cleanly.',
    proof: {
      kind: 'derived',
      from,
      reasoning: 'Follows logically from the referenced claims in this synthetic test.',
    },
  };
}

function experimentClaim(id: string, experimentId: string): Claim {
  return {
    id,
    type: 'observable',
    statement: 'Observable browser behavior verified by an isolated headless experiment.',
    proof: {
      kind: 'experiment',
      experimentId,
      expectKeys: ['case-a'],
    },
  };
}

describe('validateClaimsCorpus', () => {
  it('passes an empty corpus with no proven pages', () => {
    const res = validateClaimsCorpus({
      claimsFiles: [],
      pages: [makePage('concept-a')],
      collisions: [],
      experimentIds: new Set(),
    });
    expect(res.valid).toBe(true);
    expect(res.errors).toEqual([]);
    expect(res.warnings).toEqual([]);
  });

  it('reports an orphan claims file when no matching page exists', () => {
    const res = validateClaimsCorpus({
      claimsFiles: [{ pageId: 'ghost-page', claims: [specClaim('ghost-page/c1')] }],
      pages: [],
      collisions: [],
      experimentIds: new Set(),
    });
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.includes('orphan claims file'))).toBe(true);
  });

  it('reports duplicate claim ids across files', () => {
    const sharedClaim = specClaim('page-a/dup');
    const files: ClaimsFile[] = [
      { pageId: 'page-a', claims: [sharedClaim] },
      { pageId: 'page-b', claims: [sharedClaim] },
    ];
    const res = validateClaimsCorpus({
      claimsFiles: files,
      pages: [makePage('page-a'), makePage('page-b')],
      collisions: [],
      experimentIds: new Set(),
    });
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.includes('duplicate claim id'))).toBe(true);
  });

  it('reports derived.from referencing an unknown claim id', () => {
    const res = validateClaimsCorpus({
      claimsFiles: [{ pageId: 'page-a', claims: [derivedClaim('page-a/d1', ['page-b/missing'])] }],
      pages: [makePage('page-a')],
      collisions: [],
      experimentIds: new Set(),
    });
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.includes('references unknown claim'))).toBe(true);
  });

  it('detects a 2-node derived cycle A -> B -> A', () => {
    const res = validateClaimsCorpus({
      claimsFiles: [
        {
          pageId: 'page-a',
          claims: [
            derivedClaim('page-a/a', ['page-a/b']),
            derivedClaim('page-a/b', ['page-a/a']),
          ],
        },
      ],
      pages: [makePage('page-a')],
      collisions: [],
      experimentIds: new Set(),
    });
    expect(res.valid).toBe(false);
    const cycleErrors = res.errors.filter((e) => e.includes('derived cycle:'));
    expect(cycleErrors).toHaveLength(1);
    expect(cycleErrors[0]).toContain('derived cycle: page-a/a -> page-a/b -> page-a/a');
  });

  it('detects a 3-node derived cycle exactly once', () => {
    const res = validateClaimsCorpus({
      claimsFiles: [
        {
          pageId: 'page-a',
          claims: [
            derivedClaim('page-a/a', ['page-a/b']),
            derivedClaim('page-a/b', ['page-a/c']),
            derivedClaim('page-a/c', ['page-a/a']),
          ],
        },
      ],
      pages: [makePage('page-a')],
      collisions: [],
      experimentIds: new Set(),
    });
    expect(res.valid).toBe(false);
    const cycleErrors = res.errors.filter((e) => e.includes('derived cycle:'));
    expect(cycleErrors).toHaveLength(1);
    expect(cycleErrors[0]).toContain('page-a/a -> page-a/b -> page-a/c -> page-a/a');
  });

  it('accepts an acyclic diamond derived graph (A -> B,C; B,C -> D)', () => {
    const res = validateClaimsCorpus({
      claimsFiles: [
        {
          pageId: 'page-a',
          claims: [
            derivedClaim('page-a/a', ['page-a/b', 'page-a/c']),
            derivedClaim('page-a/b', ['page-a/d']),
            derivedClaim('page-a/c', ['page-a/d']),
            specClaim('page-a/d'),
          ],
        },
      ],
      pages: [makePage('page-a')],
      collisions: [],
      experimentIds: new Set(),
    });
    expect(res.valid).toBe(true);
    expect(res.errors).toEqual([]);
  });

  it('reports a missing experiment referenced by an experiment proof', () => {
    const res = validateClaimsCorpus({
      claimsFiles: [{ pageId: 'page-a', claims: [experimentClaim('page-a/obs', 'missing-exp')] }],
      pages: [makePage('page-a')],
      collisions: [],
      experimentIds: new Set(['other-exp']),
    });
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.includes('references missing experiment'))).toBe(true);
  });

  it('rejects a proven page without a claims file (but exempts changelog entries)', () => {
    const res = validateClaimsCorpus({
      claimsFiles: [],
      pages: [makePage('page-a', 'concept', 'proven'), makePage('2026-11-change', 'changelog', 'proven')],
      collisions: [],
      experimentIds: new Set(),
    });
    expect(res.valid).toBe(false);
    expect(res.errors).toHaveLength(1);
    expect(res.errors[0]).toContain(
      '[concept page-a] proof_status is "proven" but content/claims/page-a.claims.json is missing'
    );
  });

  it('rejects an unanchored spec quote on a proven page', () => {
    const res = validateClaimsCorpus({
      claimsFiles: [{ pageId: 'page-a', claims: [specClaim('page-a/s1', UNANCHORED)] }],
      pages: [makePage('page-a', 'concept', 'proven')],
      collisions: [],
      experimentIds: new Set(),
    });
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.includes('unanchored spec quote'))).toBe(true);
  });

  it('allows an unanchored spec quote on an unverified page', () => {
    const res = validateClaimsCorpus({
      claimsFiles: [{ pageId: 'page-a', claims: [specClaim('page-a/s1', UNANCHORED)] }],
      pages: [makePage('page-a', 'concept', 'unverified')],
      collisions: [],
      experimentIds: new Set(),
    });
    expect(res.valid).toBe(true);
  });

  it('counts claims accurately in stats.byType', () => {
    const res = validateClaimsCorpus({
      claimsFiles: [
        {
          pageId: 'page-a',
          claims: [
            specClaim('page-a/s1'),
            specClaim('page-a/s2'),
            experimentClaim('page-a/o1', 'exp-1'),
            derivedClaim('page-a/d1', ['page-a/s1']),
          ],
        },
      ],
      pages: [makePage('page-a')],
      collisions: [],
      experimentIds: new Set(['exp-1']),
    });
    expect(res.valid).toBe(true);
    expect(res.stats).toEqual({
      files: 1,
      claims: 4,
      byType: { normative: 2, observable: 1, derived: 1 },
    });
  });

  it('emits a warning for an id collision when both pages are unverified and no claims file exists', () => {
    const res = validateClaimsCorpus({
      claimsFiles: [],
      pages: [
        makePage('shared-id', 'autopsy', 'unverified'),
        makePage('shared-id', 'symptom', 'unverified'),
      ],
      collisions: [{ id: 'shared-id', kinds: ['autopsy', 'symptom'] }],
      experimentIds: new Set(),
    });
    expect(res.valid).toBe(true);
    expect(res.warnings).toHaveLength(1);
    expect(res.warnings[0]).toContain('shared-id');
  });

  it('emits an error for an id collision when a claims file exists for that id', () => {
    const res = validateClaimsCorpus({
      claimsFiles: [{ pageId: 'shared-id', claims: [specClaim('shared-id/s1')] }],
      pages: [
        makePage('shared-id', 'autopsy', 'unverified'),
        makePage('shared-id', 'symptom', 'unverified'),
      ],
      collisions: [{ id: 'shared-id', kinds: ['autopsy', 'symptom'] }],
      experimentIds: new Set(),
    });
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.includes('page id "shared-id" is used by several content types'))).toBe(true);
  });
});
