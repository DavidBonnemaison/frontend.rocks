import React from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { ArrowUpRight, FlaskConical, Scale } from 'lucide-react';
import { getAllAutopsies, getAllConcepts, type LoadedConcept } from '@/lib/content-loader';
import {
  buildVsJsonLd,
  formatVsTitle,
  SITE_URL,
  splitProductionPitfalls,
  stripMarkdown,
} from '@/lib/seo-schema';
import {
  formatDomainLabel,
  formatFailureModeLabel,
  formatMaturityLabel,
  UI_STRINGS,
} from '@/lib/ui-strings';
import { extractVsPairs, getVsPairBySlug } from '@/lib/vs-pairs';
import { isPublished, robotsForStatus } from '@/lib/publication';
import { Support } from '@/components/proof/Support';

function getConceptSupportProps(
  concept: LoadedConcept
): { webFeature: string } | { feature: string } | null {
  if (concept.frontmatter.web_feature_id) {
    return { webFeature: concept.frontmatter.web_feature_id };
  }
  const supportClaim = concept.claims?.claims.find(
    (c) => c.type === 'support' && c.proof.kind === 'bcd'
  );
  if (supportClaim && supportClaim.proof.kind === 'bcd') {
    return { feature: supportClaim.proof.bcdKey };
  }
  return null;
}

export function generateStaticParams() {
  return extractVsPairs().map((p) => ({ pair: p.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ pair: string }>;
}): Promise<Metadata> {
  const { pair: slug } = await params;
  const pair = getVsPairBySlug(slug);
  if (!pair) return {};

  const titleA = pair.primary.frontmatter.title;
  const titleB = pair.secondary.frontmatter.title;
  const title = formatVsTitle(titleA, titleB);
  const description = pair.note;
  const canonicalUrl = `${SITE_URL}/vs/${pair.slug}/`;
  const ogImageUrl = `${SITE_URL}/og/vs/${pair.slug}.png`;

  return {
    title,
    description,
    robots: robotsForStatus(pair.proof_status, pair.slug),
    alternates: {
      canonical: canonicalUrl,
      ...(isPublished(pair.proof_status, pair.slug) ? { types: { 'text/markdown': `${SITE_URL}/vs/${pair.slug}.md` } } : {}),
    },
    openGraph: {
      title,
      description,
      url: canonicalUrl,
      type: 'article',
      images: [
        {
          url: ogImageUrl,
          width: 1200,
          height: 630,
          alt: `${titleA} vs ${titleB}`,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [ogImageUrl],
    },
  };
}

export default async function VsComparisonPage({
  params,
}: {
  params: Promise<{ pair: string }>;
}) {
  const { pair: slug } = await params;
  const concepts = getAllConcepts();
  const autopsies = getAllAutopsies();
  const pair = getVsPairBySlug(slug, concepts, autopsies);
  if (!pair) notFound();

  const conceptMap = new Map(concepts.map((c) => [c.frontmatter.id, c.frontmatter]));
  const { primary, secondary, relationType, note, relatedAutopsies, dateModified, sources } = pair;
  const pFm = primary.frontmatter;
  const sFm = secondary.frontmatter;

  const pPitfalls = splitProductionPitfalls(primary.sections.production_pitfalls);
  const sPitfalls = splitProductionPitfalls(secondary.sections.production_pitfalls);

  const pReqs = pFm.relations.filter((r) => r.type === 'requires');
  const sReqs = sFm.relations.filter((r) => r.type === 'requires');

  const pWhenNot = stripMarkdown(pPitfalls.whenNotToUse || pPitfalls.mainPitfalls);
  const sWhenNot = stripMarkdown(sPitfalls.whenNotToUse || sPitfalls.mainPitfalls);

  const jsonLd = buildVsJsonLd({
    slug: pair.slug,
    titleA: pFm.title,
    titleB: sFm.title,
    summary: note,
    sources,
    dateModified,
    faq: [
      {
        question: `What is the mechanical difference between ${pFm.title} and ${sFm.title}?`,
        answer: note,
      },
      {
        question: `When should you avoid ${pFm.title}?`,
        answer: pWhenNot,
      },
      {
        question: `When should you avoid ${sFm.title}?`,
        answer: sWhenNot,
      },
    ],
  });

  return (
    <article className="concept-article" style={{ maxWidth: '900px', margin: '0 auto', padding: '32px 0' }}>
      {isPublished(pair.proof_status, pair.slug) && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      )}

      <div className="concept-meta">
        <span className="badge">
          {relationType === 'replaces' ? 'Native Replacement' : 'Mechanical Comparison'}
        </span>
        {pFm.maturity_status && (
          <span className={`badge badge-${pFm.maturity_status}`}>
            {pFm.title}: {formatMaturityLabel(pFm.maturity_status)}
          </span>
        )}
        {sFm.maturity_status && (
          <span className={`badge badge-${sFm.maturity_status}`}>
            {sFm.title}: {formatMaturityLabel(sFm.maturity_status)}
          </span>
        )}
      </div>

      <h1 className="concept-title">
        {pFm.title} <span style={{ color: 'var(--accent)' }}>vs</span> {sFm.title}
      </h1>

      {/* Above-the-fold Verdict */}
      <section
        className="callout callout-mental-model"
        aria-label="Mechanical Verdict"
        style={{ marginTop: '20px' }}
      >
        <div className="callout-header">
          <Scale size={16} aria-hidden="true" />
          <span>Mechanical Verdict</span>
        </div>
        <p style={{ margin: 0, fontSize: '1.05rem', lineHeight: 1.65 }}>{note}</p>
      </section>

      {/* Direct Lab & Dissection CTAs */}
      <section
        className="section-block"
        style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginTop: '20px' }}
        aria-label="Interactive Labs"
      >
        {primary.lab && (
          <Link href={`/concepts/${pFm.id}#lab`} className="rel-chip">
            <FlaskConical size={14} style={{ marginRight: '6px', display: 'inline' }} aria-hidden="true" />
            Try {pFm.title} Lab
          </Link>
        )}
        {secondary.lab && (
          <Link href={`/concepts/${sFm.id}#lab`} className="rel-chip">
            <FlaskConical size={14} style={{ marginRight: '6px', display: 'inline' }} aria-hidden="true" />
            Try {sFm.title} Lab
          </Link>
        )}
        <Link href={`/concepts/${pFm.id}`} className="rel-chip">
          Read {pFm.title} Dissection
        </Link>
        <Link href={`/concepts/${sFm.id}`} className="rel-chip">
          Read {sFm.title} Dissection
        </Link>
      </section>

      {/* Structured Comparison Matrix */}
      <section className="section-block" style={{ marginTop: '28px' }}>
        <h2>Structured Comparison Matrix</h2>
        <div style={{ overflowX: 'auto', marginTop: '12px' }}>
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              border: '1px solid var(--border)',
              background: 'var(--surface)',
              borderRadius: '8px',
            }}
          >
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface-2)' }}>
                <th style={{ textAlign: 'left', padding: '12px 14px', width: '18%' }}>Dimension</th>
                <th style={{ textAlign: 'left', padding: '12px 14px', width: '41%' }}>{pFm.title}</th>
                <th style={{ textAlign: 'left', padding: '12px 14px', width: '41%' }}>{sFm.title}</th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '12px 14px', fontWeight: 600, verticalAlign: 'top' }}>
                  Mental Model
                </td>
                <td style={{ padding: '12px 14px', verticalAlign: 'top' }}>{pFm.summary_tldr}</td>
                <td style={{ padding: '12px 14px', verticalAlign: 'top' }}>{sFm.summary_tldr}</td>
              </tr>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '12px 14px', fontWeight: 600, verticalAlign: 'top' }}>
                  Maturity &amp; Domain
                </td>
                <td style={{ padding: '12px 14px', verticalAlign: 'top' }}>
                  {pFm.maturity_status && (
                    <>
                      <span className={`badge badge-${pFm.maturity_status}`}>
                        {formatMaturityLabel(pFm.maturity_status)}
                      </span>{' '}
                    </>
                  )}
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                    {pFm.maturity_status ? '· ' : ''}
                    {formatDomainLabel(pFm.domain)}
                  </span>
                  {(() => {
                    const supportProps = getConceptSupportProps(primary);
                    return supportProps ? (
                      <div style={{ marginTop: '6px' }}>
                        <Support {...supportProps} variant="badge" pageId={`vs-${pair.slug}`} />
                      </div>
                    ) : null;
                  })()}
                </td>
                <td style={{ padding: '12px 14px', verticalAlign: 'top' }}>
                  {sFm.maturity_status && (
                    <>
                      <span className={`badge badge-${sFm.maturity_status}`}>
                        {formatMaturityLabel(sFm.maturity_status)}
                      </span>{' '}
                    </>
                  )}
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                    {sFm.maturity_status ? '· ' : ''}
                    {formatDomainLabel(sFm.domain)}
                  </span>
                  {(() => {
                    const supportProps = getConceptSupportProps(secondary);
                    return supportProps ? (
                      <div style={{ marginTop: '6px' }}>
                        <Support {...supportProps} variant="badge" pageId={`vs-${pair.slug}`} />
                      </div>
                    ) : null;
                  })()}
                </td>
              </tr>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '12px 14px', fontWeight: 600, verticalAlign: 'top' }}>
                  Prerequisites
                </td>
                <td style={{ padding: '12px 14px', verticalAlign: 'top' }}>
                  {pReqs.length > 0 ? (
                    <ul style={{ margin: 0, paddingLeft: '18px' }}>
                      {pReqs.map((r) => (
                        <li key={r.target_id}>
                          <Link href={`/concepts/${r.target_id}`}>
                            {conceptMap.get(r.target_id)?.title ?? r.target_id}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <span style={{ color: 'var(--text-muted)' }}>Foundational primitive</span>
                  )}
                </td>
                <td style={{ padding: '12px 14px', verticalAlign: 'top' }}>
                  {sReqs.length > 0 ? (
                    <ul style={{ margin: 0, paddingLeft: '18px' }}>
                      {sReqs.map((r) => (
                        <li key={r.target_id}>
                          <Link href={`/concepts/${r.target_id}`}>
                            {conceptMap.get(r.target_id)?.title ?? r.target_id}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <span style={{ color: 'var(--text-muted)' }}>Foundational primitive</span>
                  )}
                </td>
              </tr>
              <tr>
                <td style={{ padding: '12px 14px', fontWeight: 600, verticalAlign: 'top' }}>
                  When Not to Use
                </td>
                <td style={{ padding: '12px 14px', verticalAlign: 'top', fontSize: '0.93rem' }}>
                  {pWhenNot}
                </td>
                <td style={{ padding: '12px 14px', verticalAlign: 'top', fontSize: '0.93rem' }}>
                  {sWhenNot}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* Engine Internals & Production Pitfalls */}
      <section className="section-block" style={{ marginTop: '28px' }}>
        <h2>Engine Mechanics &amp; Trade-Offs</h2>
        <div className="connections-grid" style={{ marginTop: '12px' }}>
          <div className="connection-card">
            <div className="connection-card-top">
              <span className="connection-type-tag">{pFm.title}</span>
              {pFm.maturity_status && (
                <span className={`badge badge-${pFm.maturity_status}`}>
                  {formatMaturityLabel(pFm.maturity_status)}
                </span>
              )}
            </div>
            <p className="connection-card-note" style={{ marginTop: '8px' }}>
              {primary.evidence?.engine_internals.mechanism_summary ??
                stripMarkdown(primary.sections.under_the_hood).slice(0, 420)}
            </p>
            <p className="connection-card-note" style={{ marginTop: '8px', color: 'var(--text-muted)' }}>
              <strong>Key Pitfalls:</strong> {stripMarkdown(pPitfalls.mainPitfalls).slice(0, 320)}
            </p>
          </div>

          <div className="connection-card">
            <div className="connection-card-top">
              <span className="connection-type-tag">{sFm.title}</span>
              {sFm.maturity_status && (
                <span className={`badge badge-${sFm.maturity_status}`}>
                  {formatMaturityLabel(sFm.maturity_status)}
                </span>
              )}
            </div>
            <p className="connection-card-note" style={{ marginTop: '8px' }}>
              {secondary.evidence?.engine_internals.mechanism_summary ??
                stripMarkdown(secondary.sections.under_the_hood).slice(0, 420)}
            </p>
            <p className="connection-card-note" style={{ marginTop: '8px', color: 'var(--text-muted)' }}>
              <strong>Key Pitfalls:</strong> {stripMarkdown(sPitfalls.mainPitfalls).slice(0, 320)}
            </p>
          </div>
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

      {/* Primary Sources */}
      <footer id="sources" className="sources-footer" style={{ marginTop: '32px' }}>
        <strong>{UI_STRINGS.sections.primarySources}</strong> (verified {dateModified}):
        <ul>
          {sources.map((url) => (
            <li key={url}>
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1"
              >
                <span>{url}</span>
                <ArrowUpRight size={14} className="shrink-0" aria-hidden="true" />
              </a>
            </li>
          ))}
        </ul>
      </footer>
    </article>
  );
}
