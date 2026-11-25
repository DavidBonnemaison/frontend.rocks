import { afterEach, describe, expect, it } from 'vitest';
import type { CompatData } from '@mdn/browser-compat-data';
import {
  __setBcdForTests,
  __setWebFeaturesForTests,
  getBcd,
  getDataVersions,
  type WebFeaturesMap,
} from '@/lib/proof/support/data';
import { CORE_BROWSERS, getBcdNode, getBcdSupport } from '@/lib/proof/support/bcd';
import { getBaseline, webFeaturesForBcdKey } from '@/lib/proof/support/baseline';
import { getSupportEventDate } from '@/lib/proof/support/dates';

function makeSyntheticBcd(): CompatData {
  return {
    __meta: { version: '0.0.0-test', timestamp: '2026-01-01T00:00:00Z' },
    browsers: {
      chrome: {
        name: 'Chrome',
        type: 'desktop',
        accepts_flags: true,
        accepts_webextensions: true,
        releases: {
          '79': { index: 1, release_date: '2019-12-10', status: 'retired' },
          '105': { index: 2, release_date: '2022-08-30', status: 'retired' },
        },
      },
      chrome_android: {
        name: 'Chrome Android',
        type: 'mobile',
        accepts_flags: true,
        accepts_webextensions: false,
        releases: {
          '105': { index: 1, release_date: '2022-08-30', status: 'retired' },
        },
      },
      edge: {
        name: 'Edge',
        type: 'desktop',
        accepts_flags: true,
        accepts_webextensions: true,
        releases: {
          '79': { index: 1, release_date: '2020-01-15', status: 'retired' },
          '105': { index: 2, release_date: '2022-09-01', status: 'retired' },
        },
      },
      firefox: {
        name: 'Firefox',
        type: 'desktop',
        accepts_flags: true,
        accepts_webextensions: true,
        releases: {
          '110': { index: 1, release_date: '2023-02-14', status: 'retired' },
        },
      },
      firefox_android: {
        name: 'Firefox Android',
        type: 'mobile',
        accepts_flags: false,
        accepts_webextensions: true,
        releases: {
          '110': { index: 1, release_date: '2023-02-14', status: 'retired' },
        },
      },
      safari: {
        name: 'Safari',
        type: 'desktop',
        accepts_flags: true,
        accepts_webextensions: true,
        releases: {
          '15.4': { index: 1, release_date: '2022-03-14', status: 'retired' },
          '16': { index: 2, release_date: '2022-09-12', status: 'retired' },
        },
      },
      safari_ios: {
        name: 'Safari iOS',
        type: 'mobile',
        accepts_flags: true,
        accepts_webextensions: true,
        releases: {
          '16': { index: 1, release_date: '2022-09-12', status: 'retired' },
        },
      },
    },
    css: {
      properties: {
        demo_all_cases: {
          __compat: {
            source_file: 'css/properties/demo_all_cases.json',
            mdn_url: 'https://developer.mozilla.org/en-US/docs/Web/CSS/demo',
            spec_url: 'https://drafts.csswg.org/css-demo/#demo',
            status: {
              experimental: false,
              standard_track: true,
              deprecated: false,
            },
            support: {
              // Simple string
              chrome: { version_added: '105' },
              // Array: flagged entry first, unflagged second -> picks unflagged
              chrome_android: [
                {
                  version_added: '100',
                  flags: [{ type: 'runtime_flag', name: 'DemoFlag' }],
                },
                { version_added: '105' },
              ],
              // ≤79 preserves raw string and looks up release 79
              edge: { version_added: '≤79' },
              // Partial implementation
              firefox: { version_added: '110', partial_implementation: true },
              // Flags only -> unsupported + flagsOnly
              firefox_android: {
                version_added: '110',
                flags: [{ type: 'preference', name: 'layout.demo.enabled' }],
              },
              // Prefixed only -> partial + prefixed
              safari: { version_added: '15.4', prefix: '-webkit-' },
              // Preview -> unsupported
              safari_ios: { version_added: 'preview' },
            },
          },
        },
        demo_false_and_null: {
          __compat: {
            source_file: 'css/properties/demo_false_and_null.json',
            spec_url: ['https://example.org/spec-a', 'https://example.org/spec-b'],
            status: {
              experimental: true,
              standard_track: false,
              deprecated: true,
            },
            support: {
              chrome: { version_added: false },
              edge: { version_added: null as unknown as false },
              firefox: { version_added: '110', version_removed: '115' },
              safari: { version_added: '16', alternative_name: 'webkitDemo' },
            },
          },
        },
        demo_earliest: {
          __compat: {
            source_file: 'css/properties/demo_earliest.json',
            support: {
              chrome: { version_added: '105' },
              edge: { version_added: '105' },
              firefox: { version_added: '110' },
              safari: { version_added: '15.4' },
              safari_ios: { version_added: '16' },
            },
          },
        },
      },
    },
  } as unknown as CompatData;
}

function makeSyntheticWebFeatures(): WebFeaturesMap {
  return {
    'demo-high': {
      kind: 'feature',
      name: 'Demo High Feature',
      description: 'Test high baseline feature',
      description_html: '<p>Test</p>',
      spec: 'https://example.org/spec',
      compat_features: ['css.properties.demo_earliest'],
      status: {
        baseline: 'high',
        baseline_low_date: '2023-02-14',
        baseline_high_date: '2025-08-14',
        support: {
          chrome: '105',
          chrome_android: '105',
          edge: '105',
          firefox: '110',
          firefox_android: '110',
          safari: '16',
          safari_ios: '16',
        },
      },
    },
    'demo-imprecise': {
      kind: 'feature',
      name: 'Demo Imprecise Date',
      description: 'Test approximate baseline date',
      description_html: '<p>Test</p>',
      spec: 'https://example.org/spec',
      compat_features: ['css.properties.demo_all_cases'],
      status: {
        baseline: 'high',
        baseline_low_date: '≤2020-01-15',
        baseline_high_date: '≤2022-07-15',
        support: {
          chrome: '79',
          chrome_android: '79',
          edge: '79',
          firefox: '79',
          firefox_android: '79',
          safari: '13',
          safari_ios: '13',
        },
      },
    },
    'demo-moved': {
      kind: 'moved',
      redirect_target: 'demo-high',
    },
    'demo-split': {
      kind: 'split',
      redirect_targets: ['demo-a', 'demo-b'],
    },
  } as unknown as WebFeaturesMap;
}

afterEach(() => {
  __setBcdForTests(null);
  __setWebFeaturesForTests(null);
});

describe('real installed compatibility packages', () => {
  it('returns non-empty versions for @mdn/browser-compat-data and web-features', () => {
    const versions = getDataVersions();
    expect(versions.bcd).toMatch(/^\d+\.\d+\.\d+/);
    expect(versions.webFeatures).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('reads css.at-rules.container from BCD coherently with getBcd()', () => {
    const support = getBcdSupport('css.at-rules.container');
    expect(support.exists).toBe(true);
    expect(typeof support.browsers.safari.since).toBe('string');
    expect((support.browsers.safari.since ?? '').length).toBeGreaterThan(0);
    expect(getBcdNode('css.at-rules.container')).toBe(
      (getBcd().css['at-rules'] as Record<string, unknown>).container
    );
  });

  it('returns exists: false for an unknown BCD key', () => {
    const support = getBcdSupport('css.properties.does-not-exist');
    expect(support.exists).toBe(false);
    for (const browser of CORE_BROWSERS) {
      expect(support.browsers[browser].status).toBe('unknown');
    }
  });

  it('reads container-queries from web-features', () => {
    const lookup = getBaseline('container-queries');
    expect(lookup.ok).toBe(true);
    if (lookup.ok) {
      expect(['high', 'low', false]).toContain(lookup.info.baseline);
      expect(lookup.info.name.length).toBeGreaterThan(0);
    }
  });
});

describe('getBcdSupport rules on synthetic BCD', () => {
  it('handles simple, array, <=79, partial, flags-only, prefixed, and preview statements', () => {
    __setBcdForTests(makeSyntheticBcd());
    const s = getBcdSupport('css.properties.demo_all_cases');

    expect(s.exists).toBe(true);
    expect(s.standardTrack).toBe(true);
    expect(s.deprecated).toBe(false);
    expect(s.experimental).toBe(false);
    expect(s.mdnUrl).toBe('https://developer.mozilla.org/en-US/docs/Web/CSS/demo');
    expect(s.specUrls).toEqual(['https://drafts.csswg.org/css-demo/#demo']);

    // Rule 2: simple string
    expect(s.browsers.chrome).toEqual({
      status: 'supported',
      since: '105',
      releaseDate: '2022-08-30',
      flagsOnly: false,
      prefixed: false,
    });

    // Rule 1 + 2: skips flagged entry in array and selects unflagged
    expect(s.browsers.chrome_android).toEqual({
      status: 'supported',
      since: '105',
      releaseDate: '2022-08-30',
      flagsOnly: false,
      prefixed: false,
    });

    // Rule 6: preserves ≤79 and resolves releaseDate for 79
    expect(s.browsers.edge).toEqual({
      status: 'supported',
      since: '≤79',
      releaseDate: '2020-01-15',
      flagsOnly: false,
      prefixed: false,
    });

    // Rule 2: partial_implementation
    expect(s.browsers.firefox).toEqual({
      status: 'partial',
      since: '110',
      releaseDate: '2023-02-14',
      flagsOnly: false,
      prefixed: false,
    });

    // Rule 3: flags only -> unsupported + flagsOnly
    expect(s.browsers.firefox_android).toEqual({
      status: 'unsupported',
      since: null,
      releaseDate: null,
      flagsOnly: true,
      prefixed: false,
    });

    // Rule 3: prefix only -> partial + prefixed
    expect(s.browsers.safari).toEqual({
      status: 'partial',
      since: '15.4',
      releaseDate: '2022-03-14',
      flagsOnly: false,
      prefixed: true,
    });

    // Rule 5: preview -> unsupported
    expect(s.browsers.safari_ios).toEqual({
      status: 'unsupported',
      since: null,
      releaseDate: null,
      flagsOnly: false,
      prefixed: false,
    });
  });

  it('handles false, null, missing, version_removed, alternative_name, and spec_url arrays', () => {
    __setBcdForTests(makeSyntheticBcd());
    const s = getBcdSupport('css.properties.demo_false_and_null');

    expect(s.exists).toBe(true);
    expect(s.deprecated).toBe(true);
    expect(s.experimental).toBe(true);
    expect(s.standardTrack).toBe(false);
    expect(s.mdnUrl).toBeNull();
    expect(s.specUrls).toEqual(['https://example.org/spec-a', 'https://example.org/spec-b']);

    expect(s.browsers.chrome.status).toBe('unsupported');
    expect(s.browsers.edge.status).toBe('unknown');
    expect(s.browsers.chrome_android.status).toBe('unknown');
    expect(s.browsers.firefox.status).toBe('unsupported');
    expect(s.browsers.safari).toEqual({
      status: 'partial',
      since: '16',
      releaseDate: '2022-09-12',
      flagsOnly: false,
      prefixed: true,
    });
  });
});

describe('getBaseline and webFeaturesForBcdKey on synthetic web-features', () => {
  it('resolves feature, moved, split, and unknown entries', () => {
    __setWebFeaturesForTests(makeSyntheticWebFeatures());

    const ok = getBaseline('demo-high');
    expect(ok).toEqual({
      ok: true,
      info: {
        webFeatureId: 'demo-high',
        name: 'Demo High Feature',
        baseline: 'high',
        lowDate: '2023-02-14',
        highDate: '2025-08-14',
        support: {
          chrome: '105',
          chrome_android: '105',
          edge: '105',
          firefox: '110',
          firefox_android: '110',
          safari: '16',
          safari_ios: '16',
        },
      },
    });

    const moved = getBaseline('demo-moved');
    expect(moved.ok).toBe(false);
    if (!moved.ok) {
      expect(moved.reason).toBe('moved');
      expect(moved.redirectTo).toEqual(['demo-high']);
    }

    const split = getBaseline('demo-split');
    expect(split.ok).toBe(false);
    if (!split.ok) {
      expect(split.reason).toBe('split');
      expect(split.redirectTo).toEqual(['demo-a', 'demo-b']);
    }

    const unknown = getBaseline('nope');
    expect(unknown.ok).toBe(false);
    if (!unknown.ok) {
      expect(unknown.reason).toBe('unknown-web-feature');
    }

    expect(webFeaturesForBcdKey('css.properties.demo_earliest')).toEqual(['demo-high']);
    expect(webFeaturesForBcdKey('css.properties.none')).toEqual([]);
  });
});

describe('getSupportEventDate on synthetic data', () => {
  it('computes first-release, baseline-low, baseline-high, browser:<id>, and rejects imprecise dates', () => {
    __setBcdForTests(makeSyntheticBcd());
    __setWebFeaturesForTests(makeSyntheticWebFeatures());

    // Earliest among supported browsers (safari 15.4 = 2022-03-14)
    expect(
      getSupportEventDate({ bcdKey: 'css.properties.demo_earliest' }, 'first-release')
    ).toBe('2022-03-14');

    // Baseline dates via webFeatureId or inferred from bcdKey
    expect(getSupportEventDate({ webFeatureId: 'demo-high' }, 'baseline-low')).toBe('2023-02-14');
    expect(getSupportEventDate({ bcdKey: 'css.properties.demo_earliest' }, 'baseline-high')).toBe(
      '2025-08-14'
    );

    // Imprecise "≤" dates return null
    expect(getSupportEventDate({ webFeatureId: 'demo-imprecise' }, 'baseline-low')).toBeNull();
    expect(getSupportEventDate({ webFeatureId: 'demo-imprecise' }, 'baseline-high')).toBeNull();

    // Per-browser release date
    expect(
      getSupportEventDate({ bcdKey: 'css.properties.demo_earliest' }, 'browser:firefox')
    ).toBe('2023-02-14');
    expect(
      getSupportEventDate({ bcdKey: 'css.properties.demo_earliest' }, 'browser:safari')
    ).toBe('2022-03-14');
  });
});
