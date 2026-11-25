import React from 'react';
import { highlightCode } from '@/lib/shiki';
import { REPOS, languageForPath } from '@/lib/proof/source/repos';
import { resolveClaimRef, type ProofMdxContext } from './mdx-components';
import './source-quote.css';

export async function SourceQuote({
  ctx,
  claimRef,
}: {
  ctx: ProofMdxContext;
  claimRef: string;
}) {
  const claim = resolveClaimRef(ctx, claimRef);
  if (!claim || claim.proof.kind !== 'source-quote') {
    throw new Error(
      `<SourceQuote claim="${claimRef}"> on page "${ctx.pageId}": no source-quote claim with this id.`
    );
  }
  const slug = claim.id.split('/')[1];
  const { repo, commit, path, lines, quote } = claim.proof;
  const info = REPOS[repo];
  const href = `https://github.com/${repo}/blob/${commit}/${path}#L${lines[0]}-L${lines[1]}`;
  const { html } = await highlightCode(quote, languageForPath(path));

  return (
    <figure className="source-quote code-block-shell" data-claim-id={claim.id} id={`quote-${slug}`}>
      <figcaption className="source-quote__caption code-block-header">
        <span className="source-quote__repo">{info.label}</span>
        <a href={href} target="_blank" rel="noopener noreferrer" className="source-quote__path">
          {path}:{lines[0]}–{lines[1]}
        </a>
        <code className="source-quote__commit" title={commit}>
          @{commit.slice(0, 7)}
        </code>
        <span className="source-quote__license">{info.license}</span>
      </figcaption>
      <div
        className="source-quote__code code-block-shiki"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </figure>
  );
}
