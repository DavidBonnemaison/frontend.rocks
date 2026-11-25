import { describe, expect, it } from 'vitest';
import { selectPublishableContent } from '@/lib/publishable-content';
import type { LoadedConcept } from '@/lib/content-loader';
import type { ConceptFrontmatter, PageProofStatus } from '@/lib/schemas';
import type { ProductionSymptomConfig } from '@/config/symptoms';

function concept(
  id: string,
  status: PageProofStatus,
  relations: ConceptFrontmatter['relations'] = []
): LoadedConcept {
  return {
    frontmatter: {
      id,
      title: `Concept ${id}`,
      domain: 'rendering-pipeline',
      maturity_status: 'baseline-widely',
      summary_tldr: 'Synthetic summary used by the quarantine tests only.',
      relations,
      sources: ['https://developer.mozilla.org/en-US/'],
      last_verified_at: '2026-01-01',
      proof_status: status,
    },
    body: '',
    sections: {
      tl_dr: 'x',
      interactive_lab: '',
      under_the_hood: 'Under the hood text.',
      genealogy: '',
      production_pitfalls: 'Pitfalls text.',
    },
    lab: null,
    evidence: null,
    claims: null,
    filePath: `fixtures/${id}.mdx`,
  };
}

const contrast = (target: string) => [
  { target_id: target, type: 'contrasts_with' as const, note: 'Synthetic contrast note for tests.' },
];

describe('selectPublishableContent', () => {
  it('returns a pair only when both concepts are proven', () => {
    const out = selectPublishableContent({
      concepts: [
        concept('a', 'proven', contrast('b')),
        concept('b', 'proven', contrast('a')),
        concept('c', 'unverified', contrast('a')),
      ],
      autopsies: [],
      symptoms: [],
    });
    expect(out.concepts.map((c) => c.frontmatter.id)).toEqual(['a', 'b']);
    expect(out.vsPairs.map((p) => p.slug)).toEqual(['a-vs-b']);
  });

  it('excludes a pair with one unverified side', () => {
    const out = selectPublishableContent({
      concepts: [concept('a', 'proven', contrast('c')), concept('c', 'unverified')],
      autopsies: [],
      symptoms: [],
    });
    expect(out.vsPairs).toEqual([]);
  });

  it('excludes unverified symptoms', () => {
    const symptoms = [
      { slug: 's', proof_status: 'unverified' },
    ] as unknown as ProductionSymptomConfig[];
    expect(selectPublishableContent({ concepts: [], autopsies: [], symptoms }).symptoms).toEqual([]);
  });

  it('handles empty input', () => {
    expect(selectPublishableContent({ concepts: [], autopsies: [], symptoms: [] })).toEqual({
      concepts: [],
      autopsies: [],
      symptoms: [],
      vsPairs: [],
    });
  });
});
