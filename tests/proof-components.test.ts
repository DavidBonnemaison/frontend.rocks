import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import React from 'react';
import * as jsxRuntime from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';
import { evaluate } from '@mdx-js/mdx';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Claim } from '@/lib/proof/claim-schema';
import { quoteKey, writeSpecRecord } from '@/lib/proof/spec/record';
import {
  buildClaimsBySlug,
  createProofMdxComponents,
  type ProofMdxContext,
} from '@/components/proof/mdx-components';
import { SourceQuote } from '@/components/proof/SourceQuote';
import { buildSupportViewModel } from '@/components/proof/Support';
import { buildSupportDateViewModel } from '@/components/proof/SupportDate';
import {
  __setBcdForTests,
  __setWebFeaturesForTests,
  getDataVersions,
  type WebFeaturesMap,
} from '@/lib/proof/support/data';
import type { CompatData } from '@mdn/browser-compat-data';

describe('proof MDX components', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    vi.unstubAllEnvs();
    while (tempDirs.length > 0) {
      fs.rmSync(tempDirs.pop()!, { recursive: true, force: true });
    }
  });

  async function renderMdx(source: string, ctx: ProofMdxContext): Promise<string> {
    const { default: MdxContent } = await evaluate(source, {
      Fragment: jsxRuntime.Fragment,
      jsx: jsxRuntime.jsx,
      jsxs: jsxRuntime.jsxs,
      development: false,
    });
    const components = createProofMdxComponents(ctx);
    return renderToStaticMarkup(React.createElement(MdxContent, { components }));
  }

  it('renders <SpecQuote claim="x" /> with blockquote, original typography, and canonical fragment link', async () => {
    const contentDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spec-components-'));
    tempDirs.push(contentDir);
    vi.stubEnv('FRONTEND_ROCKS_CONTENT_DIR', contentDir);

    const url = 'https://drafts.csswg.org/css-conditional-5/';
    const anchor = 'container-queries';
    const quote =
      'Size container queries allow styling elements based on the size of a query container.';

    const claim: Claim = {
      id: 'css-container-queries/x',
      type: 'normative',
      statement: 'Size container queries style elements based on query container size.',
      proof: {
        kind: 'spec-quote',
        url,
        anchor,
        quote,
      },
    };

    writeSpecRecord({
      schemaVersion: 2,
      url,
      family: 'csswg',
      maturity: 'editors-draft',
      specTitle: 'CSS Conditional Rules Module Level 5',
      statusText: null,
      sections: {
        [anchor]: {
          blockKind: 'heading-section',
          sectionTitle: 'Container Queries',
          sectionSha256: 'b'.repeat(64),
          quotes: {
            [quoteKey(quote)]: {
              quoteOriginal: quote,
              fragment: ':~:text=Size%20container%20queries%20allow%20styling',
              fragmentUnique: true,
              recordedOn: '2026-12-01',
            },
          },
        },
      },
    });

    const ctx: ProofMdxContext = {
      pageId: 'css-container-queries',
      claimsBySlug: buildClaimsBySlug([claim]),
      claimsById: new Map([[claim.id, claim]]),
    };

    const html = await renderMdx('<SpecQuote claim="x" />', ctx);
    expect(html).toContain('<blockquote');
    expect(html).toContain(
      `href="${url}#${anchor}:~:text=Size%20container%20queries%20allow%20styling"`
    );
    expect(html).toContain('CSS Conditional Rules Module Level 5 § Container Queries');
    expect(html).toContain("Editor&#x27;s Draft");
    expect(html).toContain('Quoted verbatim');
  });

  it('resolves cross-page references in <SpecQuote claim="other-page/slug" />', async () => {
    const contentDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spec-components-cross-'));
    tempDirs.push(contentDir);
    vi.stubEnv('FRONTEND_ROCKS_CONTENT_DIR', contentDir);

    const claim: Claim = {
      id: 'other-page/remote-spec',
      type: 'normative',
      statement: 'Idempotent HTTP methods can be safely retried after communication failures.',
      proof: {
        kind: 'spec-quote',
        url: 'https://www.rfc-editor.org/rfc/rfc9110.html',
        anchor: 'section-9.2.2',
        quote: 'Idempotent methods are distinguished because the request can be repeated automatically.',
      },
    };

    const ctx: ProofMdxContext = {
      pageId: 'current-page',
      claimsBySlug: new Map(),
      claimsById: new Map([[claim.id, claim]]),
    };

    const html = await renderMdx('<SpecQuote claim="other-page/remote-spec" />', ctx);
    expect(html).toContain('<blockquote');
    expect(html).toContain('https://www.rfc-editor.org/rfc/rfc9110.html#section-9.2.2');
    expect(html).toContain('RFC');
  });

  it('throws an error naming both page and slug when <SpecQuote> references an unknown claim', async () => {
    const ctx: ProofMdxContext = {
      pageId: 'css-container-queries',
      claimsBySlug: new Map(),
      claimsById: new Map(),
    };

    await expect(renderMdx('<SpecQuote claim="inconnu" />', ctx)).rejects.toThrow(
      /css-container-queries.*inconnu|inconnu.*css-container-queries/
    );
  });
});

describe('SourceQuote', () => {
  const commit = 'fc91aa8caa75fc01f57bc7525d1a78799d13294a';
  const claim: Claim = {
    id: 'event-target/x',
    type: 'implementation',
    statement: 'WebKit EventTarget checks script execution context validity before adding listeners.',
    proof: {
      kind: 'source-quote',
      repo: 'WebKit/WebKit',
      commit,
      path: 'Source/WebCore/dom/EventTarget.cpp',
      lines: [24, 25],
      quote: 'if (!isScriptExecutionContextValid())\n    return false;',
    },
  };

  it('renders figure.source-quote with GitHub blob link, short SHA, and highlighted code', async () => {
    const ctx: ProofMdxContext = {
      pageId: 'event-target',
      claimsBySlug: buildClaimsBySlug([claim]),
      claimsById: new Map([[claim.id, claim]]),
    };

    const el = await SourceQuote({ ctx, claimRef: 'x' });
    const html = renderToStaticMarkup(el);

    expect(html).toContain('<figure class="source-quote');
    expect(html).toContain('data-claim-id="event-target/x"');
    expect(html).toContain(
      `href="https://github.com/WebKit/WebKit/blob/${commit}/Source/WebCore/dom/EventTarget.cpp#L24-L25"`
    );
    expect(html).toContain(`title="${commit}"`);
    expect(html).toContain(`@${commit.slice(0, 7)}`);
    expect(html).toContain('see file header');
    expect(html).toContain('class="shiki ');
    expect(html).toContain('<span style="color:');
  });

  it('resolves cross-page references via claimsById', async () => {
    const remoteClaim: Claim = {
      ...claim,
      id: 'other-page/x',
    };
    const ctx: ProofMdxContext = {
      pageId: 'current-page',
      claimsBySlug: new Map(),
      claimsById: new Map([[remoteClaim.id, remoteClaim]]),
    };

    const el = await SourceQuote({ ctx, claimRef: 'other-page/x' });
    const html = renderToStaticMarkup(el);

    expect(html).toContain('<figure class="source-quote');
    expect(html).toContain('data-claim-id="other-page/x"');
    expect(html).toContain(`https://github.com/WebKit/WebKit/blob/${commit}/Source/WebCore/dom/EventTarget.cpp#L24-L25`);
  });

  it('throws an error naming the page when the claim id is unknown', async () => {
    const ctx: ProofMdxContext = {
      pageId: 'event-target',
      claimsBySlug: new Map(),
      claimsById: new Map(),
    };

    await expect(SourceQuote({ ctx, claimRef: 'missing' })).rejects.toThrow(/event-target/);
  });
});

describe('Support and SupportDate components', () => {
  afterEach(() => {
    __setBcdForTests(null);
    __setWebFeaturesForTests(null);
  });

  async function renderMdx(source: string, pageId = 'css-container-queries'): Promise<string> {
    const { default: MdxContent } = await evaluate(source, {
      Fragment: jsxRuntime.Fragment,
      jsx: jsxRuntime.jsx,
      jsxs: jsxRuntime.jsxs,
      development: false,
    });
    const components = createProofMdxComponents({
      pageId,
      claimsBySlug: new Map(),
      claimsById: new Map(),
    });
    return renderToStaticMarkup(React.createElement(MdxContent, { components }));
  }

  it('renders <Support feature="css.at-rules.container" variant="table" /> with 7 browser rows and both data versions', async () => {
    const html = await renderMdx('<Support feature="css.at-rules.container" variant="table" />');
    const versions = getDataVersions();

    expect(html).toContain('<table class="support-table">');
    expect(html).toContain(versions.bcd);
    expect(html).toContain(versions.webFeatures);
    const bodyMatch = /<tbody>([\s\S]*?)<\/tbody>/.exec(html);
    expect(bodyMatch).not.toBeNull();
    const rowMatches = bodyMatch![1].match(/<tr>/g) ?? [];
    expect(rowMatches).toHaveLength(7);
  });

  it('renders <SupportDate feature="css.at-rules.container" event="baseline-low" /> with ISO dateTime', async () => {
    const html = await renderMdx(
      '<SupportDate feature="css.at-rules.container" event="baseline-low" />'
    );
    expect(html).toMatch(/<time[^>]*dateTime="\d{4}-\d{2}-\d{2}"[^>]*>\d{4}<\/time>/);
  });

  it('throws an error naming the key and page when <Support> references an unknown BCD key', async () => {
    await expect(renderMdx('<Support feature="css.does.not.exist" />', 'demo-page')).rejects.toThrow(
      /css\.does\.not\.exist/
    );
    await expect(renderMdx('<Support feature="css.does.not.exist" />', 'demo-page')).rejects.toThrow(
      /demo-page/
    );
  });

  it('builds Support and SupportDate view models on synthetic data', () => {
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
        firefox: {
          name: 'Firefox',
          type: 'desktop',
          accepts_flags: true,
          accepts_webextensions: true,
          releases: { '110': { index: 1, release_date: '2023-02-14', status: 'retired' } },
        },
        safari: {
          name: 'Safari',
          type: 'desktop',
          accepts_flags: true,
          accepts_webextensions: true,
          releases: { '16': { index: 1, release_date: '2022-09-12', status: 'retired' } },
        },
      },
      css: {
        properties: {
          solo_bcd: {
            __compat: {
              source_file: 'css/properties/solo_bcd.json',
              support: {
                chrome: { version_added: '105' },
                firefox: { version_added: '110' },
                safari: { version_added: '16' },
              },
            },
          },
        },
      },
    } as unknown as CompatData);

    __setWebFeaturesForTests({
      'synth-low': {
        kind: 'feature',
        name: 'Synthetic Feature',
        description: 'Synth',
        description_html: '<p>Synth</p>',
        spec: 'https://example.org',
        compat_features: [],
        status: {
          baseline: 'low',
          baseline_low_date: '2024-03-05',
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
      'synth-moved': {
        kind: 'moved',
        redirect_target: 'synth-low',
      },
    } as unknown as WebFeaturesMap);

    // BCD key without a web-feature produces desktop summary and no Baseline tier
    const bcdOnly = buildSupportViewModel('css.properties.solo_bcd', undefined, 'p');
    expect(bcdOnly.baselineTier).toBeNull();
    expect(bcdOnly.desktopSummary).toBe('Chrome 105 · Firefox 110 · Safari 16');

    // webFeature produces Baseline badge and sentence
    const wfVm = buildSupportViewModel(undefined, 'synth-low', 'p');
    expect(wfVm.baselineTier).toBe('low');
    expect(wfVm.badgeLabel).toBe('Baseline · Newly available');
    expect(wfVm.sentence).toBe('Synthetic Feature is Baseline Newly available (since 2024-03-05).');

    // SupportDate format="date"
    expect(
      buildSupportDateViewModel({
        webFeature: 'synth-low',
        event: 'baseline-low',
        format: 'date',
        pageId: 'p',
      })
    ).toEqual({ isoDate: '2024-03-05', display: 'Mar 5, 2024' });

    // Moved web-feature throws naming page and key
    expect(() => buildSupportViewModel(undefined, 'synth-moved', 'p')).toThrow(/synth-moved/);
    expect(() => buildSupportViewModel('a', 'b', 'p')).toThrow(/exactly one/);
  });
});

describe('Claim (<C>), Advice, and Story components', () => {
  async function renderMdx(source: string, ctx: ProofMdxContext): Promise<string> {
    const { default: MdxContent } = await evaluate(source, {
      Fragment: jsxRuntime.Fragment,
      jsx: jsxRuntime.jsx,
      jsxs: jsxRuntime.jsxs,
      development: false,
    });
    const components = createProofMdxComponents(ctx);
    return renderToStaticMarkup(React.createElement(MdxContent, { components }));
  }

  const localClaim: Claim = {
    id: 'microtasks/drains',
    type: 'observable',
    statement: 'Every queued microtask runs before the event loop picks the next task.',
    proof: {
      kind: 'experiment',
      experimentId: 'microtask-order',
      expectKeys: ['before-timer'],
    },
  };

  const remoteClaim: Claim = {
    id: 'other-page/slug',
    type: 'normative',
    statement: 'An @container rule applies when the container is wide enough regardless of viewport.',
    proof: {
      kind: 'spec-quote',
      url: 'https://drafts.csswg.org/css-conditional-5/',
      anchor: 'container-queries',
      quote: 'Size container queries allow styling elements based on the size of a query container.',
    },
  };

  const baseCtx: ProofMdxContext = {
    pageId: 'microtasks',
    claimsBySlug: buildClaimsBySlug([localClaim]),
    claimsById: new Map([
      [localClaim.id, localClaim],
      [remoteClaim.id, remoteClaim],
    ]),
  };

  it('renders a valid local <C id> with span.claim, data-claim-id, accessible marker, and #claim-<slug> href', async () => {
    const html = await renderMdx(
      '<C id="drains">Every queued microtask runs before the next task</C>.',
      baseCtx
    );
    expect(html).toContain('<span class="claim" data-claim-id="microtasks/drains" data-claim-type="observable">');
    expect(html).toContain('href="#claim-drains"');
    expect(html).toContain('aria-label="Proof for this statement (observable)"');
  });

  it('renders a cross-page <C id="other-page/slug"> with permalink /claims/other-page/slug/', async () => {
    const html = await renderMdx(
      'The card uses the slot width. <C id="other-page/slug">An @container rule applies.</C>',
      baseCtx
    );
    expect(html).toContain('data-claim-id="other-page/slug"');
    expect(html).toContain('href="/claims/other-page/slug/"');
    expect(html).toContain('aria-label="Proof for this statement (normative)"');
  });

  it('throws an error naming both page and reference for an unknown <C id>', async () => {
    await expect(renderMdx('<C id="inconnu">Unknown fact.</C>', baseCtx)).rejects.toThrow(
      /inconnu.*microtasks|microtasks.*inconnu/
    );
  });

  it('throws "wraps a block" when <C> wraps a paragraph', async () => {
    await expect(
      renderMdx('<C id="drains">\n\nA whole paragraph inside C.\n\n</C>', baseCtx)
    ).rejects.toThrow(/wraps a block/);
  });

  it('renders <Advice> inline as span.advice--inline and flow as aside.advice', async () => {
    const inlineHtml = await renderMdx(
      'Note: <Advice>Put container-type on the slot.</Advice>',
      baseCtx
    );
    expect(inlineHtml).toContain('<span class="advice advice--inline">');

    const flowHtml = await renderMdx(
      '<Advice>\n\nPut container-type on the slot.\n\n</Advice>',
      baseCtx
    );
    expect(flowHtml).toContain('<aside class="advice" role="note">');
    expect(flowHtml).toContain('<span class="advice__label">Advice</span>');
  });

  it('renders <Story> inline as span.story and flow as div.story', async () => {
    const inlineHtml = await renderMdx('Later, <Story>Nadia opened a ticket.</Story>', baseCtx);
    expect(inlineHtml).toContain('<span class="story">');

    const flowHtml = await renderMdx(
      '<Story>\n\nForty minutes later, Nadia dropped a ticket.\n\n</Story>',
      baseCtx
    );
    expect(flowHtml).toContain('<div class="story">');
  });
});



