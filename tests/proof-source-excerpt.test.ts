import { describe, expect, it } from 'vitest';
import { SOURCE_REPOS } from '@/lib/proof/claim-schema';
import {
  MAX_EXCERPT_CHARS,
  MAX_EXCERPT_LINES,
  checkExcerptSize,
  dedentLines,
  excerptAt,
  findExcerpt,
  normalizeExcerpt,
} from '@/lib/proof/source/excerpt';
import { REPOS, checkPathAllowed, isSourceRepo, languageForPath } from '@/lib/proof/source/repos';

describe('repos', () => {
  it('covers all 7 SOURCE_REPOS with react/react', () => {
    expect(Object.keys(REPOS).sort()).toEqual([...SOURCE_REPOS].sort());
    expect(SOURCE_REPOS).toHaveLength(7);
    expect(SOURCE_REPOS).toContain('react/react');
    expect(isSourceRepo('react/react')).toBe(true);
    expect(isSourceRepo('facebook/react')).toBe(false);
    expect(isSourceRepo('mozilla/gecko-dev')).toBe(false);
  });

  it('allows Chromium Blink paths under third_party/blink/ and denies other third_party paths', () => {
    expect(
      checkPathAllowed('chromium/chromium', 'third_party/blink/renderer/core/paint/paint_layer.cc')
    ).toEqual({ ok: true });

    const skia = checkPathAllowed('chromium/chromium', 'third_party/skia/src/core/SkCanvas.cpp');
    expect(skia.ok).toBe(false);
    if (!skia.ok) expect(skia.reason).toBe('path-not-allowed');
  });

  it('enforces allowed and denied prefixes across repositories', () => {
    const webkitThirdParty = checkPathAllowed('WebKit/WebKit', 'Source/ThirdParty/libwebrtc/x.cc');
    expect(webkitThirdParty.ok).toBe(false);
    if (!webkitThirdParty.ok) expect(webkitThirdParty.reason).toBe('path-not-allowed');

    const v8Test = checkPathAllowed('v8/v8', 'test/mjsunit/x.js');
    expect(v8Test.ok).toBe(false);
    if (!v8Test.ok) expect(v8Test.reason).toBe('path-not-allowed');

    expect(checkPathAllowed('react/react', 'CHANGELOG.md')).toEqual({ ok: true });
    expect(checkPathAllowed('jsdom/jsdom', 'lib/jsdom/browser/Window.js')).toEqual({ ok: true });
    expect(checkPathAllowed('jsdom/jsdom', 'CHANGELOG.md').ok).toBe(false);
  });

  it('rejects absolute paths, parent traversal, and binary/generated extensions', () => {
    for (const repo of SOURCE_REPOS) {
      const traversal = checkPathAllowed(repo, '../etc/passwd');
      expect(traversal.ok).toBe(false);
      if (!traversal.ok) expect(traversal.reason).toBe('path-not-allowed');

      const abs = checkPathAllowed(repo, '/etc/passwd');
      expect(abs.ok).toBe(false);
    }

    const minJs = checkPathAllowed('chromium/chromium', 'third_party/blink/foo.min.js');
    expect(minJs.ok).toBe(false);
    const png = checkPathAllowed('WebKit/WebKit', 'Source/WebCore/icon.png');
    expect(png.ok).toBe(false);
  });

  it('maps file extensions to Shiki language identifiers', () => {
    expect(languageForPath('a/b/c.cc')).toBe('cpp');
    expect(languageForPath('Source/WebCore/dom/EventTarget.cpp')).toBe('cpp');
    expect(languageForPath('servo/style/lib.rs')).toBe('rust');
    expect(languageForPath('CHANGELOG.md')).toBe('markdown');
    expect(languageForPath('Source/WebCore/dom/EventTarget.idl')).toBe('text');
    expect(languageForPath('Source/WebCore/dom/Makefile')).toBe('text');
  });
});

describe('excerpt', () => {
  it('dedents common leading spaces and tabs while preserving blank interior lines', () => {
    expect(dedentLines(['    if (ok) {  ', '        return true;\t', '', '    }'])).toEqual([
      'if (ok) {',
      '    return true;',
      '',
      '}',
    ]);
    expect(dedentLines(['\tif (ok)', '\t\treturn true;'])).toEqual(['if (ok)', '\treturn true;']);
  });

  it('normalizes excerpts by stripping leading/trailing blank lines and CRLF', () => {
    const raw = '\r\n\r\n    if (a) {  \r\n\r\n      return b;\r\n    }\r\n  \r\n';
    expect(normalizeExcerpt(raw)).toBe('if (a) {\n\n  return b;\n}');
    expect(() => normalizeExcerpt('   \n\t\n  ')).toThrow('Empty excerpt');
  });

  it('extracts 1-indexed inclusive ranges and returns null out of bounds', () => {
    const file = ['line 1', '    line 2', '        line 3', 'line 4'].join('\n');
    expect(excerptAt(file, 2, 3)).toBe('line 2\n    line 3');
    expect(excerptAt(file, 0, 2)).toBeNull();
    expect(excerptAt(file, 3, 2)).toBeNull();
    expect(excerptAt(file, 2, 5)).toBeNull();
  });

  it('finds unique, re-indented, ambiguous, and absent excerpts accurately', () => {
    const file = [
      'void demo() {',
      '    if (ready) {',
      '        return false;',
      '    }',
      '    if (done) {',
      '        return false;',
      '    }',
      '}',
    ].join('\n');

    // Re-indented by 4 extra spaces relative to the file
    const reindented = '        if (ready) {\n            return false;\n        }';
    expect(findExcerpt(file, reindented)).toEqual([[2, 4]]);

    // Single character difference: return true vs return false
    const oneCharDiff = 'if (ready) {\n    return true;\n}';
    expect(findExcerpt(file, oneCharDiff)).toEqual([]);

    // Ambiguous match (appears twice)
    expect(findExcerpt(file, 'return false;')).toEqual([
      [3, 3],
      [6, 6],
    ]);
  });

  it('enforces maximum line count and character count', () => {
    const exactLines = Array.from({ length: MAX_EXCERPT_LINES }, (_, i) => `l${i}`).join('\n');
    expect(checkExcerptSize(exactLines)).toEqual({ ok: true });

    const tooManyLines = Array.from({ length: MAX_EXCERPT_LINES + 1 }, (_, i) => `l${i}`).join(
      '\n'
    );
    const linesRes = checkExcerptSize(tooManyLines);
    expect(linesRes.ok).toBe(false);
    if (!linesRes.ok) expect(linesRes.reason).toBe('excerpt-too-long');

    const tooManyChars = 'a'.repeat(MAX_EXCERPT_CHARS + 1);
    const charsRes = checkExcerptSize(tooManyChars);
    expect(charsRes.ok).toBe(false);
    if (!charsRes.ok) expect(charsRes.reason).toBe('excerpt-too-long');
  });
});
