import { describe, expect, it } from 'vitest';
import { classifySpecUrl, isRejection, MATURITY_LABELS } from '@/lib/proof/spec/domains';
import { normalizeSpecText, normalizeWithMap, originalSlice } from '@/lib/proof/spec/normalize';

describe('classifySpecUrl', () => {
  it.each([
    [
      'https://html.spec.whatwg.org/multipage/webappapis.html#perform-a-microtask-checkpoint',
      'whatwg',
      'living-standard',
      'https://html.spec.whatwg.org/multipage/webappapis.html',
    ],
    [
      'https://drafts.csswg.org/css-conditional-5/#container-queries',
      'csswg',
      'editors-draft',
      'https://drafts.csswg.org/css-conditional-5/',
    ],
    [
      'https://drafts.fxtf.org/compositing-2/#isolation',
      'fxtf',
      'editors-draft',
      'https://drafts.fxtf.org/compositing-2/',
    ],
    [
      'https://drafts.css-houdini.org/css-properties-values-api/#registering-custom-properties',
      'houdini',
      'editors-draft',
      'https://drafts.css-houdini.org/css-properties-values-api/',
    ],
    [
      'https://www.w3.org/TR/wai-aria-1.2/#intro_ria_accessibility',
      'w3c-tr',
      'w3c-tr',
      'https://www.w3.org/TR/wai-aria-1.2/',
    ],
    [
      'https://w3c.github.io/IntersectionObserver/#intersection-observer-interface',
      'w3c-ed',
      'editors-draft',
      'https://w3c.github.io/IntersectionObserver/',
    ],
    [
      'https://tc39.es/ecma262/multipage/executable-code-and-execution-contexts.html#sec-hostenqueuepromisejob',
      'tc39',
      'ecmascript',
      'https://tc39.es/ecma262/multipage/executable-code-and-execution-contexts.html',
    ],
    [
      'https://tc39.es/proposal-temporal/#sec-temporal-now-object',
      'tc39-proposal',
      'proposal',
      'https://tc39.es/proposal-temporal/',
    ],
    [
      'https://www.rfc-editor.org/rfc/rfc9110.html#section-9.2.2',
      'rfc',
      'rfc',
      'https://www.rfc-editor.org/rfc/rfc9110.html',
    ],
    [
      'https://datatracker.ietf.org/doc/html/draft-ietf-httpbis-rfc6265bis#section-4.1',
      'ietf-draft',
      'internet-draft',
      'https://datatracker.ietf.org/doc/html/draft-ietf-httpbis-rfc6265bis',
    ],
    [
      'https://wicg.github.io/scroll-to-text-fragment/#syntax',
      'wicg',
      'incubation',
      'https://wicg.github.io/scroll-to-text-fragment/',
    ],
  ] as const)('classifies allowed URL %s', (raw, family, maturity, canonicalUrl) => {
    const res = classifySpecUrl(raw);
    expect(isRejection(res)).toBe(false);
    if (!isRejection(res)) {
      expect(res).toEqual({ family, maturity, canonicalUrl });
      expect(MATURITY_LABELS[res.maturity]).toBeTruthy();
    }
  });

  it('strips query parameters as well as fragments', () => {
    const res = classifySpecUrl('https://drafts.csswg.org/css-conditional-5/?foo=bar#container-queries');
    expect(res).toEqual({
      family: 'csswg',
      maturity: 'editors-draft',
      canonicalUrl: 'https://drafts.csswg.org/css-conditional-5/',
    });
  });

  it('rejects MDN with domain-not-allowed', () => {
    const res = classifySpecUrl('https://developer.mozilla.org/en-US/docs/Web/CSS/container');
    expect(isRejection(res)).toBe(true);
    if (isRejection(res)) expect(res.reason).toBe('domain-not-allowed');
  });

  it('rejects single-page HTML spec with single-page-spec', () => {
    const res = classifySpecUrl('https://html.spec.whatwg.org/');
    expect(isRejection(res)).toBe(true);
    if (isRejection(res)) expect(res.reason).toBe('single-page-spec');
  });

  it('rejects single-page ECMA-262 spec with single-page-spec', () => {
    const res = classifySpecUrl('https://tc39.es/ecma262/');
    expect(isRejection(res)).toBe(true);
    if (isRejection(res)) expect(res.reason).toBe('single-page-spec');
  });

  it('rejects plain http:// URLs', () => {
    const res = classifySpecUrl('http://drafts.csswg.org/css-conditional-5/');
    expect(isRejection(res)).toBe(true);
    if (isRejection(res)) expect(res.reason).toBe('domain-not-allowed');
  });

  it('rejects malformed URLs', () => {
    const res = classifySpecUrl('not a url');
    expect(isRejection(res)).toBe(true);
    if (isRejection(res)) expect(res.reason).toBe('domain-not-allowed');
  });
});

describe('normalizeSpecText and originalSlice', () => {
  it('normalizes whitespace, typographic quotes, soft hyphens, dashes, and ellipsis', () => {
    expect(normalizeSpecText('a\u00A0b')).toBe('a b');
    expect(normalizeSpecText('l\u2019event')).toBe("l'event");
    expect(normalizeSpecText('a\u00ADb')).toBe('ab');
    expect(normalizeSpecText('  x \n\t y  ')).toBe('x y');
    expect(normalizeSpecText('\u2026')).toBe('...');
    expect(normalizeSpecText('foo\u2014bar\u2013baz')).toBe('foo-bar-baz');
    expect(normalizeSpecText('\u201Cquoted\u201D')).toBe('"quoted"');
  });

  it('preserves case', () => {
    expect(normalizeSpecText('While The Queue')).toBe('While The Queue');
    expect(normalizeSpecText('While The Queue')).not.toBe('while the queue');
  });

  it('extracts originalSlice preserving typography while collapsing whitespace', () => {
    const n = normalizeWithMap('the event loop\u2019s  queue');
    const needle = "loop's queue";
    const start = n.normalized.indexOf(needle);
    expect(start).toBeGreaterThan(-1);
    expect(originalSlice(n, start, start + needle.length)).toBe('loop\u2019s queue');
  });
});
