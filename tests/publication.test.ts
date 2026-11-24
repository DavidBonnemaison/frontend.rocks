import { describe, it, expect } from 'vitest';
import {
  isListingIndexable,
  isPublished,
  publishedAutopsies,
  publishedConcepts,
  publishedSymptoms,
  publishedVsPairs,
  robotsForStatus,
} from '@/lib/publication';
import type { LoadedAutopsy, LoadedConcept } from '@/lib/content-loader';
import type { ProductionSymptomConfig } from '@/config/symptoms';
import type { PageProofStatus } from '@/lib/schemas';
import type { VsPair } from '@/lib/vs-pairs';

const concept = (id: string, status: PageProofStatus) =>
  ({ frontmatter: { id, proof_status: status } }) as unknown as LoadedConcept;
const autopsy = (id: string, status: PageProofStatus) =>
  ({ frontmatter: { id, proof_status: status } }) as unknown as LoadedAutopsy;
const symptom = (slug: string, status: PageProofStatus) =>
  ({ slug, proof_status: status }) as unknown as ProductionSymptomConfig;
const pair = (slug: string, status: PageProofStatus) =>
  ({ slug, proof_status: status }) as unknown as VsPair;

describe('publication', () => {
  it('isPublished only accepts proven', () => {
    expect(isPublished('proven')).toBe(true);
    expect(isPublished('unverified')).toBe(false);
  });

  it('publishedConcepts filters a mixed array', () => {
    const out = publishedConcepts([concept('a', 'proven'), concept('b', 'unverified')]);
    expect(out.map((c) => c.frontmatter.id)).toEqual(['a']);
  });

  it('publishedAutopsies and publishedSymptoms filter unverified items', () => {
    expect(publishedAutopsies([autopsy('a', 'unverified')])).toEqual([]);
    expect(publishedSymptoms([symptom('s', 'proven'), symptom('t', 'unverified')])).toHaveLength(1);
  });

  it('publishedVsPairs excludes a pair whose status is unverified', () => {
    const out = publishedVsPairs([pair('a-vs-b', 'unverified'), pair('c-vs-d', 'proven')]);
    expect(out.map((p) => p.slug)).toEqual(['c-vs-d']);
  });

  it('isListingIndexable needs at least one published item', () => {
    expect(isListingIndexable(0)).toBe(false);
    expect(isListingIndexable(1)).toBe(true);
  });

  it('robotsForStatus noindexes unverified pages and keeps follow', () => {
    expect(robotsForStatus('unverified')).toEqual({ index: false, follow: true });
    expect(robotsForStatus('proven')).toEqual({ index: true, follow: true });
  });
});
