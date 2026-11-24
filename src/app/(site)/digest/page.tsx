import React from 'react';
import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { getAllConcepts, getAllDigests } from '@/lib/content-loader';
import type { Metadata } from 'next';
import { formatDigestCategory, UI_STRINGS } from '@/lib/ui-strings';

import { isListingIndexable } from '@/lib/publication';

const baseMetadata: Metadata = {
  title: 'Curated Technical Watch | frontend.rocks',
  description:
    '5 to 8 high-signal frontend engineering updates per issue, linked directly to durable graph concepts.',
  alternates: {
    canonical: 'https://frontend.rocks/digest/',
  },
};

// Digests are not verified: this page is never indexable.
export function generateMetadata(): Metadata {
  return { ...baseMetadata, robots: { index: isListingIndexable(0), follow: true } };
}

export default function DigestPage() {
  const digests = getAllDigests();
  const conceptMap = new Map(getAllConcepts().map((c) => [c.frontmatter.id, c.frontmatter.title]));

  return (
    <div style={{ padding: '32px 0 64px', maxWidth: '880px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <h1 style={{ margin: 0 }}>{UI_STRINGS.sections.curatedWatch}</h1>
        <a href="/rss.xml" className="lab-btn">
          RSS / Atom Feed
        </a>
      </div>
      <p style={{ color: 'var(--text-muted)' }}>
        5 to 8 high-signal engineering updates per issue, linked directly to durable graph concepts.
      </p>

      {digests.length === 0 && (
        <p style={{ color: 'var(--text-muted)' }}>No curated watch issues published yet.</p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '28px', marginTop: '24px' }}>
        {digests.map((d) => (
          <section
            key={d.id}
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: '12px',
              padding: '20px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
              <span className="badge">{d.id}</span>
              <span style={{ fontSize: '0.84rem', color: 'var(--text-muted)' }}>{d.published_at}</span>
            </div>
            <h2 style={{ margin: '8px 0 6px' }}>{d.title}</h2>
            <p style={{ margin: '0 0 16px', color: 'var(--text-muted)' }}>{d.summary}</p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {[...d.entries]
                .sort((a, b) => (b.impact_score ?? 0) - (a.impact_score ?? 0))
                .map((entry) => (
                  <article
                    key={entry.title}
                    style={{
                      borderTop: '1px solid var(--border)',
                      paddingTop: '12px',
                    }}
                  >
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                      <span className="badge">{formatDigestCategory(entry.category)}</span>
                      <a
                        href={entry.source_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-semibold"
                      >
                        {entry.title}
                        <ArrowUpRight
                          size={14}
                          className="inline-block align-text-bottom ml-1 shrink-0"
                          aria-hidden="true"
                        />
                      </a>
                    </div>
                    <p style={{ margin: '6px 0 8px', fontSize: '0.92rem' }}>{entry.editorial_take}</p>
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                      {entry.related_concepts.map((cid) => (
                        <Link key={cid} href={`/concepts/${cid}`} className="rel-chip">
                          {conceptMap.get(cid) ?? cid}
                        </Link>
                      ))}
                    </div>
                  </article>
                ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
