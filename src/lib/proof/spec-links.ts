import { getSpecQuoteHref } from './spec/record';

/**
 * Builds a specification URL with a verified Scroll-to-Text-Fragment directive
 * when a committed record exists, falling back to the anchor alone.
 */
export function buildSpecFragmentUrl(url: string, anchor: string, quote: string): string {
  return getSpecQuoteHref({
    proof: { kind: 'spec-quote', url, anchor, quote },
  });
}
