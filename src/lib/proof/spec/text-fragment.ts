/** Encodes a text directive term: encodeURIComponent plus '-' (reserved by the fragment syntax). */
export function encodeTextDirectiveTerm(term: string): string {
  return encodeURIComponent(term).replace(/-/g, '%2D');
}

function words(s: string): string[] {
  return s.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
}

function countOccurrences(haystackLower: string, needleLower: string): number {
  if (!needleLower) return 0;
  let n = 0;
  let i = haystackLower.indexOf(needleLower);
  while (i !== -1) {
    n++;
    i = haystackLower.indexOf(needleLower, i + 1);
  }
  return n;
}

export interface TextFragmentResult {
  /** E.g. ":~:text=While%20the%20event,microtask%20queue." or "" when no unique fragment was found. */
  fragment: string;
  unique: boolean;
}

/**
 * Builds a unique Scroll-to-Text-Fragment directive against the full page text.
 * - quoteOriginal: quote in its original typography (originalSlice).
 * - precedingOriginal: original text immediately before the quote in the section (for prefix disambiguation).
 * - pageTextOriginal: text of the entire page (including notes), collapsed whitespace, original typography.
 */
export function buildTextFragment(
  quoteOriginal: string,
  precedingOriginal: string,
  pageTextOriginal: string
): TextFragmentResult {
  const w = words(quoteOriginal);
  if (w.length === 0) return { fragment: '', unique: false };
  const page = pageTextOriginal.toLowerCase();
  const start = w.length <= 10 ? w.join(' ') : w.slice(0, 5).join(' ');
  const end = w.length <= 10 ? null : w.slice(-5).join(' ');
  const directive = (prefix: string | null) =>
    ':~:text=' +
    (prefix ? encodeTextDirectiveTerm(prefix) + '-,' : '') +
    encodeTextDirectiveTerm(start) +
    (end ? ',' + encodeTextDirectiveTerm(end) : '');

  if (countOccurrences(page, start.toLowerCase()) === 1) {
    return { fragment: directive(null), unique: true };
  }
  const prefix = words(precedingOriginal).slice(-3).join(' ');
  if (prefix && countOccurrences(page, `${prefix} ${start}`.toLowerCase()) === 1) {
    return { fragment: directive(prefix), unique: true };
  }
  return { fragment: '', unique: false };
}

/** Final URL: canonicalUrl + '#' + anchor + fragment. Browsers apply the text fragment if supported, else the anchor. */
export function buildSpecQuoteHref(canonicalUrl: string, anchor: string, fragment: string): string {
  return `${canonicalUrl}#${encodeURIComponent(anchor)}${fragment}`;
}
