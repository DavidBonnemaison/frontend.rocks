/** Removed entirely. */
const REMOVE_RE = /[\u00AD\u200B\u200C\u200D\u2060\uFEFF]/;
/** Turned into a plain space. */
const SPACE_RE = /[\s\u00A0\u2007\u2009\u200A\u202F\u3000]/;
/** One-to-one or one-to-many typographic replacements. */
const REPLACE: Record<string, string> = {
  '\u2018': "'",
  '\u2019': "'",
  '\u201A': "'",
  '\u201B': "'",
  '\u2032': "'",
  '\u201C': '"',
  '\u201D': '"',
  '\u201E': '"',
  '\u201F': '"',
  '\u2033': '"',
  '\u2010': '-',
  '\u2011': '-',
  '\u2012': '-',
  '\u2013': '-',
  '\u2014': '-',
  '\u2015': '-',
  '\u2212': '-',
  '\u2026': '...',
};

export interface NormalizedText {
  /** Normalized text with collapsed whitespace and no leading or trailing space. */
  normalized: string;
  /** map[i] = index in `source` of the character that produced normalized[i]. */
  map: number[];
  /** Source text after Unicode NFC normalization (reference coordinate system for `map`). */
  source: string;
}

export function normalizeWithMap(raw: string): NormalizedText {
  const source = raw.normalize('NFC');
  let normalized = '';
  const map: number[] = [];
  let pendingSpaceAt = -1;
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (REMOVE_RE.test(ch)) continue;
    if (SPACE_RE.test(ch)) {
      if (normalized.length > 0 && pendingSpaceAt === -1) pendingSpaceAt = i;
      continue;
    }
    if (pendingSpaceAt !== -1) {
      normalized += ' ';
      map.push(pendingSpaceAt);
      pendingSpaceAt = -1;
    }
    const rep = REPLACE[ch] ?? ch;
    for (const r of rep) {
      normalized += r;
      map.push(i);
    }
  }
  return { normalized, map, source };
}

export function normalizeSpecText(raw: string): string {
  return normalizeWithMap(raw).normalized;
}

/** Original text (typography preserved, whitespace collapsed) corresponding to normalized[start, end). */
export function originalSlice(n: NormalizedText, start: number, end: number): string {
  if (start >= end) return '';
  return n.source.slice(n.map[start], n.map[end - 1] + 1).replace(/\s+/g, ' ').trim();
}
