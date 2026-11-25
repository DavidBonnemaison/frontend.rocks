export type SpecFamily =
  | 'whatwg'
  | 'csswg'
  | 'fxtf'
  | 'houdini'
  | 'w3c-tr'
  | 'w3c-ed'
  | 'tc39'
  | 'tc39-proposal'
  | 'rfc'
  | 'ietf-draft'
  | 'wicg';

/** Displayed by <SpecQuote>. "incubation" and draft levels are visually distinguished. */
export type SpecMaturity =
  | 'living-standard'
  | 'editors-draft'
  | 'w3c-tr'
  | 'ecmascript'
  | 'proposal'
  | 'rfc'
  | 'internet-draft'
  | 'incubation';

export interface SpecSource {
  family: SpecFamily;
  maturity: SpecMaturity;
  /** Canonical URL without fragment or query, with normalized path. */
  canonicalUrl: string;
}

export type SpecUrlRejection = {
  rejected: true;
  reason: 'domain-not-allowed' | 'single-page-spec';
  message: string;
};

interface Rule {
  family: SpecFamily;
  maturity: SpecMaturity;
  match: (u: URL) => boolean;
}

const RULES: Rule[] = [
  { family: 'whatwg', maturity: 'living-standard', match: (u) => u.hostname.endsWith('.spec.whatwg.org') },
  { family: 'csswg', maturity: 'editors-draft', match: (u) => u.hostname === 'drafts.csswg.org' },
  { family: 'fxtf', maturity: 'editors-draft', match: (u) => u.hostname === 'drafts.fxtf.org' },
  { family: 'houdini', maturity: 'editors-draft', match: (u) => u.hostname === 'drafts.css-houdini.org' },
  { family: 'w3c-tr', maturity: 'w3c-tr', match: (u) => u.hostname === 'www.w3.org' && u.pathname.startsWith('/TR/') },
  { family: 'w3c-ed', maturity: 'editors-draft', match: (u) => u.hostname === 'w3c.github.io' },
  { family: 'tc39', maturity: 'ecmascript', match: (u) => u.hostname === 'tc39.es' && u.pathname.startsWith('/ecma262/multipage/') },
  { family: 'tc39-proposal', maturity: 'proposal', match: (u) => u.hostname === 'tc39.es' && /^\/proposal-[a-z0-9-]+\/?$/.test(u.pathname) },
  { family: 'rfc', maturity: 'rfc', match: (u) => u.hostname === 'www.rfc-editor.org' && /^\/rfc\/rfc\d+\.html$/.test(u.pathname) },
  { family: 'ietf-draft', maturity: 'internet-draft', match: (u) => u.hostname === 'datatracker.ietf.org' && /^\/doc\/html\/draft-[a-z0-9-]+$/.test(u.pathname) },
  { family: 'wicg', maturity: 'incubation', match: (u) => u.hostname === 'wicg.github.io' },
];

export function classifySpecUrl(raw: string): SpecSource | SpecUrlRejection {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return { rejected: true, reason: 'domain-not-allowed', message: `Invalid URL: ${raw}` };
  }
  if (u.protocol !== 'https:') {
    return { rejected: true, reason: 'domain-not-allowed', message: 'Only https:// spec URLs are allowed.' };
  }
  // Single-page versions are too large and duplicate the multipage ones.
  if (u.hostname === 'html.spec.whatwg.org' && !u.pathname.startsWith('/multipage/')) {
    return {
      rejected: true,
      reason: 'single-page-spec',
      message: 'Use https://html.spec.whatwg.org/multipage/<page>.html instead of the single-page HTML spec.',
    };
  }
  if (u.hostname === 'tc39.es' && (u.pathname === '/ecma262/' || u.pathname === '/ecma262')) {
    return {
      rejected: true,
      reason: 'single-page-spec',
      message: 'Use https://tc39.es/ecma262/multipage/<page>.html (the single page is 7.8 MB).',
    };
  }
  const rule = RULES.find((r) => r.match(u));
  if (!rule) {
    return {
      rejected: true,
      reason: 'domain-not-allowed',
      message: `${u.hostname}${u.pathname} is not an allowed normative source.`,
    };
  }
  u.hash = '';
  u.search = '';
  return { family: rule.family, maturity: rule.maturity, canonicalUrl: u.toString() };
}

export function isRejection(x: SpecSource | SpecUrlRejection): x is SpecUrlRejection {
  return (x as SpecUrlRejection).rejected === true;
}

/** Short maturity label displayed next to a normative quote. */
export const MATURITY_LABELS: Record<SpecMaturity, string> = {
  'living-standard': 'Living Standard',
  'editors-draft': "Editor's Draft",
  'w3c-tr': 'W3C Technical Report',
  ecmascript: 'ECMAScript',
  proposal: 'TC39 proposal',
  rfc: 'RFC',
  'internet-draft': 'Internet-Draft',
  incubation: 'Incubation (WICG)',
};
