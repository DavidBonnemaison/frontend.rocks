import { describe, expect, it } from 'vitest';
import {
  buildDigestDraft,
  computeIsoWeekId,
  detectObsolescenceCandidates,
  extractBrowserSupport,
  formatBaselineRadarMarkdown,
  mapBaselineToMaturity,
  updateConceptFrontmatterRaw,
  type BaselineChange,
  type PublicationSignal,
} from '../src/lib/baseline-radar';
import { WeeklyDigestSchema, type ConceptFrontmatter } from '../src/lib/schemas';

function makeConcept(overrides: Partial<ConceptFrontmatter>): ConceptFrontmatter {
  return {
    id: 'sample-concept',
    title: 'Sample Concept',
    domain: 'web-apis',
    maturity_status: 'interop-experimental',
    summary_tldr: 'A concise summary of a sample web platform concept for testing purposes.',
    relations: [],
    sources: ['https://developer.mozilla.org/en-US/docs/Web/API'],
    last_verified_at: '2026-11-10',
    proof_status: 'unverified',
    web_feature_id: 'popover',
    ...overrides,
  };
}

describe('Living Baseline Radar (US-18.2)', () => {
  describe('mapBaselineToMaturity', () => {
    it('maps web-features baseline values to MaturityStatus', () => {
      expect(mapBaselineToMaturity('high')).toBe('baseline-widely');
      expect(mapBaselineToMaturity('low')).toBe('baseline-newly');
      expect(mapBaselineToMaturity(false)).toBe('interop-experimental');
      expect(mapBaselineToMaturity(undefined)).toBe('interop-experimental');
    });
  });

  describe('extractBrowserSupport', () => {
    it('normalizes browser versions and baseline notes', () => {
      const support = extractBrowserSupport(
        {
          kind: 'feature',
          status: {
            baseline: 'high',
            baseline_high_date: '2026-10-16',
            support: { chrome: '114', firefox: '≤125', safari: '17' },
          },
        },
        'baseline-widely'
      );

      expect(support).toEqual({
        baseline_status: 'baseline-widely',
        chrome: '114+',
        firefox: '125+',
        safari: '17+',
        notes: 'Baseline Widely Available since 2026-10-16.',
      });
    });

    it('marks missing browser versions as Not supported', () => {
      const support = extractBrowserSupport(
        {
          kind: 'feature',
          status: {
            baseline: false,
            support: { chrome: '129' },
          },
        },
        'interop-experimental'
      );

      expect(support.chrome).toBe('129+');
      expect(support.firefox).toBe('Not supported');
      expect(support.safari).toBe('Not supported');
    });
  });

  describe('detectObsolescenceCandidates', () => {
    it('flags target concepts on replaces edges when source reaches Baseline', () => {
      const concepts: ConceptFrontmatter[] = [
        makeConcept({
          id: 'css-anchor-positioning',
          title: 'CSS Anchor Positioning',
          maturity_status: 'interop-experimental',
          relations: [
            {
              target_id: 'js-floating-positioning-engines',
              type: 'replaces',
              note: 'Native anchor positioning eliminates JS floating positioning loops.',
            },
            {
              target_id: 'css-stacking-context',
              type: 'requires',
              note: 'Requires understanding stacking contexts and containing blocks.',
            },
          ],
        }),
        makeConcept({
          id: 'js-floating-positioning-engines',
          title: 'JS Floating Positioning Engines',
          maturity_status: 'legacy-pattern',
          web_feature_id: undefined,
        }),
      ];

      const changes: BaselineChange[] = [
        {
          conceptId: 'css-anchor-positioning',
          title: 'CSS Anchor Positioning',
          webFeatureId: 'anchor-positioning',
          previousMaturity: 'interop-experimental',
          nextMaturity: 'baseline-newly',
          maturityChanged: true,
          supportChanged: true,
          nextSupport: {
            baseline_status: 'baseline-newly',
            chrome: '125+',
            firefox: '145+',
            safari: '26+',
          },
        },
      ];

      const candidates = detectObsolescenceCandidates(concepts, changes);
      expect(candidates).toHaveLength(1);
      expect(candidates[0]).toMatchObject({
        sourceConceptId: 'css-anchor-positioning',
        sourceNextMaturity: 'baseline-newly',
        targetConceptId: 'js-floating-positioning-engines',
        targetCurrentMaturity: 'legacy-pattern',
      });
    });

    it('skips targets already marked superseded', () => {
      const concepts: ConceptFrontmatter[] = [
        makeConcept({
          id: 'popover-api-light-dismiss',
          title: 'Popover API',
          maturity_status: 'baseline-newly',
          relations: [
            {
              target_id: 'react-portal-zindex-legacy',
              type: 'replaces',
              note: 'Native top-layer popover replaces portal z-index ladders.',
            },
          ],
        }),
        makeConcept({
          id: 'react-portal-zindex-legacy',
          title: 'React Portal z-index Ladders',
          maturity_status: 'superseded',
          web_feature_id: undefined,
        }),
      ];

      const changes: BaselineChange[] = [
        {
          conceptId: 'popover-api-light-dismiss',
          title: 'Popover API',
          webFeatureId: 'popover',
          previousMaturity: 'baseline-newly',
          nextMaturity: 'baseline-widely',
          maturityChanged: true,
          supportChanged: true,
          nextSupport: {
            baseline_status: 'baseline-widely',
            chrome: '116+',
            firefox: '125+',
            safari: '17+',
          },
        },
      ];

      expect(detectObsolescenceCandidates(concepts, changes)).toHaveLength(0);
    });
  });

  describe('buildDigestDraft', () => {
    it('returns null when no significant Baseline change or new publication occurred', () => {
      const draft = buildDigestDraft({
        now: new Date('2026-11-24T07:00:00Z'),
        changes: [],
        obsolescenceCandidates: [],
        newPublications: [],
        allConcepts: [makeConcept({ id: 'popover-api-light-dismiss' })],
      });
      expect(draft).toBeNull();
    });

    it('generates a WeeklyDigest conforming to WeeklyDigestSchema', () => {
      const concepts: ConceptFrontmatter[] = [
        makeConcept({ id: 'css-anchor-positioning', title: 'CSS Anchor Positioning' }),
        makeConcept({ id: 'js-floating-positioning-engines', title: 'JS Floating Engines' }),
        makeConcept({ id: 'popover-api-light-dismiss', title: 'Popover API' }),
        makeConcept({ id: 'css-container-queries', title: 'CSS Container Queries' }),
        makeConcept({ id: 'view-transitions-api', title: 'View Transitions API' }),
        makeConcept({ id: 'scroll-driven-animations', title: 'Scroll-Driven Animations' }),
      ];

      const changes: BaselineChange[] = [
        {
          conceptId: 'css-anchor-positioning',
          title: 'CSS Anchor Positioning',
          webFeatureId: 'anchor-positioning',
          previousMaturity: 'interop-experimental',
          nextMaturity: 'baseline-newly',
          maturityChanged: true,
          supportChanged: true,
          nextSupport: {
            baseline_status: 'baseline-newly',
            chrome: '125+',
            firefox: '145+',
            safari: '26+',
          },
          specUrl: 'https://drafts.csswg.org/css-anchor-position-1/',
        },
      ];

      const newPublications: PublicationSignal[] = [
        {
          kind: 'autopsy',
          id: 'autopsy-anchor-overflow',
          title: 'The Floating Menu That Escaped Overflow',
          date: '2026-11-20',
          summary: 'How native CSS Anchor Positioning eliminated 400 lines of scroll listeners.',
          sourceUrl: 'https://frontend.rocks/autopsies/autopsy-anchor-overflow',
          relatedConcepts: ['css-anchor-positioning'],
        },
      ];

      const draft = buildDigestDraft({
        now: new Date('2026-11-24T07:00:00Z'),
        changes,
        obsolescenceCandidates: [
          {
            sourceConceptId: 'css-anchor-positioning',
            sourceTitle: 'CSS Anchor Positioning',
            sourceNextMaturity: 'baseline-newly',
            targetConceptId: 'js-floating-positioning-engines',
            targetTitle: 'JS Floating Engines',
            targetCurrentMaturity: 'legacy-pattern',
            relationNote: 'Native anchor positioning replaces JS floating positioning.',
          },
        ],
        newPublications,
        allConcepts: concepts,
      });

      expect(draft).not.toBeNull();
      const validated = WeeklyDigestSchema.parse(draft);
      expect(validated.id).toBe(computeIsoWeekId(new Date('2026-11-24T07:00:00Z')));
      expect(validated.entries.length).toBeGreaterThanOrEqual(5);
      expect(validated.entries.length).toBeLessThanOrEqual(8);
      expect(validated.entries[0]?.category).toBe('obsolescence-alert');
    });
  });

  describe('updateConceptFrontmatterRaw & formatBaselineRadarMarkdown', () => {
    it('updates maturity_status and last_verified_at without altering body', () => {
      const raw = [
        '---',
        'id: popover-api-light-dismiss',
        'maturity_status: baseline-newly',
        "last_verified_at: '2026-11-01'",
        'web_feature_id: popover',
        '---',
        '',
        '# Popover API',
      ].join('\n');

      const updated = updateConceptFrontmatterRaw(raw, {
        maturity_status: 'baseline-widely',
        last_verified_at: '2026-11-24',
      });

      expect(updated).toContain('maturity_status: baseline-widely');
      expect(updated).toContain("last_verified_at: '2026-11-24'");
      expect(updated).toContain('web_feature_id: popover');
      expect(updated).toContain('# Popover API');
    });

    it('renders Markdown summary cleanly', () => {
      const md = formatBaselineRadarMarkdown({
        generatedAt: '2026-11-24T07:00:00.000Z',
        dryRun: true,
        mappedConceptsCount: 48,
        changes: [],
        obsolescenceCandidates: [],
        newPublicationsSinceLastDigest: [],
        latestDigestId: '2026-w46',
        latestDigestDate: '2026-11-15',
        digestDraft: null,
        updatedFiles: [],
        durationMs: 42,
      });

      expect(md).toContain('Living Baseline Radar');
      expect(md).toContain('**Mapped concepts**: 48');
    });
  });
});
