'use client';

import React, { useCallback, useRef, useState } from 'react';
import type { ExperimentBundle } from '@/lib/proof/experiment-schema';
import {
  notRunnableReason,
  runExperimentInBrowser,
  type BrowserRunReport,
} from '@/lib/proof/runtime';

export function AtelierRunAll({ bundle }: { bundle: ExperimentBundle }) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [running, setRunning] = useState(false);
  const [report, setReport] = useState<BrowserRunReport | null>(null);
  const reason = notRunnableReason(bundle);

  const handleRunAll = useCallback(async () => {
    const host = hostRef.current;
    if (!host || running) return;
    setRunning(true);
    try {
      const next = await runExperimentInBrowser(bundle, { host });
      setReport(next);
    } finally {
      setRunning(false);
    }
  }, [bundle, running]);

  return (
    <section style={{ marginTop: '1.5rem' }} aria-label="Browser proof runner">
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
        <button
          type="button"
          className="experiment-btn"
          data-testid="atelier-run-all"
          disabled={running || reason !== null}
          onClick={() => void handleRunAll()}
        >
          {running ? 'Running all cases…' : 'Run all expect cases in your browser'}
        </button>
        {reason ? (
          <span style={{ fontSize: '0.85rem', color: 'var(--color-ink-muted, #6b6860)' }}>
            Not runnable in browser ({reason})
          </span>
        ) : null}
      </div>

      {report ? (
        <ul style={{ marginTop: '0.75rem', paddingLeft: '1.25rem' }}>
          {Object.entries(report.cases).map(([key, c]) => (
            <li key={key} data-testid={`atelier-case-${key}`} data-status={c.status}>
              <code>{key}</code>: <strong>{c.status}</strong>
              {c.error ? ` — ${c.error}` : ''}
            </li>
          ))}
        </ul>
      ) : null}

      <div
        ref={hostRef}
        aria-hidden="true"
        style={
          running
            ? {
                position: 'fixed',
                right: '16px',
                bottom: '16px',
                width: '320px',
                height: '200px',
                opacity: 0.01,
                pointerEvents: 'none',
                overflow: 'hidden',
              }
            : { display: 'none' }
        }
      />
    </section>
  );
}
