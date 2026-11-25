import { describe, expect, it } from 'vitest';
import { SOURCE_REPOS } from '@/lib/proof/claim-schema';
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
