import { afterEach, describe, expect, it } from 'vitest';
import type { CompatData } from '@mdn/browser-compat-data';
import type { ClaimCheckResult, ProofArtifact } from '@/lib/proof/artifact-schema';
import type { Claim } from '@/lib/proof/claim-schema';
import {
  __setBcdForTests,
  __setWebFeaturesForTests,
  type WebFeaturesMap,
} from '@/lib/proof/support/data';
import { collectProvenYears } from '@/lib/proof/support/proven-years';
import { lintSupportProse, type SupportLintContext } from '@/lib/validators/support-lint';

function emptyCtx(overrides: Partial<SupportLintContext> = {}): SupportLintContext {
  return {
    pageId: 'demo-page',
    provenYears: new Map(),
    missingArtifacts: [],
    ...overrides,
  };
}

afterEach(() => {
  __setBcdForTests(null);
  __setWebFeaturesForTests(null);
});

describe('lintSupportProse rejected sentences', () => {
  const rejectedCases: Array<[string, string]> = [
    ['Container queries shipped in Chrome 105.', 'browser-version'],
    ['Edge 18 dropped EdgeHTML.', 'browser-version'],
    ['Supported since 16.4 in Safari.', 'version-of-browser'],
    ['It is Baseline Widely available.', 'baseline-label'],
    ['This works in all modern browsers.', 'all-browsers'],
    ["Firefox doesn't support it yet.", 'browser-supports'],
    ['Teams adopted this pattern in 2019.', 'dated-history'],
    ['The 2019 redesign removed it.', 'dated-history'],
    ['2023+ (@container Baseline)', 'dated-history'],
    ['95% of users have it.', 'usage-share'],
    ['Mobile Safari clips the toolbar.', 'safari-mention'],
    ['<Story>Safari 16 clipped the toolbar.</Story>', 'browser-version'],
    ['<Advice>Avoid the 2019 approach.</Advice>', 'dated-history'],
  ];

  for (const [sentence, expectedRule] of rejectedCases) {
    it(`rejects "${sentence}" with rule "${expectedRule}"`, () => {
      const { violations } = lintSupportProse(sentence, emptyCtx());
      expect(violations.some((v) => v.rule === expectedRule)).toBe(true);
    });
  }

  it('rejects a year inside <C> linked to an observable claim', () => {
    const claims = new Map<string, Claim>([
      [
        'demo-page/obs',
        {
          id: 'demo-page/obs',
          type: 'observable',
          statement: 'Hooks run in deterministic order after render commit.',
          proof: { kind: 'experiment', experimentId: 'demo-exp', expectKeys: ['basic'] },
        },
      ],
    ]);
    const provenYears = collectProvenYears({
      claims,
      specArtifact: null,
      sourceArtifact: null,
      supportResults: new Map(),
    });
    const { violations } = lintSupportProse(
      '<C id="obs">Hooks shipped in 2019.</C>',
      emptyCtx({ provenYears })
    );
    expect(violations.some((v) => v.rule === 'dated-history')).toBe(true);
  });

  it('rejects a year inside <C> linked to a failed source-quote claim', () => {
    const claims = new Map<string, Claim>([
      [
        'demo-page/cl',
        {
          id: 'demo-page/cl',
          type: 'implementation',
          statement: 'React 16.8 introduced Hooks in February 2019.',
          proof: {
            kind: 'source-quote',
            repo: 'react/react',
            commit: 'a'.repeat(40),
            path: 'CHANGELOG.md',
            lines: [1, 2],
            quote: '## 16.8.0 (February 6, 2019)',
          },
        },
      ],
    ]);
    const failedSourceArtifact: ProofArtifact = {
      schemaVersion: 1,
      kind: 'source-quotes',
      generatedAt: '2026-11-25T00:00:00Z',
      mode: 'online',
      tooling: {},
      claims: {
        'demo-page/cl': {
          claimId: 'demo-page/cl',
          status: 'failed',
          reason: 'quote-not-found',
          message: 'Not found',
          details: {},
          checkedAt: '2026-11-25T00:00:00Z',
        },
      },
      pages: {},
    };
    const provenYears = collectProvenYears({
      claims,
      specArtifact: null,
      sourceArtifact: failedSourceArtifact,
      supportResults: new Map(),
    });
    const { violations } = lintSupportProse(
      '<C id="cl">Hooks shipped in 2019.</C>',
      emptyCtx({ provenYears })
    );
    expect(violations.some((v) => v.rule === 'dated-history')).toBe(true);
  });

  it('appends missing-artifacts hint when a year inside <C> fails and artifacts are missing', () => {
    const { violations } = lintSupportProse(
      '<C id="hooks">React Hooks shipped in 2019.</C>',
      emptyCtx({ missingArtifacts: ['spec-quotes.json', 'source-quotes.json'] })
    );
    expect(violations).toHaveLength(1);
    expect(violations[0].rule).toBe('dated-history');
    expect(violations[0].message).toContain('artifacts missing: spec-quotes.json, source-quotes.json');
    expect(violations[0].message).toContain('npm run proof:all');
  });

  it('reports absolute line numbers with a 10-line frontmatter', () => {
    const raw = [
      '---',
      'id: demo-page',
      'title: Demo',
      'domain: css-layout',
      'summary_tldr: "Short summary text."',
      'relations: []',
      'sources:',
      '  - "https://example.org/"',
      'last_verified_at: "2026-11-25"',
      '---',
      '',
      'Clean intro line.',
      '',
      'Teams adopted this pattern in 2019.',
    ].join('\n');

    const { violations } = lintSupportProse(raw, emptyCtx());
    expect(violations).toHaveLength(1);
    expect(violations[0].rule).toBe('dated-history');
    expect(violations[0].line).toBe(14);
  });

  it('returns an mdx-parse-error violation instead of crashing on malformed MDX', () => {
    const { violations } = lintSupportProse('Broken tag <123 here.', emptyCtx());
    expect(violations).toHaveLength(1);
    expect(violations[0].rule).toBe('mdx-parse-error');
  });
});

describe('lintSupportProse accepted sentences', () => {
  const acceptedCases: string[] = [
    '`chrome://flags` lets you test it.',
    '```js\n// Chrome 105+\nconst x = 2023;\n```',
    '<Support feature="css.at-rules.container" />',
    '<Story>A customer on iOS Safari was charged twice.</Story>',
    'The layout pass runs before paint.',
    'The handler ran in 2000 ms.',
    'Version 2019.5 is out.',
    'ECMAScript 2015 added classes.',
    'The buffer grows by 2048 bytes.',
    'RFC 2045 defines MIME types.',
    'The trailing edge of the box moves.',
    'Blinking cursors blink 3 times.',
    'Edge cases that the parser supports are listed below.',
    '<C id="wk">In WebKit, the observer ships with no delay.</C>',
    '[MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/@container#chrome_105)',
  ];

  for (const sentence of acceptedCases) {
    it(`accepts "${sentence.replace(/\n/g, '\\n')}"`, () => {
      const { violations } = lintSupportProse(sentence, emptyCtx());
      expect(violations).toEqual([]);
    });
  }

  it('accepts a year inside <C> when linked to a proven source-quote containing that year', () => {
    const claims = new Map<string, Claim>([
      [
        'demo-page/hooks',
        {
          id: 'demo-page/hooks',
          type: 'implementation',
          statement: 'React 16.8 introduced Hooks in February 2019.',
          proof: {
            kind: 'source-quote',
            repo: 'react/react',
            commit: 'a'.repeat(40),
            path: 'CHANGELOG.md',
            lines: [1, 2],
            quote: '## 16.8.0 (February 6, 2019)',
          },
        },
      ],
    ]);
    const sourceArtifact: ProofArtifact = {
      schemaVersion: 1,
      kind: 'source-quotes',
      generatedAt: '2026-11-25T00:00:00Z',
      mode: 'online',
      tooling: {},
      claims: {
        'demo-page/hooks': {
          claimId: 'demo-page/hooks',
          status: 'proven',
          reason: null,
          message: null,
          details: {},
          checkedAt: '2026-11-25T00:00:00Z',
        },
      },
      pages: {},
    };
    const provenYears = collectProvenYears({
      claims,
      specArtifact: null,
      sourceArtifact,
      supportResults: new Map(),
    });
    const { violations } = lintSupportProse(
      '<C id="hooks">React Hooks shipped in 2019.</C>',
      emptyCtx({ provenYears })
    );
    expect(violations).toEqual([]);
  });

  it('honors support-lint-ignore escape hatch and increments ignored count', () => {
    const raw = [
      '{/* support-lint-ignore dated-history: product name contains a year */}',
      '',
      'Office 2019 renders it this way.',
    ].join('\n');
    const { violations, ignored } = lintSupportProse(raw, emptyCtx());
    expect(violations).toEqual([]);
    expect(ignored).toBe(1);
  });
});

describe('collectProvenYears across all claim types', () => {
  it('extracts years from proven spec-quote, source-quote, bcd, derived (with cycle guard), and ignores observable/measured', () => {
    __setBcdForTests({
      __meta: { version: '0.0.0-test', timestamp: '2026-01-01T00:00:00Z' },
      browsers: {
        chrome: {
          name: 'Chrome',
          type: 'desktop',
          accepts_flags: true,
          accepts_webextensions: true,
          releases: { '105': { index: 1, release_date: '2022-08-30', status: 'retired' } },
        },
      },
      css: {
        properties: {
          demo: {
            __compat: {
              source_file: 'css/properties/demo.json',
              support: { chrome: { version_added: '105' } },
            },
          },
        },
      },
    } as unknown as CompatData);

    __setWebFeaturesForTests({
      demo: {
        kind: 'feature',
        name: 'Demo',
        description: 'Demo',
        description_html: '<p>Demo</p>',
        spec: 'https://example.org',
        compat_features: ['css.properties.demo'],
        status: {
          baseline: 'high',
          baseline_low_date: '2023-02-14',
          baseline_high_date: '2025-08-14',
          support: { chrome: '105' },
        },
      },
    } as unknown as WebFeaturesMap);

    const claims = new Map<string, Claim>([
      [
        'p/spec',
        {
          id: 'p/spec',
          type: 'normative',
          statement: 'Specification published in 2021 defines this invariant.',
          proof: {
            kind: 'spec-quote',
            url: 'https://drafts.csswg.org/css-conditional-5/',
            anchor: 'sec',
            quote: 'Since the 2021 revision, size queries resolve inline containment.',
          },
        },
      ],
      [
        'p/source',
        {
          id: 'p/source',
          type: 'implementation',
          statement: 'Changelog records the 2019 release date.',
          proof: {
            kind: 'source-quote',
            repo: 'react/react',
            commit: 'b'.repeat(40),
            path: 'CHANGELOG.md',
            lines: [1, 1],
            quote: '## 16.8.0 (February 6, 2019)',
          },
        },
      ],
      [
        'p/bcd',
        {
          id: 'p/bcd',
          type: 'support',
          statement: 'Demo is Baseline Widely available (since 2025-08-14).',
          proof: { kind: 'bcd', bcdKey: 'css.properties.demo', webFeatureId: 'demo' },
        },
      ],
      [
        'p/obs',
        {
          id: 'p/obs',
          type: 'observable',
          statement: 'Experiment checks behavior without proving 2020.',
          proof: { kind: 'experiment', experimentId: 'demo-exp', expectKeys: ['basic'] },
        },
      ],
      [
        'p/meas',
        {
          id: 'p/meas',
          type: 'measured',
          statement: 'Measured experiment checks ratio without proving 2018.',
          proof: { kind: 'experiment', experimentId: 'demo-exp', expectKeys: ['basic'] },
        },
      ],
      [
        'p/derived-a',
        {
          id: 'p/derived-a',
          type: 'derived',
          statement: 'Combines spec, source, and bcd years safely.',
          proof: {
            kind: 'derived',
            from: ['p/spec', 'p/bcd', 'p/derived-b'],
            reasoning: 'Union of years from proven spec and BCD claims.',
          },
        },
      ],
      [
        'p/derived-b',
        {
          id: 'p/derived-b',
          type: 'derived',
          statement: 'Cycle guard test derived claim pointing back.',
          proof: {
            kind: 'derived',
            from: ['p/source', 'p/derived-a'],
            reasoning: 'Tests recursion cycle guard across derived claims.',
          },
        },
      ],
    ]);

    const provenCheck = (claimId: string): ClaimCheckResult => ({
      claimId,
      status: 'proven',
      reason: null,
      message: null,
      details: {},
      checkedAt: '2026-11-25T00:00:00Z',
    });

    const specArtifact: ProofArtifact = {
      schemaVersion: 1,
      kind: 'spec-quotes',
      generatedAt: '2026-11-25T00:00:00Z',
      mode: 'online',
      tooling: {},
      claims: { 'p/spec': provenCheck('p/spec') },
      pages: {},
    };
    const sourceArtifact: ProofArtifact = {
      schemaVersion: 1,
      kind: 'source-quotes',
      generatedAt: '2026-11-25T00:00:00Z',
      mode: 'online',
      tooling: {},
      claims: { 'p/source': provenCheck('p/source') },
      pages: {},
    };
    const supportResults = new Map<string, ClaimCheckResult>([
      ['p/bcd', provenCheck('p/bcd')],
    ]);

    const years = collectProvenYears({ claims, specArtifact, sourceArtifact, supportResults });

    expect([...(years.get('p/spec') ?? [])]).toEqual([2021]);
    expect([...(years.get('p/source') ?? [])]).toEqual([2019]);
    expect([...(years.get('p/bcd') ?? [])].sort()).toEqual([2022, 2023, 2025]);
    expect([...(years.get('p/obs') ?? [])]).toEqual([]);
    expect([...(years.get('p/meas') ?? [])]).toEqual([]);
    expect([...(years.get('p/derived-a') ?? [])].sort()).toEqual([2019, 2021, 2022, 2023, 2025]);
  });
});
