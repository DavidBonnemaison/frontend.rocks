import React from 'react';
import { ArrowUpRight } from 'lucide-react';
import { Callout, ClaimMarker, ClaimPopover, CodeBlock } from '@/components/ui';
import {
  ConceptInlineLink,
  type ConceptPreviewData,
} from '@/components/concepts/ConceptInlineLink';
import {
  createProofMdxComponents,
  resolveClaimRef,
  type ProofMdxContext,
} from '@/components/proof/mdx-components';
import { worstStatus } from '@/lib/pages/claim-groups';
import type { ClaimProofRow } from '@/lib/proof/page-proof.types';
import { SpecSidenote } from './SpecSidenote';

export interface ArticleMdxContext {
  pageId: string;
  rowsBySlug: Map<string, ClaimProofRow>;
  counter: {
    marker: number;
    sidenote: number;
    sidenotesInSection: number;
  };
}

export interface ArticleMdxOptions {
  conceptPreviews?: Record<string, ConceptPreviewData>;
  chapterHeadings?: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  extraComponents?: Record<string, React.ComponentType<any>>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MdxComponentMap = Record<string, React.ComponentType<any>>;

const BLOCK_TAG_NAMES = new Set(['p', 'ul', 'ol', 'pre', 'table', 'blockquote', 'div']);

function extractText(node: React.ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(extractText).join('');
  if (React.isValidElement(node)) {
    const props = node.props as { children?: React.ReactNode };
    return extractText(props.children);
  }
  return '';
}

function slugifyHeading(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function collectClaimSlugs(node: React.ReactNode, out: string[]): void {
  React.Children.forEach(node, (child) => {
    if (!React.isValidElement(child)) return;
    if ((child.type as { __frClaim?: true }).__frClaim) {
      out.push((child.props as { id: string }).id);
      return;
    }
    const inner = (child.props as { children?: React.ReactNode }).children;
    if (inner) collectClaimSlugs(inner, out);
  });
}

function resolveRow(
  ctx: ArticleMdxContext,
  proofCtx: ProofMdxContext,
  ref: string
): ClaimProofRow | null {
  const direct = ctx.rowsBySlug.get(ref);
  if (direct) return direct;
  const claim = resolveClaimRef(proofCtx, ref);
  if (!claim) return null;
  const [pageOfClaim, slug] = claim.id.split('/');
  return {
    claimId: claim.id,
    slug,
    type: claim.type,
    statement: claim.statement,
    status: 'pending',
    engines: {},
    proofKind: claim.proof.kind,
    proofHref: `/claims/${pageOfClaim}/${slug}/`,
    externalHref: null,
    checkedAt: null,
  };
}

function extractPreCode(children: React.ReactNode): { code: string; lang?: string } {
  const child = React.Children.toArray(children)[0];
  if (React.isValidElement(child)) {
    const props = child.props as { className?: string; children?: React.ReactNode };
    const langMatch = /language-([\w-]+)/.exec(props.className ?? '');
    const code = extractText(props.children);
    return { code, lang: langMatch?.[1] };
  }
  return { code: extractText(children) };
}

export function createArticleMdxComponents(
  ctx: ArticleMdxContext,
  proofCtx: ProofMdxContext,
  options: ArticleMdxOptions = {}
): MdxComponentMap {
  const base = createProofMdxComponents(proofCtx);
  const conceptPreviews = options.conceptPreviews ?? {};

  function ProseParagraph({
    children,
    ...rest
  }: React.ComponentPropsWithoutRef<'p'>) {
    const slugs: string[] = [];
    collectClaimSlugs(children, slugs);
    if (slugs.length === 0) {
      return <p {...rest}>{children}</p>;
    }
    const uniqueSlugs = Array.from(new Set(slugs));
    const rows = uniqueSlugs
      .map((s) => resolveRow(ctx, proofCtx, s))
      .filter((r): r is ClaimProofRow => r !== null);
    if (rows.length === 0) {
      return <p {...rest}>{children}</p>;
    }
    const n = ++ctx.counter.marker;
    return (
      <>
        <p {...rest} data-claims={rows.length}>
          {children}
          <ClaimMarker
            popoverId={`claims-${n}`}
            anchorName={`--claims-${n}`}
            count={rows.length}
            worst={worstStatus(rows)}
          />
        </p>
        <ClaimPopover id={`claims-${n}`} anchorName={`--claims-${n}`} rows={rows} />
      </>
    );
  }

  function ProseListItem({
    children,
    ...rest
  }: React.ComponentPropsWithoutRef<'li'>) {
    const slugs: string[] = [];
    collectClaimSlugs(children, slugs);
    if (slugs.length === 0) {
      return <li {...rest}>{children}</li>;
    }
    const uniqueSlugs = Array.from(new Set(slugs));
    const rows = uniqueSlugs
      .map((s) => resolveRow(ctx, proofCtx, s))
      .filter((r): r is ClaimProofRow => r !== null);
    if (rows.length === 0) {
      return <li {...rest}>{children}</li>;
    }
    const n = ++ctx.counter.marker;
    return (
      <li {...rest} data-claims={rows.length}>
        {children}
        <ClaimMarker
          popoverId={`claims-${n}`}
          anchorName={`--claims-${n}`}
          count={rows.length}
          worst={worstStatus(rows)}
        />
        <ClaimPopover id={`claims-${n}`} anchorName={`--claims-${n}`} rows={rows} />
      </li>
    );
  }

  function isBlockChildren(children: React.ReactNode): boolean {
    return React.Children.toArray(children).some((child) => {
      if (!React.isValidElement(child)) return false;
      if (typeof child.type === 'string' && BLOCK_TAG_NAMES.has(child.type)) {
        return true;
      }
      if (child.type === ProseParagraph || child.type === ProseListItem) {
        return true;
      }
      return false;
    });
  }

  const C = Object.assign(
    function C(props: { id: string; children: React.ReactNode }) {
      const row = resolveRow(ctx, proofCtx, props.id);
      if (!row) {
        throw new Error(
          `<C id="${props.id}"> on "${ctx.pageId}": no claim "${ctx.pageId}/${props.id}".`
        );
      }
      if (isBlockChildren(props.children)) {
        throw new Error(
          `<C id="${props.id}"> on "${ctx.pageId}" wraps a block. Write it inside a paragraph, around one or two sentences.`
        );
      }
      return (
        <span className="claim" data-claim-id={row.claimId}>
          {props.children}
        </span>
      );
    },
    { __frClaim: true as const }
  );

  return {
    ...base,
    C,
    p: ProseParagraph,
    li: ProseListItem,
    SpecQuote: (props: { claim: string }) => (
      <SpecSidenote proofCtx={proofCtx} claimSlug={props.claim} counter={ctx.counter} />
    ),
    Advice: (props: { children: React.ReactNode }) => (
      <Callout kind="advice">{props.children}</Callout>
    ),
    Story: (props: { children: React.ReactNode }) => (
      <div className="story">{props.children}</div>
    ),
    h2: ({ id, children, ...rest }: React.ComponentPropsWithoutRef<'h2'>) => {
      ctx.counter.sidenotesInSection = 0;
      const text = extractText(children);
      const headingId = id ?? slugifyHeading(text);
      return (
        <h2
          id={headingId || undefined}
          data-chapter={options.chapterHeadings ? 'true' : undefined}
          {...rest}
        >
          {children}
          {headingId ? (
            <a
              className="heading-anchor meta"
              href={`#${headingId}`}
              aria-label={`Link to ${text}`}
            >
              #
            </a>
          ) : null}
        </h2>
      );
    },
    pre: ({ children }: React.ComponentPropsWithoutRef<'pre'>) => {
      const { code, lang } = extractPreCode(children);
      const wide = code.split('\n').some((line) => line.length > 72);
      return <CodeBlock code={code} lang={lang} wide={wide} />;
    },
    table: ({ children, ...rest }: React.ComponentPropsWithoutRef<'table'>) => (
      <div className="article-table-wrap" tabIndex={0} role="region" aria-label="Data table">
        <table className="article-table" {...rest}>
          {children}
        </table>
      </div>
    ),
    a: ({ href, children, ...rest }: React.ComponentPropsWithoutRef<'a'>) => {
      if (href) {
        const match = /^\/concepts\/([a-z0-9-]+)(?:[/?#].*)?$/.exec(href);
        if (match && conceptPreviews[match[1]]) {
          return (
            <ConceptInlineLink href={href} preview={conceptPreviews[match[1]]}>
              {children}
            </ConceptInlineLink>
          );
        }
        if (href.startsWith('/') || href.startsWith('#')) {
          return (
            <a href={href} {...rest}>
              {children}
            </a>
          );
        }
      }
      return (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="u-inline-row"
          {...rest}
        >
          <span>{children}</span>
          <ArrowUpRight size={14} className="u-shrink-0" aria-hidden="true" />
        </a>
      );
    },
    ...(options.extraComponents ?? {}),
  };
}
