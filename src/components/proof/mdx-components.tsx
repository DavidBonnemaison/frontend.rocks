import React from 'react';
import type { Claim } from '@/lib/proof/claim-schema';
import { SpecQuote } from './SpecQuote';

export interface ProofMdxContext {
  pageId: string;
  /** claim-slug -> Claim, for the current page. */
  claimsBySlug: Map<string, Claim>;
  /** Full claim id -> Claim, across all pages (for cross-page references). */
  claimsById: Map<string, Claim>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MdxComponentMap = Record<string, React.ComponentType<any>>;

export function buildClaimsBySlug(claims: Claim[]): Map<string, Claim> {
  return new Map(claims.map((c) => [c.id.split('/')[1], c]));
}

/** Resolves a claim reference in MDX: "slug" (current page) or "page-id/slug" (another page). */
export function resolveClaimRef(ctx: ProofMdxContext, ref: string): Claim | undefined {
  return ref.includes('/') ? ctx.claimsById.get(ref) : ctx.claimsBySlug.get(ref);
}

export function createProofMdxComponents(ctx: ProofMdxContext): MdxComponentMap {
  return {
    SpecQuote: (props: { claim: string }) => <SpecQuote ctx={ctx} claimSlug={props.claim} />,
  };
}
