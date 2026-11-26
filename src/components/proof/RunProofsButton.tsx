'use client';

import React, { useRef, useState } from 'react';
import { track } from '@/lib/analytics';
import type { BrowserProofItem } from '@/lib/proof/browser-proof-payload';
import { detectBrowser, formatDetectedBrowser, type UaData } from '@/lib/proof/detect-browser';
import type { ExperimentBundle } from '@/lib/proof/experiment-schema';
import type { BrowserRunReport, NotRunnableReason } from '@/lib/proof/runtime/browser';
import './proof.css';

const EXPERIMENT_TIMEOUT_MS = 10_000;
const STAGE_WIDTH = 320;
const STAGE_HEIGHT = 200;

export type LocalOutcome = 'pass' | 'fail' | 'unconfirmed' | 'ci-only';

export interface ItemRunState {
  claimId: string;
  slug: string;
  outcome: LocalOutcome;
  message: string;
}

export function countRunnableItems(items: readonly BrowserProofItem[]): number {
  return items.filter((item) => item.notRunnable === null).length;
}

export function notRunnableMessage(
  reason: NotRunnableReason,
  ciRatio: number | null
): string {
  switch (reason) {
    case 'measured':
      return ciRatio !== null
        ? `Runs in CI only (timing is measured in CI, ratio ${ciRatio.toFixed(2)}×)`
        : 'Runs in CI only (timing is measured in CI)';
    case 'input':
      return 'Runs in CI only (needs real user input)';
    case 'emulation':
      return 'Runs in CI only (needs device emulation)';
    case 'network-server':
      return 'Runs in CI only (needs a test server)';
    case 'engine-console':
      return 'Runs in CI only (reads engine console output)';
    case 'host-origin':
      return 'Runs in CI only (needs isolated lab origin)';
  }
}

async function waitForVisible(): Promise<void> {
  if (typeof document === 'undefined' || document.visibilityState !== 'hidden') return;
  await new Promise<void>((resolve) => {
    const onChange = () => {
      if (document.visibilityState !== 'hidden') {
        document.removeEventListener('visibilitychange', onChange);
        resolve();
      }
    };
    document.addEventListener('visibilitychange', onChange);
  });
}

function updatePanelRowCell(slug: string, outcome: LocalOutcome, label: string): void {
  if (typeof document === 'undefined') return;
  const row = document.getElementById(`claim-${slug}`);
  if (!row) return;
  row.setAttribute('data-local', outcome);

  const table = row.closest('table');
  if (table) {
    const headerRow = table.querySelector('thead tr');
    if (headerRow && !headerRow.querySelector('[data-local-header="true"]')) {
      const th = document.createElement('th');
      th.setAttribute('scope', 'col');
      th.setAttribute('data-local-header', 'true');
      th.textContent = 'Your browser';
      headerRow.appendChild(th);
    }
  }

  let cell = row.querySelector<HTMLTableCellElement>('[data-local-cell="true"]');
  if (!cell) {
    cell = document.createElement('td');
    cell.setAttribute('data-local-cell', 'true');
    cell.className = 'proof-engine-cell';
    row.appendChild(cell);
  }
  cell.setAttribute('data-local', outcome);
  cell.textContent = label;
}

export interface RunProofsButtonProps {
  items: BrowserProofItem[];
  bundles?: Record<string, ExperimentBundle> | null;
  label?: string;
}

export function RunProofsButton({
  items,
  bundles = null,
  label = "Don't take our word for it: run these proofs in your browser",
}: RunProofsButtonProps) {
  const [running, setRunning] = useState(false);
  const [liveStatus, setLiveStatus] = useState('');
  const [summaryText, setSummaryText] = useState<string | null>(null);
  const [results, setResults] = useState<ItemRunState[]>([]);
  const [activeViewport, setActiveViewport] = useState<{ width: number; height: number } | null>(
    null
  );
  const stageRef = useRef<HTMLDivElement | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);

  const runnableCount = countRunnableItems(items);
  if (runnableCount === 0) return null;

  const resolveBundle = async (
    experimentId: string,
    cache: Map<string, ExperimentBundle>
  ): Promise<ExperimentBundle> => {
    const cached = cache.get(experimentId) ?? bundles?.[experimentId];
    if (cached) {
      cache.set(experimentId, cached);
      return cached;
    }
    const res = await fetch(`/experiments/${experimentId}.json`);
    if (!res.ok) {
      throw new Error(`Failed to fetch experiment bundle "${experimentId}" (${res.status})`);
    }
    const parsed = (await res.json()) as ExperimentBundle;
    cache.set(experimentId, parsed);
    return parsed;
  };

  const handleClick = async () => {
    if (running) return;
    setRunning(true);
    setSummaryText(null);
    setResults([]);
    setLiveStatus(`0 of ${runnableCount} checked`);

    const nav = navigator as Navigator & { userAgentData?: UaData };
    const detected = detectBrowser(navigator.userAgent, nav.userAgentData);
    const bundleCache = new Map<string, ExperimentBundle>();
    const expReports = new Map<string, { report?: BrowserRunReport; error?: string }>();
    const nextResults: ItemRunState[] = [];
    let checked = 0;
    let passed = 0;

    try {
      const rt = await import('@/lib/proof/runtime/browser');

      // Ensure the visible test bench is mounted and scrolled into view before running.
      setActiveViewport({ width: 1280, height: 800 });
      await new Promise((r) => setTimeout(r, 0));
      stageRef.current?.scrollIntoView({ block: 'nearest' });

      for (const item of items) {
        if (item.notRunnable !== null) {
          const msg = notRunnableMessage(item.notRunnable, item.ciRatio);
          nextResults.push({
            claimId: item.claimId,
            slug: item.slug,
            outcome: 'ci-only',
            message: msg,
          });
          updatePanelRowCell(item.slug, 'ci-only', 'Runs in CI only');
          setResults([...nextResults]);
          continue;
        }

        await waitForVisible();

        let entry = expReports.get(item.experimentId);
        if (!entry) {
          try {
            const bundle = await resolveBundle(item.experimentId, bundleCache);
            setActiveViewport(bundle.viewport);
            await new Promise((r) => setTimeout(r, 0));
            const host = hostRef.current;
            if (!host) throw new Error('Test stage not mounted');

            const controller = new AbortController();
            const timeoutPromise = new Promise<never>((_, reject) => {
              setTimeout(() => {
                controller.abort();
                reject(new Error('Experiment timed out after 10s'));
              }, EXPERIMENT_TIMEOUT_MS);
            });

            const report = await Promise.race([
              rt.runExperimentInBrowser(bundle, { host, signal: controller.signal }),
              timeoutPromise,
            ]);
            entry = { report };
          } catch (err) {
            entry = { error: err instanceof Error ? err.message : String(err) };
          }
          expReports.set(item.experimentId, entry);
        }

        checked += 1;
        let outcome: LocalOutcome;
        let message: string;
        if (entry.error) {
          outcome = 'fail';
          message = entry.error;
        } else if (entry.report?.status === 'blocked') {
          outcome = 'unconfirmed';
          message = 'Blocked by browser storage or sandbox policy';
        } else if (entry.report?.status === 'ran') {
          const allPass = item.expectKeys.every(
            (key) => entry.report!.cases[key]?.status === 'pass'
          );
          if (allPass) {
            outcome = 'pass';
            message = 'Confirmed in your browser';
            passed += 1;
          } else {
            outcome = 'fail';
            message = 'Observation did not match expected result';
          }
        } else {
          outcome = 'unconfirmed';
          message = 'Could not run in this browser';
        }

        nextResults.push({ claimId: item.claimId, slug: item.slug, outcome, message });
        updatePanelRowCell(
          item.slug,
          outcome,
          outcome === 'pass' ? 'pass' : outcome === 'fail' ? 'fail' : 'unconfirmed'
        );
        setResults([...nextResults]);
        setLiveStatus(`${checked} of ${runnableCount} checked`);
      }

      const browserStr = formatDetectedBrowser(detected);
      const finalLine = `${passed}/${runnableCount} confirmed in your browser (${browserStr})`;
      setSummaryText(finalLine);
      setLiveStatus(finalLine);

      track('proof_run_in_browser', undefined, {
        engine: detected.engine.toLowerCase(),
        outcome: passed === runnableCount ? 'all-confirmed' : 'some-failed',
      });
    } finally {
      setActiveViewport(null);
      setRunning(false);
    }
  };

  const scale = activeViewport
    ? Math.min(STAGE_WIDTH / activeViewport.width, STAGE_HEIGHT / activeViewport.height, 1)
    : 1;

  return (
    <div className="run-proofs-box">
      <div className="run-proofs-actions">
        <button
          id="run-proofs"
          type="button"
          className="run-proofs-button"
          data-testid="run-proofs-button"
          disabled={running}
          onClick={() => void handleClick()}
        >
          {running ? 'Running proofs in your browser…' : label}
        </button>
        <span className="run-proofs-live" aria-live="polite" role="status">
          {liveStatus}
        </span>
      </div>

      {activeViewport && (
        <div className="run-proofs-stage" ref={stageRef} aria-label="In-browser proof test bench">
          <div
            ref={hostRef}
            className="run-proofs-stage-inner"
            style={{
              width: `${activeViewport.width}px`,
              height: `${activeViewport.height}px`,
              transform: `scale(${scale})`,
            }}
          />
        </div>
      )}

      {summaryText && (
        <div className="run-proofs-result" data-testid="run-proofs-result">
          {summaryText}
        </div>
      )}

      {results.length > 0 && (
        <ul className="run-proofs-details">
          {results.map((r) => (
            <li key={r.claimId} data-local={r.outcome}>
              <code>{r.slug}</code>
              <span>{r.message}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
