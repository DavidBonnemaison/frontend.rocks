import React from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { MDXRemote } from 'next-mdx-remote/rsc';
import remarkGfm from 'remark-gfm';
import { ArticleLayout } from '@/components/article/ArticleLayout';
import { ArticleProofDetails, ArticleSources } from '@/components/article/ArticleAfterBlocks';
import {
  AutopsyCaseFileBlock,
  AutopsyCausalChain,
  AutopsyHeader,
  AutopsyPrevNext,
  AutopsyRail,
} from '@/components/article/AutopsyBlocks';
import {
  createArticleMdxComponents,
  type ArticleMdxContext,
} from '@/components/article/mdx-components';
import { DevToolsDetective } from '@/components/autopsies/DevToolsDetective';
import { InteractiveLabRenderer } from '@/components/labs/InteractiveLabRenderer';
import { buildClaimsBySlug } from '@/components/proof/mdx-components';
import { ProofDegradedBanner } from '@/components/proof/ProofDegradedBanner';
import { Callout, Figure, type TocItem } from '@/components/ui';
import { getAllAutopsies, getAutopsyById } from '@/lib/content-loader';
import { rehypeClaimParagraphs } from '@/lib/mdx/rehype-claim-paragraphs';
import { buildAutopsyPageView } from '@/lib/pages/autopsy';
import { getClaimsByIdMap } from '@/lib/pages/claims-index';
import { buildBrowserProofPayload } from '@/lib/proof/browser-proof-payload';
import { getClaimsForPage } from '@/lib/proof/claims-loader';
import { isPublished, robotsForStatus } from '@/lib/publication';
import { formatAutopsyTitle, SITE_URL } from '@/lib/seo-schema';
import { UI_STRINGS } from '@/lib/ui-strings';

export function generateStaticParams() {
  return getAllAutopsies().map((a) => ({ slug: a.frontmatter.id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const autopsy = getAutopsyById(slug);
  if (!autopsy) return {};
  const { frontmatter: fm } = autopsy;
  const title = formatAutopsyTitle(fm.symptom, fm.case_number);
  const canonicalUrl = `${SITE_URL}/autopsies/${fm.id}/`;
  const ogImageUrl = `${SITE_URL}/og/autopsies/${fm.id}.png`;

  return {
    title,
    description: fm.symptom,
    robots: robotsForStatus(fm.proof_status, fm.id),
    alternates: {
      canonical: canonicalUrl,
      ...(isPublished(fm.proof_status, fm.id)
        ? { types: { 'text/markdown': `${SITE_URL}/autopsies/${fm.id}.md` } }
        : {}),
    },
    openGraph: {
      title,
      description: fm.symptom,
      url: canonicalUrl,
      type: 'article',
      images: [{ url: ogImageUrl, width: 1200, height: 630, alt: fm.title }],
    },
    twitter: { card: 'summary_large_image', title, description: fm.symptom, images: [ogImageUrl] },
  };
}

export default async function AutopsyDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const view = buildAutopsyPageView(slug);
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
    pageKind: 'autopsy' as const,
    reproExperimentId: view.reproExperimentId ?? undefined,
    pieceColor: view.pieceColor,
  };
  const mdxComponents = createArticleMdxComponents(articleCtx, proofCtx, {
    conceptPreviews: view.conceptPreviews,
    chapterHeadings: true,
    extraComponents: {
      CaseFile: () => null,
      CausalChainStepper: () => null,
      FailureSimulator: () => null,
    },
  });
  const mdxOptions = {
    mdxOptions: {
      remarkPlugins: [remarkGfm],
      rehypePlugins: [rehypeClaimParagraphs],
    },
  };

  const toc: TocItem[] = [
    ...view.chapters.map((ch) => ({ id: ch.id, label: ch.title })),
    { id: 'case-file', label: 'Case file' },
    { id: 'causal-chain', label: 'Causal chain' },
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
        piece={{ color: view.pieceColor }}
        header={<AutopsyHeader view={view} />}
        rail={<AutopsyRail view={view} toc={toc} />}
        toc={toc}
        afterContent={
          <>
            <AutopsyCaseFileBlock view={view} />
            <DevToolsDetective
              slug={view.id}
              caseFile={view.caseFileRaw}
              failureMode={view.failureMode}
              hasSimulator={Boolean(view.legacyLab)}
            />
            {view.legacyLab && (
              <div id="failure-simulator" className="is-wide concept-legacy-lab">
                <div id="lab">
                  <Figure size="wide" caption={view.legacyLab.title}>
                    <InteractiveLabRenderer config={view.legacyLab} />
                  </Figure>
                </div>
              </div>
            )}
            <AutopsyCausalChain steps={view.causalSteps} />
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
            <AutopsyPrevNext prev={view.prev} next={view.next} />
          </>
        }
      >
        {showProof && view.proof && view.proof.effectiveStatus === 'degraded' && (
          <ProofDegradedBanner summary={view.proof} />
        )}

        {view.isComposite && (
          <div data-testid="composite-case-note">
            <Callout kind="composite">
              <p>Composite case. The bug is real and painfully common; the people are made up.</p>
            </Callout>
          </div>
        )}

        {view.chapters.map((chapter) => (
          <React.Fragment key={chapter.id}>
            <h2 id={chapter.id} data-chapter="true">
              {chapter.title}
              <a
                className="heading-anchor meta"
                href={`#${chapter.id}`}
                aria-label={`Link to ${chapter.title}`}
              >
                #
              </a>
            </h2>
            {chapter.mdx ? (
              <MDXRemote source={chapter.mdx} components={mdxComponents} options={mdxOptions} />
            ) : null}
          </React.Fragment>
        ))}
      </ArticleLayout>
    </>
  );
}
