import React from 'react';
import { Sidenote } from '@/components/ui';
import { classifySpecUrl, isRejection } from '@/lib/proof/spec/domains';
import { getSpecQuoteHref, quoteKey, readSpecRecord } from '@/lib/proof/spec/record';
import { resolveClaimRef, type ProofMdxContext } from '@/components/proof/mdx-components';

export interface SpecSidenoteCounter {
  sidenote: number;
  sidenotesInSection: number;
}

export function allocateSidenoteIndex(counter: SpecSidenoteCounter): number | null {
  counter.sidenotesInSection += 1;
  if (counter.sidenotesInSection > 2) {
    return null;
  }
  counter.sidenote += 1;
  return counter.sidenote;
}

export function SpecSidenote({
  proofCtx,
  claimSlug,
  sidenoteIndex,
}: {
  proofCtx: ProofMdxContext;
  claimSlug: string;
  sidenoteIndex: number | null;
}) {
  const claim = resolveClaimRef(proofCtx, claimSlug);
  if (!claim || claim.proof.kind !== 'spec-quote') {
    throw new Error(
      `<SpecQuote claim="${claimSlug}"> on page "${proofCtx.pageId}": no spec-quote claim with this slug.`
    );
  }

  if (sidenoteIndex === null) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(
        `[SpecSidenote] Skipping sidenote "${claimSlug}" on "${proofCtx.pageId}": at most 2 sidenotes per h2 section.`
      );
    }
    return null;
  }

  const { proof } = claim;
  const source = classifySpecUrl(proof.url);
  const cache = isRejection(source) ? null : readSpecRecord(source.canonicalUrl);
  const section = cache?.sections[proof.anchor] ?? null;
  const recorded = section?.quotes[quoteKey(proof.quote)] ?? null;
  const href = getSpecQuoteHref({ proof });
  const anchorId = claimSlug.replace(/\//g, '-');
  const specTitle = cache?.specTitle ?? proof.url;
  const sectionTitle = section?.sectionTitle ?? `#${proof.anchor}`;
  const quoteText = recorded?.quoteOriginal ?? proof.quote;

  return (
    <span id={`quote-${anchorId}`} data-claim-id={claim.id}>
      <Sidenote id={`quote-${anchorId}-${sidenoteIndex}`} label="§">
        <span className="spec-note__quote">“{quoteText}”</span>
        <span className="spec-note__source meta">
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            data-event="spec_link_click"
            data-analytics-event="spec_link_click"
            data-analytics-target={proofCtx.pageId}
          >
            {specTitle} § {sectionTitle}
          </a>
          <span className="caps"> · Quoted verbatim</span>
        </span>
      </Sidenote>
    </span>
  );
}
