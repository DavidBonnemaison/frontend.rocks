import React from 'react';
import Link from 'next/link';
import { ArrowDown, ArrowRight } from 'lucide-react';
import { getAllConcepts } from '@/lib/content-loader';
import { UI_STRINGS } from '@/lib/ui-strings';
import type { Metadata } from 'next';
import './obsolescence.css';

import { isListingIndexable, publishedConcepts } from '@/lib/publication';

const baseMetadata: Metadata = {
  title: 'Obsolescence Radar | frontend.rocks',
  description: UI_STRINGS.obsolescence.radarSubtitle,
  alternates: {
    canonical: 'https://frontend.rocks/obsolescence/',
  },
};

export function generateMetadata(): Metadata {
  return {
    ...baseMetadata,
    robots: { index: isListingIndexable(publishedConcepts(getAllConcepts()).length), follow: true },
  };
}

export default function ObsolescencePage() {
  const concepts = getAllConcepts();
  const conceptMap = new Map(concepts.map((c) => [c.frontmatter.id, c.frontmatter]));

  const replacementEdges = concepts.flatMap((c) =>
    c.frontmatter.relations
      .filter((r) => r.type === 'replaces')
      .map((r) => ({
        modern: c.frontmatter,
        legacyId: r.target_id,
        legacy: conceptMap.get(r.target_id),
        note: r.note,
      }))
  );

  const replacedLegacyIds = new Set(replacementEdges.map((edge) => edge.legacyId));

  const standaloneObsoleteNodes = concepts.filter(
    (c) =>
      (c.frontmatter.maturity_status === 'legacy-pattern' ||
        c.frontmatter.maturity_status === 'superseded') &&
      !replacedLegacyIds.has(c.frontmatter.id)
  );

  return (
    <div className="radar-page">
      <h1 className="radar-title">{UI_STRINGS.obsolescence.radarTitle}</h1>
      <p className="radar-subtitle">{UI_STRINGS.obsolescence.radarSubtitle}</p>
      <div className="radar-crosslink">
        <span>Need side-by-side mechanical X vs Y trade-offs across all primitives?</span>
        <Link href="/vs/" className="radar-crosslink-cta">
          Compare Primitives (/vs)
          <ArrowRight size={14} aria-hidden="true" />
        </Link>
      </div>
      <div className="radar-crosslink">
        <span>Looking for weekly spec shifts and engine release signals?</span>
        <Link href="/digest" className="radar-crosslink-cta">
          {UI_STRINGS.home.signalsViewCuratedWatch}
          <ArrowRight size={14} aria-hidden="true" />
        </Link>
      </div>

      <div className="radar-list">
        {replacementEdges.map((edge) => {
          const legacyStatus = edge.legacy?.maturity_status ?? 'legacy-pattern';
          const legacyLabel =
            legacyStatus === 'superseded'
              ? UI_STRINGS.obsolescence.superseded
              : UI_STRINGS.obsolescence.legacyPattern;

          return (
            <article key={`${edge.modern.id}-${edge.legacyId}`} className="radar-card">
              <div className="radar-card-grid">
                <div className="radar-block radar-block-legacy">
                  <div className="radar-badge-row">
                    <span className="badge badge-legacy-pattern">{legacyLabel}</span>
                  </div>
                  <Link href={`/concepts/${edge.legacyId}`} className="radar-block-title">
                    {edge.legacy?.title ?? edge.legacyId}
                  </Link>
                  {edge.legacy?.summary_tldr && (
                    <p className="radar-block-summary">{edge.legacy.summary_tldr}</p>
                  )}
                </div>

                <span className="radar-arrow" aria-hidden="true">
                  <ArrowRight size={18} className="radar-arrow-desktop" />
                  <ArrowDown size={18} className="radar-arrow-mobile" />
                </span>

                <div className="radar-block radar-block-native">
                  <div className="radar-badge-row">
                    <span className="badge badge-baseline-widely">
                      {UI_STRINGS.obsolescence.nativeReplacement}
                    </span>
                  </div>
                  <Link href={`/concepts/${edge.modern.id}`} className="radar-block-title">
                    {edge.modern.title}
                  </Link>
                  <p className="radar-block-summary">{edge.modern.summary_tldr}</p>
                </div>
              </div>

              <p className="radar-note">{edge.note}</p>
            </article>
          );
        })}

        {standaloneObsoleteNodes.map((c) => {
          const legacyLabel =
            c.frontmatter.maturity_status === 'superseded'
              ? UI_STRINGS.obsolescence.superseded
              : UI_STRINGS.obsolescence.legacyPattern;
          return (
            <Link
              key={c.frontmatter.id}
              href={`/concepts/${c.frontmatter.id}`}
              className="radar-standalone"
            >
              <span className={`badge badge-${c.frontmatter.maturity_status}`}>{legacyLabel}</span>{' '}
              <strong>{c.frontmatter.title}</strong>
              <p className="radar-standalone-summary">{c.frontmatter.summary_tldr}</p>
            </Link>
          );
        })}

        {replacementEdges.length === 0 && standaloneObsoleteNodes.length === 0 && (
          <p style={{ color: 'var(--text-muted)' }}>No transitions recorded yet.</p>
        )}
      </div>
    </div>
  );
}
