import { afterEach, describe, expect, it } from 'vitest';
import {
  ConceptFrontmatterFileSchema,
  type ConceptFrontmatterFile,
} from '@/lib/schemas';
import { __setWebFeaturesForTests, type WebFeaturesMap } from '@/lib/proof/support/data';
import { computeConceptMaturity, withComputedMaturity } from '@/lib/proof/support/maturity';
import { migrateConceptRaw } from '../scripts/proof/migrate-maturity';

function makeBaseFrontmatter(
  overrides: Partial<ConceptFrontmatterFile> = {}
): ConceptFrontmatterFile {
  return {
    id: 'demo-concept',
    title: 'Demo Concept',
    domain: 'css-layout',
    summary_tldr: 'A concise technical summary of the mechanism under test.',
    relations: [],
    sources: ['https://drafts.csswg.org/css-conditional-5/'],
    last_verified_at: '2026-11-25',
    proof_status: 'unverified',
    ...overrides,
  };
}

function makeFakeWebFeatures(): WebFeaturesMap {
  return {
    'feat-high': {
      kind: 'feature',
      name: 'High Feature',
      description: 'Widely available feature',
      description_html: '<p>High</p>',
      spec: 'https://example.org/high',
      status: { baseline: 'high', support: {} },
    },
    'feat-low': {
      kind: 'feature',
      name: 'Low Feature',
      description: 'Newly available feature',
      description_html: '<p>Low</p>',
      spec: 'https://example.org/low',
      status: { baseline: 'low', support: {} },
    },
    'feat-limited': {
      kind: 'feature',
      name: 'Limited Feature',
      description: 'Limited availability feature',
      description_html: '<p>Limited</p>',
      spec: 'https://example.org/limited',
      status: { baseline: false, support: {} },
    },
    'feat-moved': {
      kind: 'moved',
      redirect_target: 'feat-high',
    },
  } as unknown as WebFeaturesMap;
}

afterEach(() => {
  __setWebFeaturesForTests(null);
});

describe('computeConceptMaturity', () => {
  it('returns pattern_status when set (legacy-pattern or superseded)', () => {
    __setWebFeaturesForTests(makeFakeWebFeatures());
    expect(
      computeConceptMaturity(
        makeBaseFrontmatter({
          pattern_status: 'legacy-pattern',
          superseded_by: ['modern-api'],
          web_feature_id: 'feat-high',
        })
      )
    ).toBe('legacy-pattern');

    expect(
      computeConceptMaturity(
        makeBaseFrontmatter({
          pattern_status: 'superseded',
          superseded_by: ['modern-api'],
        })
      )
    ).toBe('superseded');
  });

  it('maps web_feature_id Baseline high -> baseline-widely', () => {
    __setWebFeaturesForTests(makeFakeWebFeatures());
    expect(computeConceptMaturity(makeBaseFrontmatter({ web_feature_id: 'feat-high' }))).toBe(
      'baseline-widely'
    );
  });

  it('maps web_feature_id Baseline low -> baseline-newly', () => {
    __setWebFeaturesForTests(makeFakeWebFeatures());
    expect(computeConceptMaturity(makeBaseFrontmatter({ web_feature_id: 'feat-low' }))).toBe(
      'baseline-newly'
    );
  });

  it('maps web_feature_id Baseline false -> interop-experimental', () => {
    __setWebFeaturesForTests(makeFakeWebFeatures());
    expect(computeConceptMaturity(makeBaseFrontmatter({ web_feature_id: 'feat-limited' }))).toBe(
      'interop-experimental'
    );
  });

  it('returns null when neither pattern_status nor web_feature_id is set, or when web_feature_id is invalid', () => {
    __setWebFeaturesForTests(makeFakeWebFeatures());
    expect(computeConceptMaturity(makeBaseFrontmatter())).toBeNull();
    expect(computeConceptMaturity(makeBaseFrontmatter({ web_feature_id: 'feat-moved' }))).toBeNull();
    expect(computeConceptMaturity(makeBaseFrontmatter({ web_feature_id: 'missing' }))).toBeNull();
  });

  it('attaches computed maturity_status via withComputedMaturity', () => {
    __setWebFeaturesForTests(makeFakeWebFeatures());
    const fm = withComputedMaturity(makeBaseFrontmatter({ web_feature_id: 'feat-low' }));
    expect(fm.maturity_status).toBe('baseline-newly');
  });
});

describe('ConceptFrontmatterFileSchema strictness and pattern_status validation', () => {
  it('rejects hand-written maturity_status in file frontmatter', () => {
    const res = ConceptFrontmatterFileSchema.safeParse({
      ...makeBaseFrontmatter(),
      maturity_status: 'baseline-widely',
    });
    expect(res.success).toBe(false);
  });

  it('requires superseded_by when pattern_status is set', () => {
    const invalid = ConceptFrontmatterFileSchema.safeParse({
      ...makeBaseFrontmatter(),
      pattern_status: 'superseded',
    });
    expect(invalid.success).toBe(false);

    const valid = ConceptFrontmatterFileSchema.safeParse({
      ...makeBaseFrontmatter(),
      pattern_status: 'superseded',
      superseded_by: ['css-container-queries'],
    });
    expect(valid.success).toBe(true);
  });
});

describe('migrateConceptRaw', () => {
  it('removes maturity_status for platform features and converts superseded/legacy-pattern to pattern_status', () => {
    const platformMdx = `---\nid: demo\nmaturity_status: baseline-widely\ntitle: "Demo"\n---\n\nBody\n`;
    const r1 = migrateConceptRaw(platformMdx);
    expect(r1.changed).toBe(true);
    expect(r1.previous).toBe('baseline-widely');
    expect(r1.updated).toBe(`---\nid: demo\ntitle: "Demo"\n---\n\nBody\n`);
    expect(migrateConceptRaw(r1.updated).changed).toBe(false);

    const supersededMdx = `---\nid: old\nmaturity_status: superseded\ntitle: "Old"\n---\n\nBody\n`;
    const r2 = migrateConceptRaw(supersededMdx);
    expect(r2.changed).toBe(true);
    expect(r2.previous).toBe('superseded');
    expect(r2.updated).toBe(`---\nid: old\npattern_status: superseded\ntitle: "Old"\n---\n\nBody\n`);
  });
});
