'use client';

import React, { Suspense, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft, ArrowRight, Check, Circle } from 'lucide-react';
import {
  getExploredConcepts,
  getPathProgress,
  markConceptExplored,
  subscribeProgress,
  toggleConceptExplored,
} from '@/lib/progress';
import './PathProgressBar.css';

export interface PathProgressMeta {
  id: string;
  title: string;
  concepts: string[];
}

export interface PathProgressBarProps {
  conceptId: string;
  paths: PathProgressMeta[];
  conceptTitles: Record<string, string>;
  position: 'top' | 'bottom';
}

function PathProgressBarInner({
  conceptId,
  paths,
  conceptTitles,
  position,
}: PathProgressBarProps) {
  const searchParams = useSearchParams();
  const pathParam = searchParams.get('path');

  const [explored, setExplored] = useState<string[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const manualToggleRef = useRef(false);
  const autoMarkedRef = useRef(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    manualToggleRef.current = false;
    autoMarkedRef.current = false;
    setExplored(getExploredConcepts());
    setHydrated(true);
    return subscribeProgress((next) => {
      setExplored(next);
    });
  }, [conceptId]);

  // Automatically record exploration when the reader scrolls past 65% of the page
  // or reaches the bottom progress bar. Runs only on the bottom instance to avoid
  // duplicate observers.
  useEffect(() => {
    if (position !== 'bottom') return;

    const recordExploredOnce = () => {
      if (manualToggleRef.current || autoMarkedRef.current) return;
      autoMarkedRef.current = true;
      markConceptExplored(conceptId);
    };

    const handleScroll = () => {
      if (manualToggleRef.current || autoMarkedRef.current) return;
      const docEl = document.documentElement;
      const scrollable = docEl.scrollHeight - window.innerHeight;
      if (scrollable <= 0) return;
      const ratio = window.scrollY / scrollable;
      if (ratio >= 0.65) {
        recordExploredOnce();
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });

    let observer: IntersectionObserver | null = null;
    if (typeof IntersectionObserver !== 'undefined' && sentinelRef.current) {
      observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((entry) => entry.isIntersecting)) {
            recordExploredOnce();
          }
        },
        { threshold: 0.25 }
      );
      observer.observe(sentinelRef.current);
    }

    return () => {
      window.removeEventListener('scroll', handleScroll);
      observer?.disconnect();
    };
  }, [conceptId, position]);

  const isExplored = hydrated && explored.includes(conceptId);

  const handleToggleUnderstood = () => {
    manualToggleRef.current = true;
    toggleConceptExplored(conceptId);
  };

  const activePath = pathParam
    ? paths.find((p) => p.id === pathParam && p.concepts.includes(conceptId)) ?? null
    : null;

  if (!activePath) {
    if (position === 'top') return null;

    return (
      <div
        ref={sentinelRef}
        className="concept-standalone-progress"
        data-testid="concept-progress-standalone"
      >
        <span className="concept-standalone-progress-hint">
          {isExplored
            ? 'Recorded locally in this browser. Reflected on the Concept Map.'
            : 'Progress is stored locally in this browser only.'}
        </span>
        <button
          type="button"
          className="path-understood-btn"
          aria-pressed={isExplored}
          onClick={handleToggleUnderstood}
          data-testid="concept-understood-toggle"
        >
          {isExplored ? (
            <>
              <Check size={14} aria-hidden="true" />
              <span>Understood</span>
            </>
          ) : (
            <>
              <Circle size={14} aria-hidden="true" />
              <span>Mark as understood</span>
            </>
          )}
        </button>
      </div>
    );
  }

  const stepIndex = activePath.concepts.indexOf(conceptId);
  const totalSteps = activePath.concepts.length;
  const stepNumber = stepIndex + 1;
  const prevConceptId = stepIndex > 0 ? activePath.concepts[stepIndex - 1] : null;
  const nextConceptId =
    stepIndex < totalSteps - 1 ? activePath.concepts[stepIndex + 1] : null;

  const progress = hydrated
    ? getPathProgress(activePath.concepts, explored)
    : { completed: 0, total: totalSteps, percentage: Math.round((stepNumber / totalSteps) * 100) };

  const barPercentage = Math.max(
    Math.round((stepNumber / totalSteps) * 100),
    progress.percentage
  );

  const encodedPath = encodeURIComponent(activePath.id);

  return (
    <div ref={position === 'bottom' ? sentinelRef : undefined}>
      <nav
        className={`path-progress-bar path-progress-bar-${position}`}
        aria-label={`Learning path: ${activePath.title}`}
        data-testid={`path-progress-bar-${position}`}
      >
        <div className="path-progress-header">
          <div className="path-progress-title-group">
            <span className="path-progress-kicker">Learning Path</span>
            <span className="path-progress-title">{activePath.title}</span>
          </div>
          <span className="path-progress-step" data-testid={`path-step-indicator-${position}`}>
            Step {stepNumber} / {totalSteps}
            {hydrated && progress.completed > 0
              ? ` · ${progress.completed}/${progress.total} completed`
              : ''}
          </span>
        </div>

        <div
          className="path-progress-track"
          role="progressbar"
          aria-label={`${activePath.title} progress`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={barPercentage}
        >
          <div className="path-progress-fill" style={{ width: `${barPercentage}%` }} />
        </div>

        <div className="path-progress-actions">
          <div className="path-progress-nav-group">
            {prevConceptId && (
              <Link
                href={`/concepts/${prevConceptId}/?path=${encodedPath}`}
                className="path-nav-link"
                data-testid={`path-prev-link-${position}`}
              >
                <ArrowLeft size={14} aria-hidden="true" />
                <span>Previous</span>
              </Link>
            )}

            {nextConceptId ? (
              <Link
                href={`/concepts/${nextConceptId}/?path=${encodedPath}`}
                className="path-nav-link path-nav-link-next"
                data-testid={`path-next-link-${position}`}
              >
                <span>Next: {conceptTitles[nextConceptId] ?? nextConceptId}</span>
                <ArrowRight size={14} aria-hidden="true" />
              </Link>
            ) : (
              <span className="path-complete-label">Final step of this path</span>
            )}
          </div>

          <button
            type="button"
            className="path-understood-btn"
            aria-pressed={isExplored}
            onClick={handleToggleUnderstood}
            data-testid={`concept-understood-toggle-${position}`}
          >
            {isExplored ? (
              <>
                <Check size={14} aria-hidden="true" />
                <span>Understood</span>
              </>
            ) : (
              <>
                <Circle size={14} aria-hidden="true" />
                <span>Mark as understood</span>
              </>
            )}
          </button>
        </div>
      </nav>
    </div>
  );
}

export function PathProgressBar(props: PathProgressBarProps) {
  return (
    <Suspense fallback={null}>
      <PathProgressBarInner {...props} />
    </Suspense>
  );
}
