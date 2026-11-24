import React from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { MDXRemote } from 'next-mdx-remote/rsc';
import remarkGfm from 'remark-gfm';
import { AlertTriangle, ArrowUpRight, Ban, Lightbulb } from 'lucide-react';
import {
  getAllConcepts,
  getAutopsiesForConcept,
  getConceptById,
  getLearningPaths,
} from '@/lib/content-loader';
import {
  formatDomainLabel,
  formatFailureModeLabel,
  formatMaturityLabel,
  UI_STRINGS,
} from '@/lib/ui-strings';
import { InteractiveLabRenderer } from '@/components/labs/InteractiveLabRenderer';
import {
  ConceptInlineLink,
  type ConceptPreviewData,
} from '@/components/concepts/ConceptInlineLink';
import { ConceptCodeBlock } from '@/components/concepts/ConceptCodeBlock';
import {
  NeighborhoodMiniGraph,
  type MiniGraphNode,
} from '@/components/concepts/NeighborhoodMiniGraph';
import {
  PathProgressBar,
  type PathProgressMeta,
} from '@/components/concepts/PathProgressBar';
import type { Metadata } from 'next';
import { ConceptToc, type TocItem } from '@/components/concepts/ConceptToc';
import {
  buildConceptJsonLd,
  formatConceptTitle,
  SITE_URL,
  splitProductionPitfalls,
} from '@/lib/seo-schema';
import { getVsPairsForConcept } from '@/lib/vs-pairs';
import { isPublished, robotsForStatus } from '@/lib/publication';

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

  const { frontmatter } = concept;
  const title = formatConceptTitle(frontmatter.title);
  const description = frontmatter.summary_tldr;
  const canonicalUrl = `${SITE_URL}/concepts/${frontmatter.id}/`;
  const ogImageUrl = `${SITE_URL}/og/concepts/${frontmatter.id}.png`;

  return {
    title,
    description,
    robots: robotsForStatus(frontmatter.proof_status, frontmatter.id),
    alternates: {
      canonical: canonicalUrl,
      ...(isPublished(frontmatter.proof_status, frontmatter.id) ? { types: { 'text/markdown': `${SITE_URL}/concepts/${frontmatter.id}.md` } } : {}),
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
          alt: frontmatter.title,
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

function MdxBlock({
  source,
  conceptPreviews,
}: {
  source: string;
  conceptPreviews: Record<string, ConceptPreviewData>;
}) {
  return (
    <div className="mdx-prose">
      <MDXRemote
        source={source}
        components={{
          a: ({ href, children, ...rest }) => {
            if (href) {
              const match = /^\/concepts\/([a-z0-9-]+)(?:[/?#].*)?$/.exec(href);
              if (match && conceptPreviews[match[1]]) {
                return (
                  <ConceptInlineLink href={href} preview={conceptPreviews[match[1]]}>
                    {children}
                  </ConceptInlineLink>
                );
              }
              if (href.startsWith('/')) {
                return (
                  <Link href={href} {...rest}>
                    {children}
                  </Link>
                );
              }
            }
            return (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1"
                {...rest}
              >
                <span>{children}</span>
                <ArrowUpRight size={14} className="shrink-0" aria-hidden="true" />
              </a>
            );
          },
          pre: (props) => <ConceptCodeBlock {...props} />,
        }}
        options={{
          mdxOptions: {
            remarkPlugins: [remarkGfm],
          },
        }}
      />
    </div>
  );
}

interface ConnectionCardItem {
  key: string;
  targetId: string;
  targetTitle: string;
  targetDomain: string;
  targetMaturity?: string;
  groupLabel: string;
  note: string;
}

export default async function ConceptPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const concept = getConceptById(id);
  if (!concept) notFound();

  const allConcepts = getAllConcepts();
  const conceptMap = new Map(allConcepts.map((c) => [c.frontmatter.id, c.frontmatter]));

  const conceptPreviews: Record<string, ConceptPreviewData> = {};
  for (const c of allConcepts) {
    conceptPreviews[c.frontmatter.id] = {
      id: c.frontmatter.id,
      title: c.frontmatter.title,
      domain: c.frontmatter.domain,
      maturity_status: c.frontmatter.maturity_status,
      summary_tldr: c.frontmatter.summary_tldr,
    };
  }

  const { frontmatter, sections, lab } = concept;
  const associatedAutopsies = getAutopsiesForConcept(frontmatter.id);
  const vsPairs = getVsPairsForConcept(frontmatter.id, allConcepts, associatedAutopsies);

  const isObsolete =
    frontmatter.maturity_status === 'legacy-pattern' ||
    frontmatter.maturity_status === 'superseded';

  const requires = frontmatter.relations.filter((r) => r.type === 'requires');
  const underHood = frontmatter.relations.filter((r) => r.type === 'under_the_hood');
  const replaces = frontmatter.relations.filter((r) => r.type === 'replaces');
  const contrasts = frontmatter.relations.filter((r) => r.type === 'contrasts_with');

  // Incoming relations from other concepts pointing to this concept
  const incomingRequires = allConcepts
    .filter((c) => c.frontmatter.id !== frontmatter.id)
    .flatMap((c) =>
      c.frontmatter.relations
        .filter((r) => r.target_id === frontmatter.id && r.type === 'requires')
        .map((r) => ({ source: c.frontmatter, note: r.note }))
    );

  const incomingUnderHood = allConcepts
    .filter((c) => c.frontmatter.id !== frontmatter.id)
    .flatMap((c) =>
      c.frontmatter.relations
        .filter((r) => r.target_id === frontmatter.id && r.type === 'under_the_hood')
        .map((r) => ({ source: c.frontmatter, note: r.note }))
    );

  const incomingContrasts = allConcepts
    .filter((c) => c.frontmatter.id !== frontmatter.id)
    .flatMap((c) =>
      c.frontmatter.relations
        .filter((r) => r.target_id === frontmatter.id && r.type === 'contrasts_with')
        .map((r) => ({ source: c.frontmatter, note: r.note }))
    );

  const incomingReplaces = allConcepts
    .filter((c) => c.frontmatter.id !== frontmatter.id)
    .flatMap((c) =>
      c.frontmatter.relations
        .filter((r) => r.target_id === frontmatter.id && r.type === 'replaces')
        .map((r) => ({ source: c.frontmatter, note: r.note }))
    );

  // Build Neighborhood Mini-Graph nodes (depth 1)
  const prereqNodes: MiniGraphNode[] = requires.map((r) => {
    const target = conceptMap.get(r.target_id);
    return {
      id: r.target_id,
      title: target?.title ?? r.target_id,
      domain: target?.domain,
      maturity_status: target?.maturity_status,
    };
  });

  const rightNodes: MiniGraphNode[] = [];
  const seenRight = new Set<string>();

  for (const item of incomingRequires) {
    if (!seenRight.has(item.source.id)) {
      seenRight.add(item.source.id);
      rightNodes.push({
        id: item.source.id,
        title: item.source.title,
        domain: item.source.domain,
        relationLabel: UI_STRINGS.relations.whatThisUnlocks,
      });
    }
  }
  for (const r of underHood) {
    if (!seenRight.has(r.target_id)) {
      seenRight.add(r.target_id);
      const target = conceptMap.get(r.target_id);
      rightNodes.push({
        id: r.target_id,
        title: target?.title ?? r.target_id,
        domain: target?.domain,
        relationLabel: UI_STRINGS.relations.underTheHood,
      });
    }
  }
  for (const r of replaces) {
    if (!seenRight.has(r.target_id)) {
      seenRight.add(r.target_id);
      const target = conceptMap.get(r.target_id);
      rightNodes.push({
        id: r.target_id,
        title: target?.title ?? r.target_id,
        domain: target?.domain,
        relationLabel: UI_STRINGS.relations.replaces,
      });
    }
  }

  // Build Connections & Logical Next Steps cards
  const connectionCards: ConnectionCardItem[] = [];

  for (const item of incomingRequires) {
    connectionCards.push({
      key: `unlocks-${item.source.id}`,
      targetId: item.source.id,
      targetTitle: item.source.title,
      targetDomain: UI_STRINGS.domains[item.source.domain] ?? item.source.domain,
      targetMaturity: item.source.maturity_status,
      groupLabel: UI_STRINGS.relations.whatThisUnlocks,
      note: item.note,
    });
  }

  for (const r of requires) {
    const target = conceptMap.get(r.target_id);
    connectionCards.push({
      key: `req-${r.target_id}`,
      targetId: r.target_id,
      targetTitle: target?.title ?? r.target_id,
      targetDomain: target ? (UI_STRINGS.domains[target.domain] ?? target.domain) : '',
      targetMaturity: target?.maturity_status,
      groupLabel: UI_STRINGS.relations.usefulPrerequisites,
      note: r.note,
    });
  }

  for (const r of underHood) {
    const target = conceptMap.get(r.target_id);
    connectionCards.push({
      key: `hood-out-${r.target_id}`,
      targetId: r.target_id,
      targetTitle: target?.title ?? r.target_id,
      targetDomain: target ? (UI_STRINGS.domains[target.domain] ?? target.domain) : '',
      targetMaturity: target?.maturity_status,
      groupLabel: UI_STRINGS.relations.underTheHood,
      note: r.note,
    });
  }

  for (const item of incomingUnderHood) {
    connectionCards.push({
      key: `hood-in-${item.source.id}`,
      targetId: item.source.id,
      targetTitle: item.source.title,
      targetDomain: UI_STRINGS.domains[item.source.domain] ?? item.source.domain,
      targetMaturity: item.source.maturity_status,
      groupLabel: UI_STRINGS.relations.underTheHood,
      note: item.note,
    });
  }

  for (const r of contrasts) {
    const target = conceptMap.get(r.target_id);
    connectionCards.push({
      key: `contrast-out-${r.target_id}`,
      targetId: r.target_id,
      targetTitle: target?.title ?? r.target_id,
      targetDomain: target ? (UI_STRINGS.domains[target.domain] ?? target.domain) : '',
      targetMaturity: target?.maturity_status,
      groupLabel: UI_STRINGS.relations.oftenConfusedWith,
      note: r.note,
    });
  }

  for (const item of incomingContrasts) {
    if (!contrasts.some((c) => c.target_id === item.source.id)) {
      connectionCards.push({
        key: `contrast-in-${item.source.id}`,
        targetId: item.source.id,
        targetTitle: item.source.title,
        targetDomain: UI_STRINGS.domains[item.source.domain] ?? item.source.domain,
        targetMaturity: item.source.maturity_status,
        groupLabel: UI_STRINGS.relations.oftenConfusedWith,
        note: item.note,
      });
    }
  }

  for (const r of replaces) {
    const target = conceptMap.get(r.target_id);
    connectionCards.push({
      key: `replaces-${r.target_id}`,
      targetId: r.target_id,
      targetTitle: target?.title ?? r.target_id,
      targetDomain: target ? (UI_STRINGS.domains[target.domain] ?? target.domain) : '',
      targetMaturity: target?.maturity_status,
      groupLabel: UI_STRINGS.relations.replaces,
      note: r.note,
    });
  }

  for (const item of incomingReplaces) {
    connectionCards.push({
      key: `replaced-by-in-${item.source.id}`,
      targetId: item.source.id,
      targetTitle: item.source.title,
      targetDomain: UI_STRINGS.domains[item.source.domain] ?? item.source.domain,
      targetMaturity: item.source.maturity_status,
      groupLabel: UI_STRINGS.relations.replacedBy,
      note: item.note,
    });
  }

  if (frontmatter.superseded_by) {
    for (const sid of frontmatter.superseded_by) {
      if (incomingReplaces.some((item) => item.source.id === sid)) continue;
      const target = conceptMap.get(sid);
      const matchingReplace = allConcepts
        .find((c) => c.frontmatter.id === sid)
        ?.frontmatter.relations.find((r) => r.target_id === frontmatter.id && r.type === 'replaces');
      connectionCards.push({
        key: `superseded-by-${sid}`,
        targetId: sid,
        targetTitle: target?.title ?? sid,
        targetDomain: target ? (UI_STRINGS.domains[target.domain] ?? target.domain) : '',
        targetMaturity: target?.maturity_status,
        groupLabel: UI_STRINGS.relations.replacedBy,
        note: matchingReplace?.note ?? target?.summary_tldr ?? 'Superseded by native platform primitive.',
      });
    }
  }

  const { mainPitfalls, whenNotToUse } = splitProductionPitfalls(sections.production_pitfalls);

  const tocItems: TocItem[] = [
    { id: 'in-brief', label: UI_STRINGS.toc.inBrief },
    ...(lab ? [{ id: 'lab', label: UI_STRINGS.toc.lab }] : []),
    { id: 'under-the-hood', label: UI_STRINGS.toc.underTheHood },
    { id: 'genealogy', label: UI_STRINGS.toc.genealogy },
    { id: 'production-pitfalls', label: UI_STRINGS.toc.productionPitfalls },
    { id: 'connections', label: UI_STRINGS.toc.connections },
    { id: 'sources', label: UI_STRINGS.toc.sources },
  ];

  const supersededTargets =
    frontmatter.superseded_by && frontmatter.superseded_by.length > 0
      ? frontmatter.superseded_by
      : incomingReplaces.map((item) => item.source.id);

  const jsonLd = buildConceptJsonLd(concept);

  const relevantPaths: PathProgressMeta[] = getLearningPaths()
    .filter((p) => p.concepts.includes(frontmatter.id))
    .map((p) => ({
      id: p.id,
      title: p.title,
      concepts: p.concepts,
    }));

  const pathConceptTitles: Record<string, string> = {};
  for (const p of relevantPaths) {
    for (const cid of p.concepts) {
      if (!pathConceptTitles[cid]) {
        pathConceptTitles[cid] = conceptMap.get(cid)?.title ?? cid;
      }
    }
  }

  return (
    <div className="concept-layout">
      {isPublished(frontmatter.proof_status, frontmatter.id) && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      )}
      <article className="concept-article">
        <PathProgressBar
          conceptId={frontmatter.id}
          paths={relevantPaths}
          conceptTitles={pathConceptTitles}
          position="top"
        />

        <div className="concept-meta">
          <span className="badge">{formatDomainLabel(frontmatter.domain)}</span>
          <span className={`badge badge-${frontmatter.maturity_status}`}>
            {formatMaturityLabel(frontmatter.maturity_status)}
          </span>
        </div>

        <h1 className="concept-title">{frontmatter.title}</h1>

        {isObsolete && (
          <div className="obsolescence-banner" role="alert">
            <strong>{UI_STRINGS.obsolescence.supersededPrefix}</strong>{' '}
            {supersededTargets.length > 0 ? (
              supersededTargets.map((sid, idx) => (
                <React.Fragment key={sid}>
                  {idx > 0 && ', '}
                  <Link href={`/concepts/${sid}`}>{conceptMap.get(sid)?.title ?? sid}</Link>
                </React.Fragment>
              ))
            ) : (
              <span>{UI_STRINGS.obsolescence.legacyPattern}</span>
            )}
          </div>
        )}

        {!isObsolete && replaces.length > 0 && (
          <div className="replacement-banner" role="note">
            <strong>{UI_STRINGS.obsolescence.replacesPrefix}</strong>{' '}
            {replaces.map((r, idx) => (
              <React.Fragment key={r.target_id}>
                {idx > 0 && ', '}
                <Link href={`/concepts/${r.target_id}`}>
                  {conceptMap.get(r.target_id)?.title ?? r.target_id}
                </Link>
              </React.Fragment>
            ))}
          </div>
        )}

        {frontmatter.relations.length > 0 && (
          <aside className="relations-banner" aria-label="Relational context">
            {requires.length > 0 && (
              <div>
                <div className="rel-group-title">{UI_STRINGS.sections.usefulPrerequisites}</div>
                {requires.map((r) => {
                  const target = conceptMap.get(r.target_id);
                  return (
                    <Link
                      key={r.target_id}
                      href={`/concepts/${r.target_id}`}
                      className="rel-chip"
                      title={
                        target
                          ? `${target.summary_tldr} [${formatMaturityLabel(target.maturity_status)}]`
                          : r.note
                      }
                    >
                      {target?.title ?? r.target_id}
                    </Link>
                  );
                })}
              </div>
            )}
            {underHood.length > 0 && (
              <div>
                <div className="rel-group-title">{UI_STRINGS.sections.underTheHood}</div>
                {underHood.map((r) => {
                  const target = conceptMap.get(r.target_id);
                  return (
                    <Link
                      key={r.target_id}
                      href={`/concepts/${r.target_id}`}
                      className="rel-chip"
                      title={
                        target
                          ? `${target.summary_tldr} [${formatMaturityLabel(target.maturity_status)}]`
                          : r.note
                      }
                    >
                      {target?.title ?? r.target_id}
                    </Link>
                  );
                })}
              </div>
            )}
            {(replaces.length > 0 || contrasts.length > 0) && (
              <div>
                <div className="rel-group-title">
                  {replaces.length > 0
                    ? UI_STRINGS.relations.replaces
                    : UI_STRINGS.relations.oftenConfusedWith}
                </div>
                {[...replaces, ...contrasts].map((r) => {
                  const target = conceptMap.get(r.target_id);
                  return (
                    <Link
                      key={`${r.type}-${r.target_id}`}
                      href={`/concepts/${r.target_id}`}
                      className="rel-chip"
                      title={
                        target
                          ? `${target.summary_tldr} [${formatMaturityLabel(target.maturity_status)}]`
                          : r.note
                      }
                    >
                      {r.type === 'replaces'
                        ? `${UI_STRINGS.relations.replaces}: `
                        : `${UI_STRINGS.relations.oftenConfusedWith}: `}
                      {target?.title ?? r.target_id}
                    </Link>
                  );
                })}
              </div>
            )}
          </aside>
        )}

        <section
          id="in-brief"
          className="callout callout-mental-model"
          aria-label={UI_STRINGS.callouts.mentalModel}
        >
          <div className="callout-header">
            <Lightbulb size={16} aria-hidden="true" />
            <span>{UI_STRINGS.callouts.mentalModel}</span>
          </div>
          <MdxBlock source={sections.tl_dr} conceptPreviews={conceptPreviews} />
        </section>

        {lab && (
          <section id="lab" className="section-block" aria-label={UI_STRINGS.sections.interactiveSimulator}>
            <InteractiveLabRenderer config={lab} />
          </section>
        )}

        <section id="under-the-hood" className="section-block">
          <h2>{UI_STRINGS.sections.underTheHood}</h2>
          <MdxBlock source={sections.under_the_hood} conceptPreviews={conceptPreviews} />
        </section>

        <section id="genealogy" className="section-block">
          <h2>Problem Genealogy</h2>
          <MdxBlock source={sections.genealogy} conceptPreviews={conceptPreviews} />
        </section>

        <section id="production-pitfalls" className="section-block">
          <h2>{UI_STRINGS.toc.productionPitfalls}</h2>
          {mainPitfalls && (
            <div className="callout callout-pitfall">
              <div className="callout-header">
                <AlertTriangle size={16} aria-hidden="true" />
                <span>{UI_STRINGS.callouts.productionPitfall}</span>
              </div>
              <MdxBlock source={mainPitfalls} conceptPreviews={conceptPreviews} />
            </div>
          )}
          {whenNotToUse && (
            <div className="callout callout-when-not-to-use">
              <div className="callout-header">
                <Ban size={16} aria-hidden="true" />
                <span>{UI_STRINGS.callouts.whenNotToUse}</span>
              </div>
              <MdxBlock source={whenNotToUse} conceptPreviews={conceptPreviews} />
            </div>
          )}
        </section>

        <section id="connections" className="section-block connections-section">
          <h2>{UI_STRINGS.sections.connectionsAndNextSteps}</h2>

          <NeighborhoodMiniGraph
            current={{
              id: frontmatter.id,
              title: frontmatter.title,
              domain: frontmatter.domain,
              maturity_status: frontmatter.maturity_status,
            }}
            prerequisites={prereqNodes}
            unlockedAndRelated={rightNodes}
          />

          {connectionCards.length > 0 && (
            <div className="connections-grid">
              {connectionCards.map((card) => (
                <Link
                  key={card.key}
                  href={`/concepts/${card.targetId}`}
                  className="connection-card"
                >
                  <div className="connection-card-top">
                    <span className="connection-type-tag">{card.groupLabel}</span>
                    {card.targetMaturity && (
                      <span className={`badge badge-${card.targetMaturity}`}>
                        {formatMaturityLabel(card.targetMaturity)}
                      </span>
                    )}
                  </div>
                  <div className="connection-card-title">{card.targetTitle}</div>
                  {card.targetDomain && (
                    <div className="connection-card-domain">{card.targetDomain}</div>
                  )}
                  <p className="connection-card-note">{card.note}</p>
                </Link>
              ))}
            </div>
          )}

          {associatedAutopsies.length > 0 && (
            <div style={{ marginTop: '24px' }} data-testid="seen-in-autopsies">
              <h3 style={{ fontSize: '1.05rem', marginBottom: '12px' }}>
                {UI_STRINGS.autopsies.seenInAutopsies}
              </h3>
              <div className="connections-grid">
                {associatedAutopsies.map((a) => {
                  const step = a.frontmatter.traversed_concepts.find(
                    (tc) => tc.concept_id === frontmatter.id
                  );
                  return (
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
                      {step && <p className="connection-card-note">{step.role_in_chain}</p>}
                    </Link>
                  );
                })}
              </div>
            </div>
          )}

          {vsPairs.length > 0 && (
            <div style={{ marginTop: '24px' }} data-testid="concept-vs-comparisons">
              <h3 style={{ fontSize: '1.05rem', marginBottom: '12px' }}>
                Mechanical Comparisons
              </h3>
              <div className="connections-grid">
                {vsPairs.map((pair) => (
                  <Link
                    key={pair.slug}
                    href={`/vs/${pair.slug}`}
                    className="connection-card"
                  >
                    <div className="connection-card-top">
                      <span className="connection-type-tag">
                        {pair.relationType === 'replaces' ? 'Replaces' : 'Contrasts With'}
                      </span>
                    </div>
                    <div className="connection-card-title">
                      {pair.primary.frontmatter.title} vs {pair.secondary.frontmatter.title}
                    </div>
                    <p className="connection-card-note">{pair.note}</p>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </section>

        <PathProgressBar
          conceptId={frontmatter.id}
          paths={relevantPaths}
          conceptTitles={pathConceptTitles}
          position="bottom"
        />

        <footer id="sources" className="sources-footer">
          <strong>{UI_STRINGS.sections.primarySources}</strong> (verified {frontmatter.last_verified_at}):
          <ul>
            {frontmatter.sources.map((url) => (
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

      <aside className="concept-toc-sidebar">
        <ConceptToc items={tocItems} />
      </aside>
    </div>
  );
}
