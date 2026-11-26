'use client';

import React, { useEffect, useRef, useState } from 'react';
import './Instrument.css';

export type InstrumentStatus = 'proven' | 'diverges' | 'failed' | 'stale' | 'pending';

export interface StatusLedProps {
  status: InstrumentStatus;
  label?: string;
}

const DEFAULT_LABELS: Record<InstrumentStatus, string> = {
  proven: 'PROVEN',
  diverges: 'DIVERGES',
  failed: 'FAILED',
  stale: 'STALE',
  pending: 'PENDING',
};

export function StatusLed({ status, label }: StatusLedProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.1 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <span
      ref={ref}
      className="status-led"
      data-status={status}
      data-visible={visible ? 'true' : 'false'}
    >
      <span className="status-led-dot" aria-hidden="true" />
      <span className="caps">{label ?? DEFAULT_LABELS[status]}</span>
    </span>
  );
}
