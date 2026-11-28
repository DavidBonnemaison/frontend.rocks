import React from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { XCircle } from 'lucide-react';
import { ArticleLayout } from '@/components/article/ArticleLayout';
import { ArticleProofDetails } from '@/components/article/ArticleAfterBlocks';
import { CopyCodeButton } from '@/components/concepts/CopyCodeButton';
import { Breadcrumb, Chip } from '@/components/ui';
import { getAllSymptoms, getSymptomById } from '@/lib/symptoms/loader';
import { buildSymptomPageView } from '@/lib/pages/symptom';
import { buildBrowserProofPayload } from '@/lib/proof/browser-proof-payload';
import { ENGINE_LABELS } from '@/lib/proof/engine-labels';
import { isPublished, robotsForStatus } from '@/lib/publication';
import { formatSymptomTitle, SITE_URL } from '@/lib/seo-schema';
import '@/components/article/ArticleBlocks.css';

function renderSignatureText(text: string): React.ReactNode {
  const parts = text.split(/(\{PH\d+\})/g);
  return parts.map((part, i) =>
    /^\{PH\d+\}$/.test(part) ? <var key={i}>{part}</var> : part
  );
}

export function generateStaticParams() {
  return getAllSymptoms().map((s) => ({ slug: s.frontmatter.id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const loaded = getSymptomById(slug);
  if (!loaded) return {};
  const symptom = loaded.frontmatter;

  const title = formatSymptomTitle(symptom.title);
  const canonicalUrl = `${SITE_URL}/symptoms/${symptom.id}/`;
  const ogImageUrl = `${SITE_URL}/og/symptoms/${symptom.id}.png`;

  return {
    title,
    description: symptom.summary,
    robots: robotsForStatus(symptom.proof_status, symptom.id),
    alternates: { canonical: canonicalUrl },
    openGraph: {
      title,
      description: symptom.summary,
      url: canonicalUrl,
      type: 'article',
      images: [{ url: ogImageUrl, width: 1200, height: 630, alt: symptom.title }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description: symptom.summary,
      images: [ogImageUrl],
    },
  };
}

export default async function SymptomDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const view = buildSymptomPageView(slug);
  if (!view) notFound();

  const showProof = view.proof !== null && view.proof.effectiveStatus !== 'unverified';

  return (
    <>
      {isPublished(view.proofStatus, view.slug) && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(view.jsonLd) }}
        />
      )}
      <ArticleLayout
        header={
          <header className="concept-header is-header" data-block="header">
            <Breadcrumb
              items={[
                { label: 'Debug', href: '/symptoms/' },
                { label: 'Symptoms' },
              ]}
            />
            <h1 className="symptom-title">{view.title}</h1>
            <p className="symptom-summary">{view.summary}</p>
          </header>
        }
        afterContent={
          <>
            {view.related.length > 0 && (
              <section
                className="symptom-related"
                data-block="related"
                aria-labelledby="related-symptoms-heading"
              >
                <h2 id="related-symptoms-heading" className="symptom-section-kicker caps">
                  RELATED SYMPTOMS
                </h2>
                <ul className="symptom-related-list ruled-list">
                  {view.related.map((item) => (
                    <li key={item.slug} className="symptom-related-item">
                      <a href={`/symptoms/${item.slug}/`}>{item.title}</a>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {showProof && view.proof ? (
              <ArticleProofDetails
                summary={view.proof}
                browserProof={buildBrowserProofPayload(view.slug)}
              />
            ) : null}
          </>
        }
      >
        <section
          className="symptom-console is-wide"
          data-block="console"
          aria-label="Console signature"
        >
          <div className="symptom-console-head">
            <span className="symptom-console-label caps">CONSOLE</span>
            <CopyCodeButton rawCode={view.signature} />
          </div>
          <div className="symptom-console-body">
            <XCircle
              size={20}
              strokeWidth={1.5}
              className="symptom-console-icon"
              aria-hidden="true"
            />
            <code className="symptom-console-code" data-testid="symptom-signature">
              {renderSignatureText(view.signature)}
            </code>
          </div>
        </section>

        {view.signatureEngines !== null && view.signatureEngines.length > 0 && (
          <div className="symptom-engines" data-testid="symptom-engines">
            <span className="symptom-engines-label caps">CAPTURED IN</span>
            {view.signatureEngines.map((engine) => (
              <Chip key={engine} tone="neutral">
                {ENGINE_LABELS[engine]}
              </Chip>
            ))}
          </div>
        )}

        <section
          className="symptom-causes-section"
          data-block="causes"
          aria-labelledby="likely-causes-heading"
        >
          <h2 id="likely-causes-heading" className="symptom-section-kicker caps">
            LIKELY CAUSES, MOST COMMON FIRST
          </h2>
          <ol className="symptom-causes-list ruled-list">
            {view.causes.map((cause) => (
              <li key={cause.rank} className="symptom-cause-item">
                <span className="symptom-cause-rank caps">CAUSE {cause.rank}</span>
                <h3 className="symptom-cause-title">
                  {cause.conceptId ? (
                    <a href={`/concepts/${cause.conceptId}/`}>{cause.title}</a>
                  ) : (
                    cause.title
                  )}
                </h3>
                <div className="symptom-cause-check">
                  <span className="symptom-cause-check-label caps">CHECK IN DEVTOOLS</span>
                  <p className="symptom-cause-check-text meta">{cause.check}</p>
                </div>
                <div className="symptom-cause-links meta">
                  {cause.conceptId && (
                    <a href={`/concepts/${cause.conceptId}/`}>Read concept dissection</a>
                  )}
                  {cause.autopsyId && (
                    <a href={`/autopsies/${cause.autopsyId}/`}>
                      Autopsy {cause.autopsyNumber ?? ''}: {cause.autopsyTitle ?? cause.autopsyId}
                    </a>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </section>
      </ArticleLayout>
    </>
  );
}
