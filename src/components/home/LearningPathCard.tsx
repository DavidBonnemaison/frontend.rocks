'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Check } from 'lucide-react';
import { UI_STRINGS } from '@/lib/ui-strings';
import {
  getExploredConcepts,
  getPathProgress,
  subscribeProgress,
} from '@/lib/progress';

export interface LearningPathCardProps {
  id: string;
  title: string;
  description: string;
  estimatedMinutes: number;
  labCount: number;
  concepts: string[];
}

export function LearningPathCard({
  id,
  title,
  description,
  estimatedMinutes,
  labCount,
  concepts,
}: LearningPathCardProps) {
  const [explored, setExplored] = useState<string[] | null>(null);

  useEffect(() => {
    setExplored(getExploredConcepts());
    return subscribeProgress((next) => {
      setExplored(next);
    });
  }, []);

  const firstConceptId = concepts[0];
  const progress = explored ? getPathProgress(concepts, explored) : null;
  const isComplete = progress !== null && progress.total > 0 && progress.completed === progress.total;

  return (
    <article className="home-card" data-testid={`learning-path-card-${id}`}>
      <div className="home-path-meta">
        <span className="badge">
          {estimatedMinutes} {UI_STRINGS.home.pathsMinLabel}
        </span>
        <span className="badge">
          {labCount} {UI_STRINGS.home.pathsLabsLabel}
        </span>
        <span className="badge">
          {concepts.length} {UI_STRINGS.home.pathsConceptsLabel}
        </span>
      </div>

      <h3 className="home-card-title">{title}</h3>
      <p className="home-card-desc home-path-summary">{description}</p>

      {progress !== null && (
        <div className="home-path-progress" data-testid={`learning-path-progress-${id}`}>
          <div className="home-path-progress-row">
            <span
              className={`home-path-progress-label${isComplete ? ' is-complete' : progress.completed > 0 ? ' is-started' : ''}`}
            >
              {isComplete && <Check size={12} aria-hidden="true" />}
              <span>
                {progress.completed}/{progress.total} completed
              </span>
            </span>
          </div>
          <div
            className="home-path-progress-track"
            role="progressbar"
            aria-label={`${title} completion`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress.percentage}
          >
            <div
              className={`home-path-progress-fill${isComplete ? ' is-complete' : ''}`}
              style={{ width: `${progress.percentage}%` }}
            />
          </div>
        </div>
      )}

      <div className="home-card-footer">
        <Link
          href={`/concepts/${firstConceptId}/?path=${encodeURIComponent(id)}`}
          className="home-card-link"
          data-testid={`learning-path-start-${id}`}
        >
          {progress && progress.completed > 0 && !isComplete
            ? 'Continue path'
            : UI_STRINGS.home.pathsStartCta}
          <ArrowRight size={14} aria-hidden="true" />
        </Link>
      </div>
    </article>
  );
}
