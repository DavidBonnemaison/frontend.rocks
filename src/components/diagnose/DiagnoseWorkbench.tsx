'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  FileJson,
  Lock,
  Upload,
} from 'lucide-react';
import { DEMO_TRACES, type DemoTracePreset } from '@/lib/diagnose/demo-traces';
import {
  MAX_DIAGNOSE_FILE_BYTES,
  type DiagnoseSummary,
  type DiagnoseWorkerRequest,
  type DiagnoseWorkerResponse,
} from '@/lib/diagnose/types';
import './DiagnoseWorkbench.css';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function DiagnoseWorkbench() {
  const workerRef = useRef<Worker | null>(null);
  const requestIdRef = useRef(0);

  const [isDragging, setIsDragging] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [activePresetId, setActivePresetId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<DiagnoseSummary | null>(null);

  useEffect(() => {
    return () => {
      if (workerRef.current) {
        workerRef.current.terminate();
        workerRef.current = null;
      }
    };
  }, []);

  const getWorker = useCallback(() => {
    if (!workerRef.current) {
      workerRef.current = new Worker(
        new URL('../../lib/diagnose/worker.ts', import.meta.url)
      );
    }
    return workerRef.current;
  }, []);

  const runAnalysis = useCallback(
    (rawText: string, fileName: string, fileSizeBytes: number) => {
      if (fileSizeBytes > MAX_DIAGNOSE_FILE_BYTES) {
        setError(
          `File exceeds the 50 MB local analysis limit (${formatBytes(fileSizeBytes)}).`
        );
        setSummary(null);
        return;
      }

      setError(null);
      setIsAnalyzing(true);

      const worker = getWorker();
      const id = `diag-${++requestIdRef.current}`;

      const handleMessage = (event: MessageEvent<DiagnoseWorkerResponse>) => {
        if (event.data.id !== id) return;
        worker.removeEventListener('message', handleMessage);
        worker.removeEventListener('error', handleError);
        setIsAnalyzing(false);

        if (event.data.ok) {
          setSummary(event.data.result);
        } else {
          setSummary(null);
          setError(event.data.error);
        }
      };

      const handleError = (err: ErrorEvent) => {
        worker.removeEventListener('message', handleMessage);
        worker.removeEventListener('error', handleError);
        setIsAnalyzing(false);
        setSummary(null);
        setError(err.message || 'Web Worker failed while analyzing the file.');
      };

      worker.addEventListener('message', handleMessage);
      worker.addEventListener('error', handleError);

      const payload: DiagnoseWorkerRequest = {
        id,
        fileName,
        rawText,
        fileSizeBytes,
      };
      worker.postMessage(payload);
    },
    [getWorker]
  );

  const handleFile = useCallback(
    async (file: File) => {
      setActivePresetId(null);
      if (file.size > MAX_DIAGNOSE_FILE_BYTES) {
        setError(
          `File exceeds the 50 MB local analysis limit (${formatBytes(file.size)}).`
        );
        setSummary(null);
        return;
      }
      try {
        const text = await file.text();
        runAnalysis(text, file.name, file.size);
      } catch {
        setError('Could not read the selected file.');
      }
    },
    [runAnalysis]
  );

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      void handleFile(file);
    }
    event.target.value = '';
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) {
      void handleFile(file);
    }
  };

  const handleDemoClick = (preset: DemoTracePreset) => {
    setActivePresetId(preset.id);
    const bytes = new TextEncoder().encode(preset.payload).byteLength;
    runAnalysis(preset.payload, preset.fileName, bytes);
  };

  return (
    <div className="diagnose-page">
      <header className="diagnose-header">
        <div className="concept-meta">
          <span className="badge">
            <Activity size={12} style={{ marginRight: '6px', flexShrink: 0 }} aria-hidden="true" />
            Client-Side Trace &amp; HAR Analyzer
          </span>
        </div>
        <h1 className="diagnose-title">Diagnose Chrome Traces &amp; HAR Files</h1>
        <p className="diagnose-subtitle">
          Drop a Chrome DevTools Performance trace (<code>.json</code>) or Network export (
          <code>.har</code>) to detect main-thread bottlenecks, forced reflows, paint overflows, GC
          pauses, and network waterfalls—mapped directly to mechanical root causes.
        </p>
      </header>

      <div className="diagnose-privacy-banner" role="status">
        <Lock size={16} aria-hidden="true" />
        <span>Runs 100% locally in a Web Worker. Zero bytes leave your browser.</span>
      </div>

      <div
        className={`diagnose-dropzone${isDragging ? ' diagnose-dropzone-active' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
      >
        <input
          id="diagnose-file-upload"
          type="file"
          accept=".json,.har,application/json"
          className="diagnose-file-input"
          aria-label="Upload Chrome DevTools trace JSON or HAR file"
          onChange={handleInputChange}
        />
        <Upload size={26} aria-hidden="true" />
        <span className="diagnose-dropzone-title">
          Drop a <code>.json</code> trace or <code>.har</code> file here, or click to browse
        </span>
        <span className="diagnose-dropzone-hint">
          Supports Chrome DevTools Performance traces &amp; HTTP Archive files up to 50 MB
        </span>
      </div>

      <section className="diagnose-demos" aria-labelledby="demo-traces-heading">
        <h2 id="demo-traces-heading" className="diagnose-section-label">
          Or test instantly with an embedded demo trace (1 click)
        </h2>
        <div className="diagnose-demo-grid">
          {DEMO_TRACES.map((preset) => (
            <button
              key={preset.id}
              type="button"
              data-demo-id={preset.id}
              className={`diagnose-demo-btn${activePresetId === preset.id ? ' diagnose-demo-btn-active' : ''}`}
              onClick={() => handleDemoClick(preset)}
            >
              <span className="diagnose-demo-badge">{preset.badge}</span>
              <span className="diagnose-demo-title">{preset.title}</span>
              <span className="diagnose-demo-desc">{preset.description}</span>
            </button>
          ))}
        </div>
      </section>

      {isAnalyzing && (
        <div className="diagnose-status" role="status" aria-live="polite">
          Analyzing trace inside Dedicated Web Worker…
        </div>
      )}

      {error && (
        <div className="diagnose-error" role="alert">
          {error}
        </div>
      )}

      {summary && !isAnalyzing && (
        <section className="diagnose-results" aria-labelledby="diagnose-results-heading">
          <h2 id="diagnose-results-heading" className="diagnose-section-label">
            Diagnostic Prescriptions
          </h2>

          <div className="diagnose-summary-bar">
            <div className="diagnose-summary-meta">
              <span>
                <FileJson size={14} style={{ verticalAlign: '-2px', marginRight: '5px' }} aria-hidden="true" />
                <strong>{summary.fileName}</strong>
              </span>
              <span>
                Format: <strong>{summary.format === 'har' ? 'HAR' : 'Chrome Trace'}</strong>
              </span>
              <span>
                Size: <strong>{formatBytes(summary.fileSizeBytes)}</strong>
              </span>
              <span>
                Analyzed: <strong>{summary.totalEventsAnalyzed.toLocaleString()}</strong>{' '}
                {summary.format === 'har' ? 'requests' : 'events'}
              </span>
              <span>
                Worker time: <strong>{summary.parseTimeMs} ms</strong>
              </span>
            </div>
            <span className="badge">
              {summary.findings.length}{' '}
              {summary.findings.length === 1 ? 'finding' : 'findings'}
            </span>
          </div>

          {summary.findings.length === 0 ? (
            <div className="diagnose-clean-card">
              <CheckCircle2 size={18} style={{ verticalAlign: '-3px', marginRight: '8px' }} aria-hidden="true" />
              <strong>No critical bottlenecks detected</strong> in this file across our deterministic
              trace and network detectors.
            </div>
          ) : (
            <div className="diagnose-findings-list">
              {summary.findings.map((finding) => (
                <article
                  key={finding.id}
                  className="diagnose-finding-card"
                  data-detector={finding.detector}
                >
                  <div className="diagnose-finding-top">
                    <span className={`diagnose-severity diagnose-severity-${finding.severity}`}>
                      <AlertTriangle size={13} aria-hidden="true" />
                      {finding.severity}
                    </span>
                    <span className="diagnose-metric">{finding.metricLabel}</span>
                  </div>

                  <h3 className="diagnose-finding-title">{finding.title}</h3>
                  <p className="diagnose-finding-explanation">{finding.explanation}</p>

                  {finding.evidence.length > 0 && (
                    <ul className="diagnose-evidence-list" aria-label="Measured evidence">
                      {finding.evidence.map((line, i) => (
                        <li key={`${finding.id}-ev-${i}`}>{line}</li>
                      ))}
                    </ul>
                  )}

                  <div className="diagnose-prescriptions-heading">
                    Prescribed Mechanical Reading
                  </div>
                  <div className="diagnose-prescriptions">
                    {finding.prescriptions.map((item) => (
                      <Link
                        key={`${finding.id}-${item.type}-${item.slug}`}
                        href={item.href}
                        className="diagnose-prescription-link"
                      >
                        <span className="diagnose-prescription-type">{item.type}</span>
                        <span>{item.title}</span>
                        <ArrowUpRight size={14} aria-hidden="true" />
                      </Link>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
