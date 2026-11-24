'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Clock, Flame } from 'lucide-react';
import { FAILURE_MODE_VALUES } from '@/lib/schemas';
import { formatFailureModeLabel, UI_STRINGS } from '@/lib/ui-strings';

export interface AutopsyIndexItem {
  id: string;
  caseNumber: number;
  title: string;
  symptom: string;
  failureMode: string;
  readingTimeMin: number;
  concepts: Array<{ id: string; title: string }>;
}

export function AutopsyIndexClient({ autopsies }: { autopsies: AutopsyIndexItem[] }) {
  const [selectedMode, setSelectedMode] = useState<string>('all');

  const filtered = useMemo(() => {
    if (selectedMode === 'all') return autopsies;
    return autopsies.filter((a) => a.failureMode === selectedMode);
  }, [autopsies, selectedMode]);

  return (
    <div>
      <div
        role="group"
        aria-label="Filter by failure mode"
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '8px',
          marginBottom: '24px',
        }}
      >
        <button
          type="button"
          className={`lab-btn${selectedMode === 'all' ? ' lab-btn-primary' : ''}`}
          onClick={() => setSelectedMode('all')}
          aria-pressed={selectedMode === 'all'}
        >
          {UI_STRINGS.autopsies.allFailureModes} ({autopsies.length})
        </button>

        {FAILURE_MODE_VALUES.map((mode) => {
          const count = autopsies.filter((a) => a.failureMode === mode).length;
          return (
            <button
              key={mode}
              type="button"
              className={`lab-btn${selectedMode === mode ? ' lab-btn-primary' : ''}`}
              onClick={() => setSelectedMode(mode)}
              aria-pressed={selectedMode === mode}
            >
              {formatFailureModeLabel(mode)} ({count})
            </button>
          );
        })}
      </div>

      {filtered.length === 0 ? (
        <div className="card" style={{ color: 'var(--text-muted)' }}>
          No autopsies match the selected failure mode yet.
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 340px), 1fr))',
            gap: '16px',
          }}
        >
          {filtered.map((a) => (
            <article key={a.id} className="card" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
                <span className="badge badge-accent">
                  {UI_STRINGS.autopsies.casePrefix}
                  {String(a.caseNumber).padStart(2, '0')}
                </span>
                <span className="badge" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  <Flame size={12} aria-hidden="true" />
                  {formatFailureModeLabel(a.failureMode)}
                </span>
              </div>

              <h2 style={{ margin: 0, fontSize: '1.15rem', lineHeight: 1.3 }}>
                <Link href={`/autopsies/${a.id}`} style={{ color: 'var(--text)', textDecoration: 'none' }}>
                  {a.title}
                </Link>
              </h2>

              <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                {a.symptom}
              </p>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {a.concepts.map((c) => (
                  <Link
                    key={c.id}
                    href={`/concepts/${c.id}`}
                    className="badge"
                    style={{ textDecoration: 'none', fontSize: '0.72rem' }}
                  >
                    {c.title}
                  </Link>
                ))}
              </div>

              <div
                style={{
                  marginTop: 'auto',
                  paddingTop: '10px',
                  borderTop: '1px solid var(--border)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '8px',
                }}
              >
                <span
                  style={{
                    fontSize: '0.8rem',
                    color: 'var(--text-muted)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  <Clock size={13} aria-hidden="true" />
                  {a.readingTimeMin} {UI_STRINGS.autopsies.readingTimeSuffix}
                </span>

                <Link
                  href={`/autopsies/${a.id}`}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    fontSize: '0.86rem',
                    fontWeight: 600,
                    color: 'var(--accent)',
                    textDecoration: 'none',
                  }}
                >
                  <span>Inspect autopsy</span>
                  <ArrowRight size={14} aria-hidden="true" />
                </Link>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
