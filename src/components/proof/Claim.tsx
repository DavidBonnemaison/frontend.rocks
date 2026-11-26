/**
 * Inline claim link component (`<C>`).
 *
 * Allowed MDX syntax:
 *   <C id="drains-before-next-task">Every queued microtask runs before the next task</C>, ...
 *   <C id="css-container-queries/applies-at-container-width">An `@container` rule applies ...</C>
 *
 * Rules:
 * - Always inline inside a paragraph, covering at most two consecutive sentences.
 * - `id` is either a local claim slug or a cross-page `<page-id>/<claim-slug>`.
 * - Must not nest inside another `<C>`; allowed inside `<Advice>` and `<Story>`.
 */
import React from 'react';
import { resolveClaimRef, type ProofMdxContext } from './mdx-components';
import './prose.css';

const BLOCK_TAGS = ['p', 'ul', 'ol', 'pre', 'table', 'blockquote', 'div'];

export function hasBlockChild(children: React.ReactNode): boolean {
  return React.Children.toArray(children).some(
    (c) => React.isValidElement(c) && typeof c.type === 'string' && BLOCK_TAGS.includes(c.type)
  );
}

export function Claim({
  ctx,
  claimRef,
  children,
}: {
  ctx: ProofMdxContext;
  claimRef: string;
  children: React.ReactNode;
}) {
  const claim = resolveClaimRef(ctx, claimRef);
  if (!claim) {
    throw new Error(
      `<C id="${claimRef}"> on page "${ctx.pageId}": no such claim. Use a slug of content/claims/${ctx.pageId}.claims.json or a full id "page-id/slug".`
    );
  }
  if (hasBlockChild(children)) {
    throw new Error(
      `<C id="${claimRef}"> on page "${ctx.pageId}" wraps a block. Write it inside a paragraph, around one or two sentences.`
    );
  }
  const [pageOfClaim, slug] = claim.id.split('/');
  const href = pageOfClaim === ctx.pageId ? `#claim-${slug}` : `/claims/${pageOfClaim}/${slug}/`;
  return (
    <span className="claim" data-claim-id={claim.id} data-claim-type={claim.type}>
      {children}
      <a
        className="claim-marker"
        href={href}
        aria-label={`Proof for this statement (${claim.type})`}
      >
        <span aria-hidden="true">•</span>
      </a>
    </span>
  );
}
