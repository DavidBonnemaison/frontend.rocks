import React from 'react';
import { ArrowUpRight } from 'lucide-react';
import { ProofPanel } from '@/components/proof/ProofPanel';
import type { BrowserProofPayload } from '@/lib/proof/browser-proof-payload';
import type { PageProofSummary } from '@/lib/proof/page-proof.types';
import { UI_STRINGS } from '@/lib/ui-strings';
import './ArticleBlocks.css';

export function ArticleProofDetails({
  summary,
  browserProof,
}: {
  summary: PageProofSummary;
  browserProof?: BrowserProofPayload;
}) {
  return (
    <details className="article-proof-details is-wide" data-block="proof">
      <summary className="article-proof-summary">
        <span className="article-proof-summary-title">{UI_STRINGS.PROOF.panelTitle}</span>
        <span className="article-proof-summary-hint caps">
          {summary.total} {summary.total === 1 ? 'claim' : 'claims'} · Expand
        </span>
      </summary>
      <div className="article-proof-body">
        <ProofPanel summary={summary} browserProof={browserProof} />
      </div>
    </details>
  );
}

export function ArticleSources({
  pageId,
  sources,
  lastVerifiedAt,
}: {
  pageId: string;
  sources: string[];
  lastVerifiedAt: string;
}) {
  if (sources.length === 0) return null;
  return (
    <footer id="sources" className="article-sources" data-block="sources">
      <h2 className="article-sources-heading caps">{UI_STRINGS.sections.primarySources}</h2>
      <ul className="article-sources-list meta">
        {sources.map((url) => (
          <li key={url}>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="article-sources-link"
              data-event="spec_link_click"
              data-analytics-event="spec_link_click"
              data-analytics-target={pageId}
            >
              <span>{url}</span>
              <ArrowUpRight size={14} className="u-shrink-0" aria-hidden="true" />
            </a>
          </li>
        ))}
      </ul>
      <p className="article-sources-verified meta">Verified {lastVerifiedAt}</p>
    </footer>
  );
}
