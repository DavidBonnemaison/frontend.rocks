import React from 'react';
import Link from 'next/link';
import type { Metadata } from 'next';
import { Activity } from 'lucide-react';
import { PRODUCTION_SYMPTOMS } from '@/config/symptoms';
import { SITE_URL } from '@/lib/seo-schema';

import { isListingIndexable, publishedSymptoms } from '@/lib/publication';

const baseMetadata: Metadata = {
  title: 'Production Symptoms & DevTools Signatures | frontend.rocks',
  description:
    'Diagnose real frontend production bugs from DevTools warnings, Web Vitals regressions, and runtime symptoms down to their browser root cause.',
  alternates: {
    canonical: `${SITE_URL}/symptoms/`,
  },
  openGraph: {
    title: 'Production Symptoms & DevTools Signatures | frontend.rocks',
    description:
      'Diagnose real frontend production bugs from DevTools warnings, Web Vitals regressions, and runtime symptoms down to their browser root cause.',
    url: `${SITE_URL}/symptoms/`,
    type: 'website',
  },
};

export function generateMetadata(): Metadata {
  return {
    ...baseMetadata,
    robots: { index: isListingIndexable(publishedSymptoms(PRODUCTION_SYMPTOMS).length), follow: true },
  };
}

export default function SymptomsIndexPage() {
  return (
    <div style={{ maxWidth: '1040px', margin: '0 auto', padding: '32px 0' }}>
      <div className="concept-meta">
        <span className="badge">
          <Activity size={12} style={{ marginRight: '6px' }} aria-hidden="true" />
          Diagnostic Index · {PRODUCTION_SYMPTOMS.length} Production Symptoms
        </span>
      </div>

      <h1 className="concept-title" style={{ marginTop: '10px' }}>
        Production Symptoms &amp; DevTools Signatures
      </h1>
      <p style={{ color: 'var(--text-muted)', maxWidth: '720px', fontSize: '1.05rem' }}>
        Start from the error message, layout glitch, or Web Vitals regression you observe in
        production and trace the causal chain of browser mechanisms behind it.
      </p>

      <div className="connections-grid" style={{ marginTop: '24px' }}>
        {PRODUCTION_SYMPTOMS.map((symptom) => (
          <Link
            key={symptom.slug}
            href={`/symptoms/${symptom.slug}`}
            className="connection-card"
          >
            <div className="connection-card-top">
              <span className="connection-type-tag">
                {symptom.concept_ids.length} concepts
              </span>
              {symptom.autopsy_ids.length > 0 && (
                <span className="badge">
                  {symptom.autopsy_ids.length}{' '}
                  {symptom.autopsy_ids.length === 1 ? 'autopsy' : 'autopsies'}
                </span>
              )}
            </div>
            <div className="connection-card-title">{symptom.search_title}</div>
            <p className="connection-card-note">{symptom.summary}</p>
            <code
              style={{
                display: 'block',
                marginTop: '10px',
                fontSize: '0.78rem',
                color: 'var(--text-muted)',
                background: 'var(--surface-2)',
                padding: '6px 8px',
                borderRadius: '6px',
                border: '1px solid var(--border)',
                whiteSpace: 'normal',
                wordBreak: 'break-word',
              }}
            >
              {symptom.devtools_signature}
            </code>
          </Link>
        ))}
      </div>
    </div>
  );
}
