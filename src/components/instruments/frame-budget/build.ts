import type { MeasuredSummary } from '../types';
import type { FrameSample } from './schema';

export interface MeasuredBar {
  role: 'primary' | 'secondary';
  label: string;
  median: number;
  n: number;
  slower: boolean;
  pct: number;
}

export interface MeasuredDescription {
  bars: [MeasuredBar, MeasuredBar];
  slowerLabel: string;
  factor: number;
  factorText: string;
  headline: string;
  announce: string;
  meta: string;
}

function formatMs(val: number): string {
  return val >= 10 ? `${Math.round(val)} ms` : `${val.toFixed(1)} ms`;
}

function formatPValue(p: number): string {
  if (p < 0.001) return 'p < 0.001';
  return `p = ${p.toFixed(3)}`;
}

/**
 * Pure summary of MeasuredSummary. Reads which variant has the larger median
 * instead of assuming the direction of summary.ratio.
 */
export function describeMeasured(
  summary: MeasuredSummary,
  labels: { primary: string; secondary?: string },
): MeasuredDescription {
  const primaryLabel = labels.primary;
  const secondaryLabel = labels.secondary ?? 'Control';
  const tMed = summary.treatment.median;
  const cMed = summary.control.median;
  const treatmentSlower = tMed >= cMed;

  const slowerVal = treatmentSlower ? tMed : cMed;
  const fasterVal = treatmentSlower ? cMed : tMed;
  const rawFactor = fasterVal > 0 ? slowerVal / fasterVal : Math.abs(summary.ratio);
  const factor = Number(rawFactor.toFixed(1));
  const factorText = `${factor.toFixed(1)}×`;

  const maxMed = Math.max(tMed, cMed, 0.001);
  const bars: [MeasuredBar, MeasuredBar] = [
    {
      role: 'primary',
      label: primaryLabel,
      median: tMed,
      n: summary.treatment.n,
      slower: treatmentSlower,
      pct: Math.max(2, (tMed / maxMed) * 100),
    },
    {
      role: 'secondary',
      label: secondaryLabel,
      median: cMed,
      n: summary.control.n,
      slower: !treatmentSlower,
      pct: Math.max(2, (cMed / maxMed) * 100),
    },
  ];

  const slowerLabel = treatmentSlower ? primaryLabel : secondaryLabel;
  const runCount = Math.min(summary.treatment.n, summary.control.n);
  const headline = `${slowerLabel}: ${factorText} slower (${formatMs(slowerVal)} vs ${formatMs(fasterVal)})`;
  const announce = `${slowerLabel}: ${factor.toFixed(1)} times slower (median of ${runCount} runs).`;
  const meta = `n = ${summary.treatment.n} / ${summary.control.n} · ratio ${summary.ratio.toFixed(2)} · ${formatPValue(summary.pValue)}`;

  return {
    bars,
    slowerLabel,
    factor,
    factorText,
    headline,
    announce,
    meta,
  };
}

export interface FrameInterval {
  index: number;
  start: number;
  end: number;
  duration: number;
  dropped: boolean;
}

export interface FrameStats {
  sufficient: boolean;
  refreshMs: number | null;
  droppedCount: number;
  intervals: FrameInterval[];
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid];
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Computes observed display frame rhythm (median interval) and dropped frames (> 1.5x refreshMs).
 * Never hardcodes 16.6 ms. Requires at least 10 frames.
 */
export function computeFrameStats(frames: FrameSample[]): FrameStats {
  if (frames.length < 10) {
    return {
      sufficient: false,
      refreshMs: null,
      droppedCount: 0,
      intervals: [],
    };
  }

  const rawDurations = frames.map((f) => Math.max(0, f.end - f.start));
  const refreshMs = Number(median(rawDurations).toFixed(1));
  const threshold = refreshMs * 1.5;

  let droppedCount = 0;
  const intervals: FrameInterval[] = frames.map((f, index) => {
    const duration = Math.max(0, f.end - f.start);
    const dropped = refreshMs > 0 && duration > threshold;
    if (dropped) droppedCount += 1;
    return {
      index,
      start: f.start,
      end: f.end,
      duration,
      dropped,
    };
  });

  return {
    sufficient: true,
    refreshMs,
    droppedCount,
    intervals,
  };
}
