import { describe, expect, it } from 'vitest';
import { UNANCHORED } from '@/lib/proof/claim-schema';
import type { EvidenceDossier } from '@/lib/schemas';
import {
  migrateDossier,
  slugify,
  splitUrl,
  toStatement,
} from '../scripts/proof/migrate-evidence-to-claims';

function makeDossier(extracts: EvidenceDossier['normative_extracts']): EvidenceDossier {
  return {
    concept_id: 'css-container-queries',
    compiled_at: '2026-11-15',
    normative_extracts: extracts,
    browser_support: {
      baseline_status: 'baseline-widely',
      chrome: '105+',
      firefox: '110+',
      safari: '16.0+',
    },
    engine_internals: {
      pipeline_phases: ['Layout Containment'],
      mechanism_summary: 'Inline-size containment breaks parent-child sizing loops.',
    },
    production_failures: [
      {
        symptom: 'Container collapses to 0px',
        root_cause: 'Intrinsic width is excluded from size containment.',
        mitigation: 'Give the container an explicit width.',
      },
      {
        symptom: 'Nested @container ignored',
        root_cause: 'Intermediate wrapper creates an unnamed container.',
        mitigation: 'Use container-name on target containers.',
      },
    ],
    sources: ['https://drafts.csswg.org/css-contain-3/'],
  };
}

describe('claims migration helpers', () => {
  it('slugifies spec sections and truncates to 40 chars without trailing hyphen', () => {
    expect(slugify('CSS Containment Module Level 3')).toBe('css-containment-module-level-3');
    const longInput = 'CSS Containment Module Level 3 Section 1234567890 Extra Words';
    const result = slugify(longInput);
    expect(result.length).toBeLessThanOrEqual(40);
    expect(result.endsWith('-')).toBe(false);
    expect(slugify('a'.repeat(39) + ' b')).toBe('a'.repeat(39));
  });

  it('splits URLs into base url and decoded anchor or UNANCHORED', () => {
    expect(
      splitUrl('https://html.spec.whatwg.org/multipage/webappapis.html#perform-a-microtask-checkpoint')
    ).toEqual({
      url: 'https://html.spec.whatwg.org/multipage/webappapis.html',
      anchor: 'perform-a-microtask-checkpoint',
    });

    expect(splitUrl('https://drafts.csswg.org/css-contain-3/')).toEqual({
      url: 'https://drafts.csswg.org/css-contain-3/',
      anchor: UNANCHORED,
    });

    expect(splitUrl('https://drafts.csswg.org/css-contain-3/#')).toEqual({
      url: 'https://drafts.csswg.org/css-contain-3/',
      anchor: UNANCHORED,
    });

    expect(splitUrl('https://drafts.csswg.org/css-contain-3/#bad%E0%A4%A')).toEqual({
      url: 'https://drafts.csswg.org/css-contain-3/',
      anchor: 'bad%E0%A4%A',
    });

    expect(splitUrl('not a url')).toBeNull();
  });

  it('extracts a bounded statement from long quotes or returns null when no first sentence fits', () => {
    const firstSentence = `${'A'.repeat(119)}.`;
    const quoteWithSentence = `${firstSentence} ${'b'.repeat(180)}`;
    expect(quoteWithSentence.length).toBeGreaterThan(280);
    expect(toStatement(quoteWithSentence)).toBe(firstSentence);

    const noPeriod = 'word '.repeat(60).trim();
    expect(noPeriod.length).toBeGreaterThan(280);
    expect(toStatement(noPeriod)).toBeNull();
  });

  it('migrates a 3-extract fixture dossier with normal, unanchored, and overlong extracts', () => {
    const dossier = makeDossier([
      {
        source_url: 'https://drafts.csswg.org/css-contain-3/#container-queries',
        spec_section: 'CSS Containment Module Level 3',
        quote: 'Size containment on the inline axis breaks the parent-child sizing cycle.',
      },
      {
        source_url: 'https://drafts.csswg.org/css-contain-3/',
        spec_section: 'CSS Containment Module Level 3',
        quote: 'Container queries evaluate against the nearest ancestor query container.',
      },
      {
        source_url: 'https://drafts.csswg.org/css-contain-3/#overflow',
        spec_section: 'Oversized Quote Section',
        quote: 'x'.repeat(700),
      },
    ]);

    const { file, skipped } = migrateDossier(dossier);
    expect(file).not.toBeNull();
    expect(file!.claims).toHaveLength(2);
    expect(file!.claims[0].id).toBe('css-container-queries/spec-css-containment-module-level-3-1');
    expect(file!.claims[1].id).toBe('css-container-queries/spec-css-containment-module-level-3-2');
    expect(file!.claims[0].proof).toMatchObject({
      kind: 'spec-quote',
      url: 'https://drafts.csswg.org/css-contain-3/',
      anchor: 'container-queries',
    });
    expect(file!.claims[1].proof).toMatchObject({
      kind: 'spec-quote',
      url: 'https://drafts.csswg.org/css-contain-3/',
      anchor: UNANCHORED,
    });
    expect(skipped).toEqual([
      {
        pageId: 'css-container-queries',
        index: 2,
        reason: 'quote-length',
        sourceUrl: 'https://drafts.csswg.org/css-contain-3/#overflow',
      },
    ]);
  });

  it('returns file: null when every extract is skipped', () => {
    const dossier = makeDossier([
      {
        source_url: 'https://drafts.csswg.org/css-contain-3/#short',
        spec_section: 'Too Short',
        quote: 'Too short quote.',
      },
    ]);
    const { file, skipped } = migrateDossier(dossier);
    expect(file).toBeNull();
    expect(skipped).toHaveLength(1);
    expect(skipped[0].reason).toBe('quote-length');
  });
});
