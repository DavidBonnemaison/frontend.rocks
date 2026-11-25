'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { ExperimentBundle } from '@/lib/proof/experiment-schema';
import {
  notRunnableReason,
  resolveParams,
  runExperimentInBrowser,
  type BrowserRunReport,
  type ParamValues,
} from '@/lib/proof/runtime';
import { ExperimentFrame, type FrameState } from '@/components/proof/ExperimentFrame';

function mapObservedStatus(state: FrameState | null): 'pending' | 'ok' | 'error' | 'not-runnable' {
  if (!state || state.status === 'waiting-visible' || state.status === 'running') return 'pending';
  if (state.status === 'ok') return 'ok';
  if (state.status === 'not-runnable') return 'not-runnable';
  return 'error';
}

function formatObserved(state: FrameState | null): string {
  if (!state || state.status === 'waiting-visible' || state.status === 'running') {
    return 'Pending...';
  }
  if (state.status === 'not-runnable') {
    return `Not runnable in browser (${state.reason ?? 'unsupported'})`;
  }
  if (state.result && state.result.ok) {
    return JSON.stringify(state.result.value, null, 2);
  }
  if (state.result && !state.result.ok) {
    return `Error: ${state.result.error}`;
  }
  return `Error: ${state.reason ?? 'unknown error'}`;
}

function ParamControl({
  name,
  def,
  value,
  onChange,
}: {
  name: string;
  def: ExperimentBundle['params'][string];
  value: number | boolean | string;
  onChange: (next: number | boolean | string) => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  // Listen to native input/change events so programmatic DOM event dispatches update state too.
  useEffect(() => {
    const el = inputRef.current;
    if (!el || def.kind !== 'range') return;
    const handleNative = () => {
      const parsed = Number(el.value);
      if (Number.isFinite(parsed)) onChangeRef.current(parsed);
    };
    el.addEventListener('input', handleNative);
    el.addEventListener('change', handleNative);
    return () => {
      el.removeEventListener('input', handleNative);
      el.removeEventListener('change', handleNative);
    };
  }, [def.kind]);

  if (def.kind === 'range') {
    return (
      <label style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <span>
          {def.label}: {String(value)}
          {def.unit ?? ''}
        </span>
        <input
          ref={inputRef}
          type="range"
          data-testid={`experiment-param-${name}`}
          min={def.min}
          max={def.max}
          step={def.step}
          value={Number(value)}
          onChange={(e) => onChange(Number(e.target.value))}
        />
      </label>
    );
  }

  if (def.kind === 'toggle') {
    return (
      <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
        <input
          type="checkbox"
          data-testid={`experiment-param-${name}`}
          checked={Boolean(value)}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span>{def.label}</span>
      </label>
    );
  }

  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      <span>{def.label}</span>
      <select
        data-testid={`experiment-param-${name}`}
        value={String(value)}
        onChange={(e) => onChange(e.target.value)}
      >
        {def.options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    </label>
  );
}

export function AtelierView({ bundle }: { bundle: ExperimentBundle }) {
  const [params, setParams] = useState<ParamValues>(() => resolveParams(bundle));
  const [treatmentState, setTreatmentState] = useState<FrameState | null>(null);
  const [controlState, setControlState] = useState<FrameState | null>(null);
  const [runningAll, setRunningAll] = useState(false);
  const [report, setReport] = useState<BrowserRunReport | null>(null);
  const runHostRef = useRef<HTMLDivElement | null>(null);

  const handleParamChange = useCallback((name: string, next: number | boolean | string) => {
    setParams((prev) => (prev[name] === next ? prev : { ...prev, [name]: next }));
  }, []);

  const handleRunAll = useCallback(async () => {
    if (runningAll) return;
    setRunningAll(true);
    setReport(null);
    try {
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => resolve());
      });
      const host = runHostRef.current;
      if (!host) return;
      const next = await runExperimentInBrowser(bundle, { host });
      setReport(next);
    } finally {
      setRunningAll(false);
    }
  }, [bundle, runningAll]);

  const paramEntries = Object.entries(bundle.params);
  const expectEntries = Object.entries(bundle.expect);
  const staticNotRunnable =
    notRunnableReason(bundle) ?? (bundle.host === 'origin' ? 'host-origin' : null);

  return (
    <main style={{ maxWidth: '1200px', margin: '0 auto', padding: '24px 16px' }}>
      <header style={{ marginBottom: '20px' }}>
        <p style={{ fontSize: '12px', opacity: 0.7, marginBottom: '4px' }}>
          Internal Experiment Atelier · {bundle.id} ({bundle.kind})
        </p>
        <h1 style={{ fontSize: '24px', fontWeight: 700, marginBottom: '8px' }}>{bundle.title}</h1>
        <p style={{ fontSize: '16px', margin: 0 }}>{bundle.question}</p>
      </header>

      {paramEntries.length > 0 && (
        <section style={{ marginBottom: '20px', display: 'flex', flexWrap: 'wrap', gap: '16px' }}>
          {paramEntries.map(([name, def]) => (
            <ParamControl
              key={name}
              name={name}
              def={def}
              value={params[name]}
              onChange={(next) => handleParamChange(name, next)}
            />
          ))}
        </section>
      )}

      <style>{`
        .atelier-frames {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 16px;
          margin-bottom: 24px;
        }
        @media (max-width: 719px) {
          .atelier-frames {
            grid-template-columns: 1fr;
          }
        }
      `}</style>

      <section className="atelier-frames">
        <div>
          <h2 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '8px' }}>
            Treatment — {bundle.variants.treatment.label}
          </h2>
          <div style={{ border: '1px solid #cbd5e1', background: '#ffffff' }}>
            <ExperimentFrame
              bundle={bundle}
              variant="treatment"
              params={params}
              onState={setTreatmentState}
            />
          </div>
          <pre
            data-testid="experiment-observed-treatment"
            data-status={mapObservedStatus(treatmentState)}
            style={{
              marginTop: '8px',
              padding: '10px',
              fontSize: '12px',
              overflowX: 'auto',
              border: '1px solid #cbd5e1',
            }}
          >
            {formatObserved(treatmentState)}
          </pre>
        </div>

        <div>
          <h2 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '8px' }}>
            Control — {bundle.variants.control.label}
          </h2>
          <div style={{ border: '1px solid #cbd5e1', background: '#ffffff' }}>
            <ExperimentFrame
              bundle={bundle}
              variant="control"
              params={params}
              onState={setControlState}
            />
          </div>
          <pre
            data-testid="experiment-observed-control"
            data-status={mapObservedStatus(controlState)}
            style={{
              marginTop: '8px',
              padding: '10px',
              fontSize: '12px',
              overflowX: 'auto',
              border: '1px solid #cbd5e1',
            }}
          >
            {formatObserved(controlState)}
          </pre>
        </div>
      </section>

      <section style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: 600, margin: 0 }}>Expected cases</h2>
          <button
            type="button"
            data-testid="atelier-run-all"
            data-status={staticNotRunnable ? 'not-runnable' : report ? report.status : 'idle'}
            disabled={runningAll}
            onClick={() => void handleRunAll()}
            style={{ padding: '6px 12px', border: '1px solid currentColor', cursor: 'pointer' }}
          >
            {runningAll ? 'Running...' : 'Run all cases in browser'}
          </button>
        </div>

        {report && report.status !== 'ran' && (
          <p data-testid="atelier-run-all-status" data-status={report.status}>
            Status: {report.status} ({report.reason ?? 'unknown'})
          </p>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {expectEntries.map(([key, expectCase]) => {
            const evaluation = report?.cases[key];
            return (
              <div
                key={key}
                data-testid={`atelier-case-${key}`}
                data-status={evaluation ? evaluation.status : 'idle'}
                style={{ padding: '10px', border: '1px solid #cbd5e1', fontSize: '13px' }}
              >
                <div style={{ fontWeight: 600, marginBottom: '4px' }}>
                  {key} {evaluation ? `[${evaluation.status}]` : ''}
                </div>
                {expectCase.params && (
                  <div>
                    <strong>params:</strong> <code>{JSON.stringify(expectCase.params)}</code>
                  </div>
                )}
                <div>
                  <strong>expected treatment:</strong>{' '}
                  <code>{JSON.stringify(expectCase.treatment)}</code>
                </div>
                <div>
                  <strong>expected control:</strong>{' '}
                  <code>{JSON.stringify(expectCase.control)}</code>
                </div>
                {evaluation && (
                  <div>
                    <strong>observed:</strong>{' '}
                    <code>{JSON.stringify(evaluation.observed)}</code>
                    {evaluation.error ? ` (${evaluation.error})` : ''}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Visible runner host kept inside the viewport while runExperimentInBrowser executes. */}
        {runningAll && (
          <div
            style={{
              position: 'fixed',
              bottom: '16px',
              right: '16px',
              width: '320px',
              height: '200px',
              overflow: 'hidden',
              background: '#ffffff',
              border: '1px solid #cbd5e1',
              zIndex: 50,
            }}
          >
            <div
              ref={runHostRef}
              style={{
                width: `${bundle.viewport.width}px`,
                height: `${bundle.viewport.height}px`,
                transform: `scale(${Math.min(1, 320 / bundle.viewport.width)})`,
                transformOrigin: '0 0',
              }}
            />
          </div>
        )}
      </section>
    </main>
  );
}
