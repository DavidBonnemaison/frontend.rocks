import React from 'react';
import * as jsxRuntime from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';
import { evaluate } from '@mdx-js/mdx';
import { HtmlValidate } from 'html-validate';
import { describe, expect, it } from 'vitest';
import {
  collectClaimSlugs,
  createArticleMdxComponents,
  type ArticleMdxContext,
} from '@/components/article/mdx-components';
import type { ProofMdxContext } from '@/components/proof/mdx-components';
import { rehypeClaimParagraphs } from '@/lib/mdx/rehype-claim-paragraphs';
import { worstStatus } from '@/lib/pages/claim-groups';
import type { Claim } from '@/lib/proof/claim-schema';
import type { ClaimProofRow } from '@/lib/proof/page-proof.types';

const TEST_CLAIMS: Claim[] = [
  {
    id: 'demo-page/a',
    type: 'observable',
    statement: 'Container queries evaluate against the nearest size containment ancestor.',
    proof: {
      kind: 'experiment',
      experimentId: 'container-query-inline-size',
      expectKeys: ['applies-at-480'],
    },
  },
  {
    id: 'demo-page/b',
    type: 'observable',
    statement: 'Without container-type, @container rules never match the slot element.',
    proof: {
      kind: 'experiment',
      experimentId: 'container-query-inline-size',
      expectKeys: ['applies-at-480'],
    },
  },
  {
    id: 'demo-page/spec-a',
    type: 'normative',
    statement: 'The CSS Containment specification defines inline-size containment.',
    proof: {
      kind: 'spec-quote',
      url: 'https://drafts.csswg.org/css-conditional-5/',
      anchor: 'container-queries',
      quote: 'Container queries allow authors to style elements according to the size of a container.',
    },
  },
];

const TEST_ROWS: ClaimProofRow[] = [
  {
    claimId: 'demo-page/a',
    slug: 'a',
    type: 'observable',
    statement: TEST_CLAIMS[0].statement,
    status: 'proven',
    engines: { chromium: 'pass', firefox: 'pass', webkit: 'pass' },
    proofKind: 'experiment',
    proofHref: '/claims/demo-page/a/',
    externalHref: null,
    checkedAt: '2026-11-25T02:00:00Z',
  },
  {
    claimId: 'demo-page/b',
    slug: 'b',
    type: 'observable',
    statement: TEST_CLAIMS[1].statement,
    status: 'diverges',
    engines: { chromium: 'pass', firefox: 'pass', webkit: 'fail' },
    proofKind: 'experiment',
    proofHref: '/claims/demo-page/b/',
    externalHref: null,
    checkedAt: '2026-11-25T02:00:00Z',
  },
  {
    claimId: 'demo-page/spec-a',
    slug: 'spec-a',
    type: 'normative',
    statement: TEST_CLAIMS[2].statement,
    status: 'proven',
    engines: {},
    proofKind: 'spec-quote',
    proofHref: '/claims/demo-page/spec-a/',
    externalHref: 'https://drafts.csswg.org/css-conditional-5/#container-queries',
    checkedAt: '2026-11-25T02:00:00Z',
  },
];

async function renderFixtureMdx(source: string): Promise<string> {
  const articleCtx: ArticleMdxContext = {
    pageId: 'demo-page',
    rowsBySlug: new Map(TEST_ROWS.map((r) => [r.slug, r])),
    counter: { marker: 0, sidenote: 0, sidenotesInSection: 0 },
  };
  const proofCtx: ProofMdxContext = {
    pageId: 'demo-page',
    claimsBySlug: new Map(TEST_CLAIMS.map((c) => [c.id.split('/')[1], c])),
    claimsById: new Map(TEST_CLAIMS.map((c) => [c.id, c])),
    pageKind: 'concept',
  };
  const components = createArticleMdxComponents(articleCtx, proofCtx);
  const { default: MdxContent } = await evaluate(source, {
    ...jsxRuntime,
    rehypePlugins: [rehypeClaimParagraphs],
  });
  return renderToStaticMarkup(React.createElement(MdxContent, { components }));
}

describe('Article MDX claim grouping and HTML validity', () => {
  it('computes worstStatus according to severity order', () => {
    expect(worstStatus([TEST_ROWS[0]])).toBe('proven');
    expect(worstStatus([TEST_ROWS[0], TEST_ROWS[1]])).toBe('diverges');
    expect(
      worstStatus([
        TEST_ROWS[0],
        { ...TEST_ROWS[1], status: 'failed' },
      ])
    ).toBe('failed');
    expect(worstStatus([])).toBe('pending');
  });

  it('groups claims per paragraph, preserves <p> for C-only paragraphs, and produces valid HTML', async () => {
    const mdx = `
Intro prose with <C id="a">a proven claim</C> and trailing words.

Second mixed paragraph with <C id="a">first claim</C> and <C id="b">second claim</C>.

<C id="a">Paragraph made solely of a single claim.</C>

<C id="a">First sentence in a two-claim paragraph.</C> <C id="b">Second sentence in the same paragraph.</C>

- List item with <C id="a">a claim inside a list</C>.
- Plain list item.
`;

    const html = await renderFixtureMdx(mdx);

    // 4 paragraphs with data-claims:
    // 1. mixed (1), 2. mixed (2), 3. C-only single (1), 4. C-only double (2)
    const pMatches = html.match(/<p data-claims="\d+">/g) ?? [];
    expect(pMatches).toEqual([
      '<p data-claims="1">',
      '<p data-claims="2">',
      '<p data-claims="1">',
      '<p data-claims="2">',
    ]);

    // List item with claim gets data-claims="1"
    expect(html).toContain('<li data-claims="1">');
    // Worst status for the 2-claim paragraph with proven + diverges is diverges
    expect(html).toContain('data-status="diverges"');

    // Valid HTML (popover sibling of <p>, never inside <p>)
    const validator = new HtmlValidate({
      rules: {
        'element-permitted-content': 'error',
        'close-order': 'error',
      },
    });
    const report = await validator.validateString(`<div>${html}</div>`);
    expect(report.valid, JSON.stringify(report.results, null, 2)).toBe(true);
  });

  it('collectClaimSlugs extracts all claim slugs in order', () => {
    const FakeC = Object.assign(
      function FakeC({ children }: { id: string; children?: React.ReactNode }) {
        return React.createElement('span', null, children);
      },
      { __frClaim: true as const }
    );

    const tree = React.createElement(
      React.Fragment,
      null,
      'Before ',
      React.createElement(FakeC, { id: 'a' }, 'one'),
      ' middle ',
      React.createElement('em', null, React.createElement(FakeC, { id: 'b' }, 'two'))
    );

    const slugs: string[] = [];
    collectClaimSlugs(tree, slugs);
    expect(slugs).toEqual(['a', 'b']);
  });

  it('throws "wraps a block" when <C> wraps a paragraph', async () => {
    const badMdx = `
<C id="a">

Paragraph wrapped inside a claim block.

</C>
`;
    await expect(renderFixtureMdx(badMdx)).rejects.toThrow(/wraps a block/);
  });

  it('renders SpecQuote as a phrasing Sidenote with #:~:text= fragment and valid HTML', async () => {
    const fs = await import('node:fs');
    const os = await import('node:os');
    const path = await import('node:path');
    const { vi } = await import('vitest');
    const { writeSpecRecord, quoteKey } = await import('@/lib/proof/spec/record');
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fr-article-spec-'));
    try {
      const recordDir = path.join(tmpDir, '.proof-cache', 'specs');
      const quote =
        'Container queries allow authors to style elements according to the size of a container.';
      writeSpecRecord(
        {
          schemaVersion: 2,
          url: 'https://drafts.csswg.org/css-conditional-5/',
          specTitle: 'CSS Conditional Rules Module Level 5',
          family: 'csswg',
          maturity: 'editors-draft',
          statusText: 'Editor’s Draft',
          sections: {
            'container-queries': {
              sectionTitle: 'Container Queries',
              blockKind: 'heading-section',
              sectionSha256: 'a'.repeat(64),
              quotes: {
                [quoteKey(quote)]: {
                  quoteOriginal: quote,
                  fragment: ':~:text=Container%20queries%20allow,of%20a%20container.',
                  fragmentUnique: true,
                  recordedOn: '2026-11-25',
                },
              },
            },
          },
        },
        recordDir
      );
      vi.stubEnv('FRONTEND_ROCKS_CONTENT_DIR', tmpDir);
      vi.resetModules();

      const { createArticleMdxComponents: freshCreate } = await import(
        '@/components/article/mdx-components'
      );
      const articleCtx: ArticleMdxContext = {
        pageId: 'demo-page',
        rowsBySlug: new Map(TEST_ROWS.map((r) => [r.slug, r])),
        counter: { marker: 0, sidenote: 0, sidenotesInSection: 0 },
      };
      const proofCtx: ProofMdxContext = {
        pageId: 'demo-page',
        claimsBySlug: new Map(TEST_CLAIMS.map((c) => [c.id.split('/')[1], c])),
        claimsById: new Map(TEST_CLAIMS.map((c) => [c.id, c])),
        pageKind: 'concept',
      };
      const components = freshCreate(articleCtx, proofCtx);
      const mdx = `
Container queries evaluate against the nearest container.<SpecQuote claim="spec-a" />
`;
      const { default: MdxContent } = await evaluate(mdx, {
        ...jsxRuntime,
        rehypePlugins: [rehypeClaimParagraphs],
      });
      const html = renderToStaticMarkup(React.createElement(MdxContent, { components }));

      expect(html).toContain('class="sidenote"');
      expect(html).toContain(':~:text=');
      expect(html).toContain('CSS Conditional Rules Module Level 5');
      expect(html).toContain('Quoted verbatim');

      const validator = new HtmlValidate({
        rules: {
          'element-permitted-content': 'error',
          'close-order': 'error',
        },
      });
      const report = await validator.validateString(`<div>${html}</div>`);
      expect(report.valid, JSON.stringify(report.results, null, 2)).toBe(true);
    } finally {
      vi.unstubAllEnvs();
      vi.resetModules();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('caps SpecSidenote at 2 per h2 section and resets on the next h2', async () => {
    const mdx = `
## First section

One.<SpecQuote claim="spec-a" /> Two.<SpecQuote claim="spec-a" /> Three.<SpecQuote claim="spec-a" />

## Second section

Four.<SpecQuote claim="spec-a" />
`;
    const html = await renderFixtureMdx(mdx);
    const sidenoteCount = (html.match(/class="sidenote"/g) ?? []).length;
    expect(sidenoteCount).toBe(3); // 2 in first section + 1 in second section
  });
});
