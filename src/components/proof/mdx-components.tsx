import React from 'react';
import type { Claim } from '@/lib/proof/claim-schema';
import type { SupportEvent } from '@/lib/proof/support/dates';
import { Advice } from './Advice';
import { Claim as ClaimComponent } from './Claim';
import { SourceQuote } from './SourceQuote';
import { SpecQuote } from './SpecQuote';
import { Story } from './Story';
import { Support } from './Support';
import { SupportDate } from './SupportDate';

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
    C: (props: { id: string; children: React.ReactNode }) => (
      <ClaimComponent ctx={ctx} claimRef={props.id}>
        {props.children}
      </ClaimComponent>
    ),
    Advice: (props: { children: React.ReactNode }) => <Advice>{props.children}</Advice>,
    Story: (props: { children: React.ReactNode }) => <Story>{props.children}</Story>,
    SpecQuote: (props: { claim: string }) => <SpecQuote ctx={ctx} claimSlug={props.claim} />,
    SourceQuote: (props: { claim: string }) => <SourceQuote ctx={ctx} claimRef={props.claim} />,
    Support: (props: {
      feature?: string;
      webFeature?: string;
      variant?: 'badge' | 'table' | 'sentence';
    }) => <Support pageId={ctx.pageId} {...props} />,
    SupportDate: (props: {
      feature?: string;
      webFeature?: string;
      event: SupportEvent;
      format?: 'year' | 'date';
    }) => <SupportDate pageId={ctx.pageId} {...props} />,
  };
}
