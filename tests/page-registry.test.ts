import { afterEach, describe, expect, it } from 'vitest';
import {
  getAllPageRefs,
  getPageProofStatusMap,
  PAGE_REF_PROVIDERS,
  type PageKind,
  type PageRef,
} from '@/lib/proof/page-registry';

const ORIGINAL_PROVIDERS = { ...PAGE_REF_PROVIDERS };

afterEach(() => {
  for (const kind of Object.keys(ORIGINAL_PROVIDERS) as PageKind[]) {
    PAGE_REF_PROVIDERS[kind] = ORIGINAL_PROVIDERS[kind];
  }
});

function setOnlyProviders(overrides: Partial<Record<PageKind, (() => PageRef[]) | null>>): void {
  for (const kind of Object.keys(PAGE_REF_PROVIDERS) as PageKind[]) {
    PAGE_REF_PROVIDERS[kind] = overrides[kind] ?? null;
  }
}

describe('page-registry', () => {
  it('returns no collisions when page kinds have disjoint ids and skips null providers', () => {
    setOnlyProviders({
      concept: () => [{ id: 'concept-a', kind: 'concept', proofStatus: 'unverified', mdxPath: 'content/concepts/concept-a.mdx' }],
      autopsy: () => [{ id: 'autopsy-a', kind: 'autopsy', proofStatus: 'proven', mdxPath: 'content/autopsies/autopsy-a.mdx' }],
      'deep-dive': null,
    });

    const { pages, collisions } = getAllPageRefs();
    expect(pages.map((p) => p.id)).toEqual(['concept-a', 'autopsy-a']);
    expect(collisions).toEqual([]);

    const statusMap = getPageProofStatusMap();
    expect(statusMap.get('concept-a')).toBe('unverified');
    expect(statusMap.get('autopsy-a')).toBe('proven');
  });

  it('detects collisions when two page kinds share the same id', () => {
    setOnlyProviders({
      autopsy: () => [{ id: 'double-payment-race-condition', kind: 'autopsy', proofStatus: 'unverified', mdxPath: 'content/autopsies/double-payment-race-condition.mdx' }],
      symptom: () => [{ id: 'double-payment-race-condition', kind: 'symptom', proofStatus: 'unverified', mdxPath: null }],
    });

    const { collisions } = getAllPageRefs();
    expect(collisions).toEqual([
      { id: 'double-payment-race-condition', kinds: ['autopsy', 'symptom'] },
    ]);
  });
});
