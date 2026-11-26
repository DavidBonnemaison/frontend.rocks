'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from './useReducedMotion';
import './instruments.css';

export interface InstrumentFrameProps {
  caption: string;
  figureNumber?: number;
  announce?: string;
  empty?: string | null;
  error?: string | null;
  highlightColor?: string;
  label?: string;
  roleImg?: boolean;
  controls?: React.ReactNode;
  note?: string;
  className?: string;
  children?: React.ReactNode;
}

const CROP_CORNERS = ['tl', 'tr', 'bl', 'br'] as const;

export function InstrumentFrame({
  caption,
  figureNumber,
  announce,
  empty,
  error,
  highlightColor,
  label,
  roleImg = false,
  controls,
  note,
  className,
  children,
}: InstrumentFrameProps) {
  const reducedMotion = useReducedMotion();
  const rootRef = useRef<HTMLElement | null>(null);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    if (reducedMotion || typeof IntersectionObserver === 'undefined') return;
    const node = rootRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setRevealed(true);
          observer.disconnect();
        }
      },
      { threshold: 0.05 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [reducedMotion]);

  const isVisible = reducedMotion || revealed;
  const style = highlightColor
    ? ({ '--inst-highlight': highlightColor } as React.CSSProperties)
    : undefined;

  const captionText =
    typeof figureNumber === 'number' ? `FIG. ${figureNumber} · ${caption}` : caption;

  return (
    <figure
      ref={rootRef}
      className={className ? `inst ${className}` : 'inst'}
      data-revealed={isVisible ? 'true' : 'false'}
      data-reduced-motion={reducedMotion ? 'true' : 'false'}
      style={style}
    >
      <div className="inst-stage">
        {CROP_CORNERS.map((corner) => (
          <svg
            key={corner}
            className={`inst-crop inst-crop-${corner}`}
            width="9"
            height="9"
            viewBox="0 0 9 9"
            aria-hidden="true"
            focusable="false"
          >
            {corner === 'tl' ? <path d="M0.5 8.5 V0.5 H8.5" /> : null}
            {corner === 'tr' ? <path d="M0.5 0.5 H8.5 V8.5" /> : null}
            {corner === 'bl' ? <path d="M0.5 0.5 V8.5 H8.5" /> : null}
            {corner === 'br' ? <path d="M0.5 8.5 H8.5 V0.5" /> : null}
          </svg>
        ))}

        {controls ? <div className="inst-controls">{controls}</div> : null}

        {error ? (
          <div className="inst-state inst-state-error" role="alert">
            <span className="inst-state-tag">SCHEMA ERROR</span>
            <p className="inst-state-msg">{error}</p>
          </div>
        ) : empty ? (
          <div className="inst-state inst-state-empty" role="status">
            <span className="inst-state-tag">NO DATA</span>
            <p className="inst-state-msg">{empty}</p>
          </div>
        ) : roleImg ? (
          <div className="inst-body" role="img" aria-label={label ?? caption}>
            {children}
          </div>
        ) : (
          <div className="inst-body" aria-label={label}>
            {children}
          </div>
        )}
      </div>

      {note ? <p className="inst-note">{note}</p> : null}

      <figcaption className="inst-caption">{captionText}</figcaption>

      <p className="inst-sr" aria-live="polite" aria-atomic="true">
        {announce ?? ''}
      </p>
    </figure>
  );
}
