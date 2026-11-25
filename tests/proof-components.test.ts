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

