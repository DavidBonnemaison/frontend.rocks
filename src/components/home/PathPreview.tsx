'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { formatDomainLabel, formatMaturityLabel, UI_STRINGS } from '@/lib/ui-strings';
import type { Domain, MaturityStatus } from '@/lib/schemas';

export interface PathPreviewConcept {
  id: string;
  title: string;
  domain: Domain;
  maturity_status: MaturityStatus | null;
  summary_tldr: string;
  hasLab: boolean;
}

export function PathPreview({
  pathId,
  pathTitle,
  concepts,
}: {
  pathId?: string;
  pathTitle: string;
  concepts: PathPreviewConcept[];
}) {
  const [selectedIdx, setSelectedIdx] = useState(0);
  if (concepts.length === 0) return null;

  const active = concepts[selectedIdx] ?? concepts[0];
  const conceptHref = pathId
    ? `/concepts/${active.id}/?path=${encodeURIComponent(pathId)}`
    : `/concepts/${active.id}/`;

  return (
    <div className="path-preview-box" data-testid="home-path-preview">
      <div className="path-preview-head">
        <div>
          <span className="path-preview-kicker">{UI_STRINGS.home.pathsPreviewTitle}</span>
          <strong className="path-preview-title">{pathTitle}</strong>
        </div>
        <span className="path-preview-hint">{UI_STRINGS.home.pathsPreviewHint}</span>
      </div>

      <div className="path-preview-steps" role="tablist" aria-label={pathTitle}>
        {concepts.map((c, idx) => (
          <button
            key={c.id}
            type="button"
            role="tab"
            aria-selected={idx === selectedIdx}
            onClick={() => setSelectedIdx(idx)}
            className={`path-step-btn ${idx === selectedIdx ? 'active' : ''}`}
          >
            <span className="path-step-num">{idx + 1}</span>
            <span className="path-step-label">{c.title}</span>
          </button>
        ))}
      </div>

      <div className="path-preview-detail" role="tabpanel">
        <div className="path-preview-detail-meta">
          <span className="badge">{formatDomainLabel(active.domain)}</span>
          {active.maturity_status && (
            <span className={`badge badge-${active.maturity_status}`}>
              {formatMaturityLabel(active.maturity_status)}
            </span>
          )}
          {active.hasLab && (
            <span className="lab-badge">{UI_STRINGS.sections.interactiveSimulator}</span>
          )}
        </div>
        <h3 className="path-preview-detail-title">{active.title}</h3>
        <p className="path-preview-detail-summary">{active.summary_tldr}</p>
        <Link href={conceptHref} className="lab-btn lab-btn-primary">
          {UI_STRINGS.home.pathsOpenConcept}
          <ArrowRight size={14} aria-hidden="true" />
        </Link>
      </div>
    </div>
  );
}
