import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { CompatData } from '@mdn/browser-compat-data';
import { ProofArtifactSchema } from '@/lib/proof/artifact-schema';
import type { ClaimsFile } from '@/lib/proof/claim-schema';
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
import { renderSupportStatement } from '@/lib/proof/support/statements';
import { verifySupportClaim, type SupportClaim } from '@/lib/proof/support/verify';
import {
  rewriteSupportStatementsOnDisk,
  runSupportCheck,
} from '../scripts/proof/check-support';

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

describe('renderSupportStatement', () => {
  function setupStatementFixtures(): void {
    __setBcdForTests({
      ...makeSyntheticBcd(),
      css: {
        properties: {
          ...makeSyntheticBcd().css.properties,
          demo_all_supported: {
            __compat: {
              source_file: 'css/properties/demo_all_supported.json',
              support: {
                chrome: { version_added: '105' },
                chrome_android: { version_added: '105' },
                edge: { version_added: '105' },
                firefox: { version_added: '110' },
                firefox_android: { version_added: '110' },
                safari: { version_added: '16' },
                safari_ios: { version_added: '16' },
              },
            },
          },
        },
      },
    } as unknown as CompatData);

    __setWebFeaturesForTests({
      ...makeSyntheticWebFeatures(),
      'demo-low': {
        kind: 'feature',
        name: 'Demo Low Feature',
        description: 'Newly available',
        description_html: '<p>Low</p>',
        spec: 'https://example.org/low',
        compat_features: ['css.properties.demo_earliest'],
        status: {
          baseline: 'low',
          baseline_low_date: '2024-05-01',
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
      'demo-missing-1': {
        kind: 'feature',
        name: 'Missing One',
        description: 'Missing 1 browser',
        description_html: '<p>1</p>',
        spec: 'https://example.org/1',
        compat_features: ['css.properties.demo_earliest'],
        status: {
          baseline: false,
          support: {
            chrome: '105',
            chrome_android: '105',
            edge: '105',
            firefox: '110',
            firefox_android: '110',
            safari: '16',
          },
        },
      },
      'demo-missing-2': {
        kind: 'feature',
        name: 'Missing Two',
        description: 'Missing 2 browsers',
        description_html: '<p>2</p>',
        spec: 'https://example.org/2',
        compat_features: ['css.properties.demo_earliest'],
        status: {
          baseline: false,
          support: {
            chrome: '105',
            chrome_android: '105',
            edge: '105',
            firefox: '110',
            firefox_android: '110',
          },
        },
      },
      'demo-missing-3': {
        kind: 'feature',
        name: 'Missing Three',
        description: 'Missing 3 browsers',
        description_html: '<p>3</p>',
        spec: 'https://example.org/3',
        compat_features: ['css.properties.demo_earliest'],
        status: {
          baseline: false,
          support: {
            chrome: '105',
            chrome_android: '105',
            edge: '105',
            firefox: '110',
          },
        },
      },
      'demo-missing-0': {
        kind: 'feature',
        name: 'Not Baseline Yet',
        description: 'All versions present but not Baseline yet',
        description_html: '<p>0</p>',
        spec: 'https://example.org/0',
        compat_features: ['css.properties.demo_earliest'],
        status: {
          baseline: false,
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
    } as unknown as WebFeaturesMap);
  }

  it('renders Baseline high, low, imprecise dates, and all non-Baseline missing-browser counts', () => {
    setupStatementFixtures();

    expect(
      renderSupportStatement({
        bcdKey: 'css.properties.demo_earliest',
        webFeatureId: 'demo-high',
      })
    ).toEqual({
      ok: true,
      statement: 'Demo High Feature is Baseline Widely available (since 2025-08-14).',
    });

    expect(
      renderSupportStatement({
        bcdKey: 'css.properties.demo_earliest',
        webFeatureId: 'demo-low',
      })
    ).toEqual({
      ok: true,
      statement: 'Demo Low Feature is Baseline Newly available (since 2024-05-01).',
    });

    // Imprecise date (≤...) omits "(since ...)"
    expect(
      renderSupportStatement({
        bcdKey: 'css.properties.demo_all_cases',
        webFeatureId: 'demo-imprecise',
      })
    ).toEqual({
      ok: true,
      statement: 'Demo Imprecise Date is Baseline Widely available.',
    });

    expect(
      renderSupportStatement({
        bcdKey: 'css.properties.demo_earliest',
        webFeatureId: 'demo-missing-1',
      })
    ).toEqual({
      ok: true,
      statement: 'Missing One is not Baseline: it is not yet supported in Safari iOS.',
    });

    expect(
      renderSupportStatement({
        bcdKey: 'css.properties.demo_earliest',
        webFeatureId: 'demo-missing-2',
      })
    ).toEqual({
      ok: true,
      statement:
        'Missing Two is not Baseline: it is not yet supported in Safari and Safari iOS.',
    });

    expect(
      renderSupportStatement({
        bcdKey: 'css.properties.demo_earliest',
        webFeatureId: 'demo-missing-3',
      })
    ).toEqual({
      ok: true,
      statement:
        'Missing Three is not Baseline: it is not yet supported in Firefox Android, Safari and Safari iOS.',
    });

    expect(
      renderSupportStatement({
        bcdKey: 'css.properties.demo_earliest',
        webFeatureId: 'demo-missing-0',
      })
    ).toEqual({
      ok: true,
      statement: 'Not Baseline Yet is not Baseline yet.',
    });
  });

  it('renders BCD-only statements with and without missing browsers', () => {
    setupStatementFixtures();

    expect(renderSupportStatement({ bcdKey: 'css.properties.demo_all_supported' })).toEqual({
      ok: true,
      statement:
        '`css.properties.demo_all_supported` is supported in Chrome 105, Chrome Android 105, Edge 105, Firefox 110, Firefox Android 110, Safari 16 and Safari iOS 16.',
    });

    expect(renderSupportStatement({ bcdKey: 'css.properties.demo_earliest' })).toEqual({
      ok: true,
      statement:
        '`css.properties.demo_earliest` is supported in Chrome 105, Edge 105, Firefox 110, Safari 15.4 and Safari iOS 16; not supported in Chrome Android and Firefox Android.',
    });
  });
});

describe('verifySupportClaim', () => {
  const now = new Date('2026-11-25T12:00:00Z');

  function makeSupportClaim(
    statement: string,
    proof: SupportClaim['proof']
  ): SupportClaim {
    return {
      id: 'demo-page/support-main',
      type: 'support',
      statement,
      proof,
    };
  }

  it('reports every failure reason and succeeds on matching canonical statement', () => {
    __setBcdForTests(makeSyntheticBcd());
    __setWebFeaturesForTests(makeSyntheticWebFeatures());

    const unknownBcd = verifySupportClaim(
      makeSupportClaim('Some placeholder statement here.', {
        kind: 'bcd',
        bcdKey: 'css.properties.unknown',
      }),
      now
    );
    expect(unknownBcd.status).toBe('failed');
    expect(unknownBcd.reason).toBe('unknown-bcd-key');

    const unknownWf = verifySupportClaim(
      makeSupportClaim('Some placeholder statement here.', {
        kind: 'bcd',
        bcdKey: 'css.properties.demo_earliest',
        webFeatureId: 'no-such-feature',
      }),
      now
    );
    expect(unknownWf.status).toBe('failed');
    expect(unknownWf.reason).toBe('unknown-web-feature');

    const movedWf = verifySupportClaim(
      makeSupportClaim('Some placeholder statement here.', {
        kind: 'bcd',
        bcdKey: 'css.properties.demo_earliest',
        webFeatureId: 'demo-moved',
      }),
      now
    );
    expect(movedWf.status).toBe('failed');
    expect(movedWf.reason).toBe('web-feature-moved');
    expect(movedWf.message).toContain('demo-high');

    const splitWf = verifySupportClaim(
      makeSupportClaim('Some placeholder statement here.', {
        kind: 'bcd',
        bcdKey: 'css.properties.demo_earliest',
        webFeatureId: 'demo-split',
      }),
      now
    );
    expect(splitWf.status).toBe('failed');
    expect(splitWf.reason).toBe('web-feature-split');

    const notInFeature = verifySupportClaim(
      makeSupportClaim('Some placeholder statement here.', {
        kind: 'bcd',
        bcdKey: 'css.properties.demo_all_cases',
        webFeatureId: 'demo-high',
      }),
      now
    );
    expect(notInFeature.status).toBe('failed');
    expect(notInFeature.reason).toBe('bcd-key-not-in-feature');

    const outdated = verifySupportClaim(
      makeSupportClaim('Container queries work everywhere.', {
        kind: 'bcd',
        bcdKey: 'css.properties.demo_earliest',
        webFeatureId: 'demo-high',
      }),
      now
    );
    expect(outdated.status).toBe('failed');
    expect(outdated.reason).toBe('statement-outdated');
    expect(outdated.details.expected).toBe(
      'Demo High Feature is Baseline Widely available (since 2025-08-14).'
    );

    const proven = verifySupportClaim(
      makeSupportClaim('Demo High Feature is Baseline Widely available (since 2025-08-14).', {
        kind: 'bcd',
        bcdKey: 'css.properties.demo_earliest',
        webFeatureId: 'demo-high',
      }),
      now
    );
    expect(proven.status).toBe('proven');
    expect(proven.reason).toBeNull();
    expect(proven.details.baseline).toBe('high');
  });

  it('flags statement-outdated when a feature transitions from Baseline low to high and --write updates only the statement', () => {
    __setBcdForTests(makeSyntheticBcd());
    const wf = makeSyntheticWebFeatures();
    const lowWf = {
      ...wf,
      'demo-high': {
        ...wf['demo-high'],
        status: {
          ...((wf['demo-high'] as unknown as { status: Record<string, unknown> }).status),
          baseline: 'low',
          baseline_low_date: '2023-02-14',
          baseline_high_date: undefined,
        },
      },
    } as unknown as WebFeaturesMap;

    __setWebFeaturesForTests(lowWf);
    const claim = makeSupportClaim(
      'Demo High Feature is Baseline Newly available (since 2023-02-14).',
      {
        kind: 'bcd',
        bcdKey: 'css.properties.demo_earliest',
        webFeatureId: 'demo-high',
      }
    );
    expect(verifySupportClaim(claim, now).status).toBe('proven');

    // Simulate package update: low -> high
    __setWebFeaturesForTests(wf);
    const afterBump = verifySupportClaim(claim, now);
    expect(afterBump.status).toBe('failed');
    expect(afterBump.reason).toBe('statement-outdated');

    // Test rewriteSupportStatementsOnDisk updates only statement
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'support-write-'));
    try {
      const claimsFile: ClaimsFile = {
        pageId: 'demo-page',
        claims: [claim],
      };
      const filePath = path.join(tmpDir, 'demo-page.claims.json');
      const beforeText = `${JSON.stringify(claimsFile, null, 2)}\n`;
      fs.writeFileSync(filePath, beforeText, 'utf-8');

      const updated = rewriteSupportStatementsOnDisk(new Map([['demo-page', claimsFile]]), {
        claimsDir: tmpDir,
      });
      expect(updated).toEqual([filePath]);

      const afterText = fs.readFileSync(filePath, 'utf-8');
      const beforeLines = beforeText.split('\n');
      const afterLines = afterText.split('\n');
      expect(beforeLines.length).toBe(afterLines.length);
      const changedLines = beforeLines.filter((line, i) => line !== afterLines[i]);
      expect(changedLines).toHaveLength(1);
      expect(afterText).toContain(
        'Demo High Feature is Baseline Widely available (since 2025-08-14).'
      );
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('produces a valid ProofArtifactSchema artifact via runSupportCheck', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'support-artifact-'));
    try {
      const outPath = path.join(tmpDir, 'support.json');
      const { artifact, exitCode } = runSupportCheck({
        page: 'css-container-queries',
        outPath,
      });
      expect(exitCode).toBe(0);
      expect(ProofArtifactSchema.safeParse(artifact).success).toBe(true);
      expect(fs.existsSync(outPath)).toBe(true);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

