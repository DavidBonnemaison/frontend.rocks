import { describe, expect, it } from 'vitest';
import type { Claim } from '@/lib/proof/claim-schema';
import { buildSourceLineUrl, buildSpecFragmentUrl, externalHrefFor } from '@/lib/proof/spec-links';

describe('spec-links', () => {
  it('builds a pinned GitHub source line URL', () => {
    const commit = '0123456789abcdef0123456789abcdef01234567';
    expect(buildSourceLineUrl('chromium/chromium', commit, 'third_party/blink/foo.cc', [12, 34])).toBe(
      `https://github.com/chromium/chromium/blob/${commit}/third_party/blink/foo.cc#L12-L34`
    );
  });

  it('delegates spec-quote links to buildSpecFragmentUrl / getSpecQuoteHref', () => {
    const claim: Claim = {
      id: 'sample/spec',
      type: 'normative',
      statement: 'Size containment isolates intrinsic sizing of a query container.',
      proof: {
        kind: 'spec-quote',
        url: 'https://drafts.csswg.org/css-contain-3/',
        anchor: 'size-container',
        quote: 'A query container for size queries must establish inline-size containment.',
      },
    };
    expect(externalHrefFor(claim)).toBe(
      buildSpecFragmentUrl(
        'https://drafts.csswg.org/css-contain-3/',
        'size-container',
        'A query container for size queries must establish inline-size containment.'
      )
    );
  });

  it('resolves MDN URL for valid BCD claims and null for experiment or derived claims', () => {
    const bcdClaim: Claim = {
      id: 'sample/bcd',
      type: 'support',
      statement: 'CSS container-type is documented in MDN browser-compat-data.',
      proof: {
        kind: 'bcd',
        bcdKey: 'css.properties.container-type',
      },
    };
    expect(externalHrefFor(bcdClaim)).toContain('developer.mozilla.org');

    const expClaim: Claim = {
      id: 'sample/exp',
      type: 'observable',
      statement: 'Container queries activate when the container reaches the threshold.',
      proof: {
        kind: 'experiment',
        experimentId: 'sample-exp',
        expectKeys: ['case-1'],
      },
    };
    expect(externalHrefFor(expClaim)).toBeNull();
  });
});
