import React from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { Activity, ArrowLeft, FlaskConical, Terminal } from 'lucide-react';
import { getSymptomBySlug, PRODUCTION_SYMPTOMS } from '@/config/symptoms';
import { getAllAutopsies, getAllConcepts } from '@/lib/content-loader';
import {
  buildSymptomJsonLd,
  formatSymptomTitle,
  SITE_URL,
} from '@/lib/seo-schema';
import {
  formatDomainLabel,
  formatFailureModeLabel,
  formatMaturityLabel,
  UI_STRINGS,
} from '@/lib/ui-strings';
import { isPublished, robotsForStatus } from '@/lib/publication';

export function generateStaticParams() {
  return PRODUCTION_SYMPTOMS.map((s) => ({ slug: s.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const symptom = getSymptomBySlug(slug);
  if (!symptom) return {};

  const title = formatSymptomTitle(symptom.search_title);
  const description = symptom.summary;
  const canonicalUrl = `${SITE_URL}/symptoms/${symptom.slug}/`;

  return {
    title,
    description,
    robots: robotsForStatus(symptom.proof_status, symptom.slug),
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      title,
      description,
      url: canonicalUrl,
      type: 'article',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
  };
}

export default async function SymptomDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const symptom = getSymptomBySlug(slug);
  if (!symptom) notFound();

  const allConcepts = getAllConcepts();
  const allAutopsies = getAllAutopsies();

  const conceptMap = new Map(allConcepts.map((c) => [c.frontmatter.id, c]));
  const autopsyMap = new Map(allAutopsies.map((a) => [a.frontmatter.id, a]));

  const causalConcepts = symptom.concept_ids
    .map((id) => conceptMap.get(id))
    .filter((c): c is NonNullable<typeof c> => Boolean(c));

  const relatedAutopsies = symptom.autopsy_ids
    .map((id) => autopsyMap.get(id))
    .filter((a): a is NonNullable<typeof a> => Boolean(a));

  const sources = Array.from(
    new Set([
      ...causalConcepts.flatMap((c) => c.frontmatter.sources),
      ...relatedAutopsies.flatMap((a) => a.frontmatter.sources),
    ])
  );

  const jsonLd = buildSymptomJsonLd({
    slug: symptom.slug,
    title: symptom.search_title,
    summary: symptom.summary,
    devtoolsSignature: symptom.devtools_signature,
    sources,
  });

  return (
    <article className="concept-article" style={{ maxWidth: '900px', margin: '0 auto', padding: '32px 0' }}>
      {isPublished(symptom.proof_status, symptom.slug) && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      )}

      <div style={{ marginBottom: '16px' }}>
        <Link href="/symptoms" className="nav-link" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
          <ArrowLeft size={14} aria-hidden="true" />
          <span>All Production Symptoms</span>
        </Link>
      </div>

      <div className="concept-meta">
        <span className="badge">
          <Activity size={12} style={{ marginRight: '6px' }} aria-hidden="true" />
          Production Symptom
        </span>
        <span className="badge">{causalConcepts.length} Causal Mechanisms</span>
      </div>

      <h1 className="concept-title">{symptom.search_title}</h1>
      <p style={{ fontSize: '1.08rem', lineHeight: 1.65, color: 'var(--text)' }}>
        {symptom.summary}
      </p>

      {/* DevTools / RUM Signature */}
      <section
        className="callout callout-pitfall"
        aria-label="DevTools and RUM Signature"
        style={{ marginTop: '20px' }}
      >
        <div className="callout-header">
          <Terminal size={16} aria-hidden="true" />
          <span>DevTools / RUM Signature</span>
        </div>
        <code
          style={{
            display: 'block',
            fontSize: '0.92rem',
            lineHeight: 1.5,
            whiteSpace: 'normal',
            wordBreak: 'break-word',
          }}
        >
          {symptom.devtools_signature}
        </code>
      </section>

      {/* Causal Chain of Concepts */}
      <section className="section-block" style={{ marginTop: '28px' }}>
        <h2>Causal Chain of Browser Mechanisms</h2>
        <p style={{ color: 'var(--text-muted)', marginBottom: '16px' }}>
          Ordered from trigger to root invariant. Open any mechanism to inspect its internals or
          reproduce the behavior in an interactive lab.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {causalConcepts.map((concept, idx) => {
            const { frontmatter, lab } = concept;
            return (
              <div key={frontmatter.id} className="connection-card" style={{ padding: '18px' }}>
                <div className="connection-card-top">
                  <span className="connection-type-tag">Step {idx + 1}</span>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <span className="badge">{formatDomainLabel(frontmatter.domain)}</span>
                    <span className={`badge badge-${frontmatter.maturity_status}`}>
                      {formatMaturityLabel(frontmatter.maturity_status)}
                    </span>
                  </div>
                </div>
                <div className="connection-card-title" style={{ marginTop: '8px', fontSize: '1.15rem' }}>
                  <Link href={`/concepts/${frontmatter.id}`}>{frontmatter.title}</Link>
                </div>
                <p className="connection-card-note" style={{ marginTop: '6px' }}>
                  {frontmatter.summary_tldr}
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginTop: '12px' }}>
                  <Link href={`/concepts/${frontmatter.id}`} className="rel-chip">
                    Read Dissection
                  </Link>
                  {lab && (
                    <Link href={`/concepts/${frontmatter.id}#lab`} className="rel-chip">
                      <FlaskConical
                        size={13}
                        style={{ marginRight: '5px', display: 'inline' }}
                        aria-hidden="true"
                      />
                      Open Interactive Lab
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Related Architecture Autopsies */}
      {relatedAutopsies.length > 0 && (
        <section className="section-block" style={{ marginTop: '28px' }}>
          <h2>{UI_STRINGS.autopsies.seenInAutopsies}</h2>
          <div className="connections-grid" style={{ marginTop: '12px' }}>
            {relatedAutopsies.map((a) => (
              <Link
                key={a.frontmatter.id}
                href={`/autopsies/${a.frontmatter.id}`}
                className="connection-card"
              >
                <div className="connection-card-top">
                  <span className="connection-type-tag">
                    {UI_STRINGS.autopsies.casePrefix}
                    {String(a.frontmatter.case_number).padStart(2, '0')}
                  </span>
                  <span className="badge">
                    {formatFailureModeLabel(a.frontmatter.failure_mode)}
                  </span>
                </div>
                <div className="connection-card-title">{a.frontmatter.title}</div>
                <p className="connection-card-note">{a.frontmatter.symptom}</p>
              </Link>
            ))}
          </div>
        </section>
      )}
    </article>
  );
}
