import React from 'react';
import { MATURITY_LABELS, classifySpecUrl, isRejection } from '@/lib/proof/spec/domains';
import { readSpecRecord, getSpecQuoteHref, quoteKey } from '@/lib/proof/spec/record';
import { resolveClaimRef, type ProofMdxContext } from './mdx-components';
import './spec-quote.css';

export function SpecQuote({ ctx, claimSlug }: { ctx: ProofMdxContext; claimSlug: string }) {
  const claim = resolveClaimRef(ctx, claimSlug);
  if (!claim || claim.proof.kind !== 'spec-quote') {
    throw new Error(
      `<SpecQuote claim="${claimSlug}"> on page "${ctx.pageId}": no spec-quote claim with this slug.`
    );
  }
  const { proof } = claim;
  const source = classifySpecUrl(proof.url);
  const cache = isRejection(source) ? null : readSpecRecord(source.canonicalUrl);
  const section = cache?.sections[proof.anchor] ?? null;
  const recorded = section?.quotes[quoteKey(proof.quote)] ?? null;
  const href = getSpecQuoteHref({ proof });
  const maturity = isRejection(source) ? null : source.maturity;
  const anchorId = claimSlug.replace(/\//g, '-');

  return (
    <figure className="spec-quote" data-claim-id={claim.id} id={`quote-${anchorId}`}>
      <blockquote cite={href} lang="en">
        <p>{recorded?.quoteOriginal ?? proof.quote}</p>
      </blockquote>
      <figcaption>
        <a href={href} target="_blank" rel="noopener noreferrer">
          {cache?.specTitle ?? proof.url}
          {section?.sectionTitle ? ` § ${section.sectionTitle}` : ` #${proof.anchor}`}
        </a>
        {maturity && (
          <span className={`spec-quote__maturity spec-quote__maturity--${maturity}`}>
            {MATURITY_LABELS[maturity]}
          </span>
        )}
        <span className="spec-quote__verbatim">Quoted verbatim</span>
      </figcaption>
    </figure>
  );
}
