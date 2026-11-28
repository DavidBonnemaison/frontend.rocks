import React from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { MDXRemote } from 'next-mdx-remote/rsc';
import remarkGfm from 'remark-gfm';
import { ArticleLayout } from '@/components/article/ArticleLayout';
import { ArticleProofDetails, ArticleSources } from '@/components/article/ArticleAfterBlocks';
import { ConceptConnections } from '@/components/article/ConceptConnections';
import { ConceptHeader, ConceptStatusBanners } from '@/components/article/ConceptHeader';
import { ConceptRail } from '@/components/article/ConceptRail';
import {
  createArticleMdxComponents,
  type ArticleMdxContext,
} from '@/components/article/mdx-components';
import { PathProgressBar } from '@/components/concepts/PathProgressBar';
import { InteractiveLabRenderer } from '@/components/labs/InteractiveLabRenderer';
import { buildClaimsBySlug } from '@/components/proof/mdx-components';
import { ProofDegradedBanner } from '@/components/proof/ProofDegradedBanner';
import { Callout, Figure, type TocItem } from '@/components/ui';
import { getAllConcepts, getConceptById } from '@/lib/content-loader';
import { rehypeClaimParagraphs } from '@/lib/mdx/rehype-claim-paragraphs';
import { buildConceptPageView } from '@/lib/pages/concept';
import { getClaimsByIdMap } from '@/lib/pages/claims-index';
import { buildBrowserProofPayload } from '@/lib/proof/browser-proof-payload';
import { getClaimsForPage } from '@/lib/proof/claims-loader';
import { isPublished, robotsForStatus } from '@/lib/publication';
import { formatConceptTitle, SITE_URL } from '@/lib/seo-schema';
import { UI_STRINGS } from '@/lib/ui-strings';

export function generateStaticParams() {
  return getAllConcepts().map((c) => ({ id: c.frontmatter.id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const concept = getConceptById(id);
  if (!concept) return {};
  const { frontmatter: fm } = concept;
  const title = formatConceptTitle(fm.title);
  const canonicalUrl = `${SITE_URL}/concepts/${fm.id}/`;
  const ogImageUrl = `${SITE_URL}/og/concepts/${fm.id}.png`;

  return {
    title,
    description: fm.summary_tldr,
    robots: robotsForStatus(fm.proof_status, fm.id),
    alternates: {
      canonical: canonicalUrl,
      ...(isPublished(fm.proof_status, fm.id)
        ? { types: { 'text/markdown': `${SITE_URL}/concepts/${fm.id}.md` } }
        : {}),
    },
    openGraph: {
      title,
      description: fm.summary_tldr,
      url: canonicalUrl,
      type: 'article',
      images: [{ url: ogImageUrl, width: 1200, height: 630, alt: fm.title }],
    },
    twitter: { card: 'summary_large_image', title, description: fm.summary_tldr, images: [ogImageUrl] },
  };
}

export default async function ConceptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const view = buildConceptPageView(id);
  if (!view) notFound();

  const showProof = view.proof !== null && view.proof.effectiveStatus !== 'unverified';
  const articleCtx: ArticleMdxContext = {
    pageId: view.id,
    rowsBySlug: new Map((view.proof?.rows ?? []).map((r) => [r.slug, r])),
    counter: { marker: 0, sidenote: 0, sidenotesInSection: 0 },
  };
  const proofCtx = {
    pageId: view.id,
    claimsBySlug: buildClaimsBySlug(getClaimsForPage(view.id)?.claims ?? []),
    claimsById: getClaimsByIdMap(),
    pageKind: 'concept' as const,
  };
  const mdxComponents = createArticleMdxComponents(articleCtx, proofCtx, {
    conceptPreviews: view.conceptPreviews,
  });
  const mdxOptions = {
    mdxOptions: { remarkPlugins: [remarkGfm], rehypePlugins: [rehypeClaimParagraphs] },
  };

  const toc: TocItem[] = [
    ...(view.legacyLab ? [{ id: 'lab', label: UI_STRINGS.toc.lab }] : []),
    ...view.sections.map((s) => ({ id: s.id, label: s.title })),
    { id: 'connections', label: UI_STRINGS.toc.connections },
    ...(showProof ? [{ id: 'proof', label: UI_STRINGS.PROOF.panelTitle }] : []),
    { id: 'sources', label: UI_STRINGS.toc.sources },
  ];

  return (
    <>
      {isPublished(view.proofStatus, view.id) && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(view.jsonLd) }}
        />
      )}
      <ArticleLayout
        header={<ConceptHeader domain={view.domain} title={view.title} tldr={view.tldr} />}
        rail={
          <ConceptRail
            pageId={view.id}
            domain={view.domain}
            readingMinutes={view.readingMinutes}
            webFeatureId={view.webFeatureId}
            proof={view.proof}
            toc={toc}
          />
        }
        toc={toc}
        afterContent={
          <>
            <ConceptConnections
              prerequisites={view.prerequisites}
              followUps={view.followUps}
              relatedAutopsies={view.relatedAutopsies}
              vsPairs={view.vsPairs}
            />
            <PathProgressBar
              conceptId={view.id}
              paths={view.paths}
              conceptTitles={view.pathConceptTitles}
              position="bottom"
            />
            {showProof && view.proof ? (
              <ArticleProofDetails
                summary={view.proof}
                browserProof={buildBrowserProofPayload(view.id)}
              />
            ) : null}
            <ArticleSources
              pageId={view.id}
              sources={view.sources}
              lastVerifiedAt={view.lastVerifiedAt}
            />
          </>
        }
      >
        <PathProgressBar
          conceptId={view.id}
          paths={view.paths}
          conceptTitles={view.pathConceptTitles}
          position="top"
        />

        {showProof && view.proof && view.proof.effectiveStatus === 'degraded' && (
          <ProofDegradedBanner summary={view.proof} />
        )}

        <ConceptStatusBanners
          isObsolete={view.isObsolete}
          supersededTargets={view.supersededTargets}
          replacesTargets={view.replacesTargets}
          supersededPrefix={UI_STRINGS.obsolescence.supersededPrefix}
          legacyPatternText={UI_STRINGS.obsolescence.legacyPattern}
          replacesPrefix={UI_STRINGS.obsolescence.replacesPrefix}
        />

        {view.legacyLab && (
          <div id="lab" className="is-wide concept-legacy-lab" data-block="figure">
            <Figure size="wide" caption={view.legacyLab.title}>
              <InteractiveLabRenderer config={view.legacyLab} />
            </Figure>
          </div>
        )}

        {view.sections.map((section) => (
          <React.Fragment key={section.id}>
            <h2 id={section.id}>
              {section.title}
              <a
                className="heading-anchor meta"
                href={`#${section.id}`}
                aria-label={`Link to ${section.title}`}
              >
                #
              </a>
            </h2>
            <MDXRemote source={section.mdx} components={mdxComponents} options={mdxOptions} />
          </React.Fragment>
        ))}

        {view.whenNotToUse && (
          <Callout kind="warning">
            <MDXRemote source={view.whenNotToUse} components={mdxComponents} options={mdxOptions} />
          </Callout>
        )}
      </ArticleLayout>
    </>
  );
}
