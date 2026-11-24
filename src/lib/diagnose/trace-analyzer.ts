import { DETECTOR_PRESCRIPTIONS } from './prescriptions';
import type { DiagnoseFinding } from './types';

export interface ChromeTraceStackFrame {
  functionName?: string;
  url?: string;
  lineNumber?: number;
  columnNumber?: number;
}

export interface ChromeTraceEvent {
  name?: string;
  cat?: string;
  ph?: string;
  ts?: number;
  dur?: number;
  pid?: number;
  tid?: number;
  args?: {
    beginData?: {
      stackTrace?: ChromeTraceStackFrame[];
      dirtyObjects?: number;
      totalObjects?: number;
    };
    data?: {
      stackTrace?: ChromeTraceStackFrame[];
      type?: string;
      usedHeapSizeBefore?: number;
      usedHeapSizeAfter?: number;
    };
    endData?: {
      layoutRoots?: unknown[];
    };
  };
}

export interface ChromeTracePayload {
  traceEvents: ChromeTraceEvent[];
}

const LONG_TASK_WARN_MS = 50;
const LONG_TASK_CRITICAL_MS = 200;
const FRAME_BUDGET_MS = 16.6;
const PAINT_CRITICAL_MS = 33.2;
const GC_PAUSE_WARN_MS = 20;
const GC_PAUSE_CRITICAL_MS = 50;
const GC_FREQUENT_COUNT = 5;

function roundMs(value: number): number {
  return Math.round(value * 10) / 10;
}

function formatStackFrame(frame?: ChromeTraceStackFrame): string | null {
  if (!frame) return null;
  const fn = frame.functionName || '(anonymous)';
  if (!frame.url) return fn;
  const shortUrl = frame.url.split('/').pop() || frame.url;
  const line = typeof frame.lineNumber === 'number' ? `:${frame.lineNumber}` : '';
  return `${fn} (${shortUrl}${line})`;
}

export function extractTraceEvents(parsed: unknown): ChromeTraceEvent[] | null {
  if (Array.isArray(parsed)) {
    return parsed as ChromeTraceEvent[];
  }
  if (
    parsed &&
    typeof parsed === 'object' &&
    'traceEvents' in parsed &&
    Array.isArray((parsed as ChromeTracePayload).traceEvents)
  ) {
    return (parsed as ChromeTracePayload).traceEvents;
  }
  return null;
}

export function analyzeChromeTrace(events: ChromeTraceEvent[]): DiagnoseFinding[] {
  const findings: DiagnoseFinding[] = [];

  // 1. Long Tasks & INP (RunTask > 50 ms, > 200 ms critical)
  const longTasks: { durMs: number; name: string }[] = [];
  // 2. Forced Synchronous Reflows (UpdateLayoutTree / Layout with synchronous stackTrace)
  const forcedReflows: { durMs: number; name: string; frame: string }[] = [];
  // 3. Paint / Compositor Overhead (Paint / CompositeLayers > 16.6 ms)
  const heavyPaints: { durMs: number; name: string }[] = [];
  // 4. GC Pauses (MajorGC / MinorGC)
  const gcEvents: { durMs: number; name: string }[] = [];

  for (const event of events) {
    if (!event || typeof event.name !== 'string') continue;
    const durUs = typeof event.dur === 'number' && Number.isFinite(event.dur) ? event.dur : 0;
    const durMs = durUs / 1000;

    if (event.name === 'RunTask' || event.name === 'ThreadControllerImpl::RunTask') {
      if (durMs > LONG_TASK_WARN_MS) {
        longTasks.push({ durMs, name: event.name });
      }
    }

    if (event.name === 'UpdateLayoutTree' || event.name === 'Layout') {
      const stackTrace =
        event.args?.beginData?.stackTrace ?? event.args?.data?.stackTrace ?? undefined;
      if (Array.isArray(stackTrace) && stackTrace.length > 0) {
        const topFrame = formatStackFrame(stackTrace[0]) ?? 'synchronous script call';
        forcedReflows.push({ durMs, name: event.name, frame: topFrame });
      }
    }

    if (event.name === 'Paint' || event.name === 'CompositeLayers') {
      if (durMs > FRAME_BUDGET_MS) {
        heavyPaints.push({ durMs, name: event.name });
      }
    }

    if (
      event.name === 'MajorGC' ||
      event.name === 'MinorGC' ||
      event.name === 'V8.GCCompactor' ||
      event.name === 'V8.GCScavenger'
    ) {
      if (durMs > 0) {
        gcEvents.push({ durMs, name: event.name });
      }
    }
  }

  if (longTasks.length > 0) {
    longTasks.sort((a, b) => b.durMs - a.durMs);
    const worst = roundMs(longTasks[0].durMs);
    const total = roundMs(longTasks.reduce((sum, t) => sum + t.durMs, 0));
    const criticalCount = longTasks.filter((t) => t.durMs > LONG_TASK_CRITICAL_MS).length;

    findings.push({
      id: 'trace-long-tasks',
      detector: 'long-tasks',
      title: 'Long Tasks Blocking Main Thread & INP',
      severity: worst > LONG_TASK_CRITICAL_MS ? 'critical' : 'warning',
      occurrences: longTasks.length,
      worstDurationMs: worst,
      totalDurationMs: total,
      metricLabel: `Worst task: ${worst} ms · ${longTasks.length} task${longTasks.length === 1 ? '' : 's'} > 50 ms${criticalCount > 0 ? ` (${criticalCount} > 200 ms)` : ''}`,
      explanation:
        'A single RunTask macrotask exceeded the 50 ms Long Task threshold. While JavaScript occupies the main thread, Blink cannot process input events, run rAF callbacks, or commit a new frame—directly degrading Interaction to Next Paint (INP).',
      evidence: longTasks
        .slice(0, 3)
        .map((t) => `${t.name}: ${roundMs(t.durMs)} ms`),
      prescriptions: DETECTOR_PRESCRIPTIONS['long-tasks'],
    });
  }

  if (forcedReflows.length >= 2 || forcedReflows.some((r) => r.durMs > FRAME_BUDGET_MS)) {
    forcedReflows.sort((a, b) => b.durMs - a.durMs);
    const worst = roundMs(forcedReflows[0].durMs);
    const total = roundMs(forcedReflows.reduce((sum, r) => sum + r.durMs, 0));

    findings.push({
      id: 'trace-forced-reflow',
      detector: 'forced-reflow',
      title: 'Forced Synchronous Reflows (Layout Thrashing)',
      severity: forcedReflows.length >= 5 || worst > 30 ? 'critical' : 'warning',
      occurrences: forcedReflows.length,
      worstDurationMs: worst,
      totalDurationMs: total,
      metricLabel: `${forcedReflows.length} forced reflow${forcedReflows.length === 1 ? '' : 's'} · Worst: ${worst} ms (Total: ${total} ms)`,
      explanation:
        'JavaScript queried layout geometry (such as offsetHeight or getBoundingClientRect) immediately after mutating styles or DOM nodes, forcing Blink to synchronously flush style recalculation and layout before the frame boundary.',
      evidence: forcedReflows
        .slice(0, 3)
        .map((r) => `${r.name} (${roundMs(r.durMs)} ms) ← ${r.frame}`),
      prescriptions: DETECTOR_PRESCRIPTIONS['forced-reflow'],
    });
  }

  if (heavyPaints.length > 0) {
    heavyPaints.sort((a, b) => b.durMs - a.durMs);
    const worst = roundMs(heavyPaints[0].durMs);
    const total = roundMs(heavyPaints.reduce((sum, p) => sum + p.durMs, 0));

    findings.push({
      id: 'trace-paint-compositor',
      detector: 'paint-compositor',
      title: 'Paint & Compositor Frame Budget Overflow',
      severity: worst > PAINT_CRITICAL_MS ? 'critical' : 'warning',
      occurrences: heavyPaints.length,
      worstDurationMs: worst,
      totalDurationMs: total,
      metricLabel: `Worst ${heavyPaints[0].name}: ${worst} ms · ${heavyPaints.length} event${heavyPaints.length === 1 ? '' : 's'} > 16.6 ms`,
      explanation:
        'Paint or CompositeLayers work exceeded the 16.6 ms 60 FPS frame budget. Large invalidated paint regions, expensive filters/shadows, or excessive GPU layer promotion stall frame commits and cause scroll jank.',
      evidence: heavyPaints
        .slice(0, 3)
        .map((p) => `${p.name}: ${roundMs(p.durMs)} ms`),
      prescriptions: DETECTOR_PRESCRIPTIONS['paint-compositor'],
    });
  }

  const worstGc = gcEvents.reduce((max, g) => Math.max(max, g.durMs), 0);
  const totalGc = gcEvents.reduce((sum, g) => sum + g.durMs, 0);
  if (worstGc > GC_PAUSE_WARN_MS || gcEvents.length >= GC_FREQUENT_COUNT) {
    gcEvents.sort((a, b) => b.durMs - a.durMs);
    const worst = roundMs(worstGc);
    const total = roundMs(totalGc);

    findings.push({
      id: 'trace-gc-pauses',
      detector: 'gc-pauses',
      title: 'Garbage Collection Pauses & Heap Pressure',
      severity: worst > GC_PAUSE_CRITICAL_MS || total > 100 ? 'critical' : 'warning',
      occurrences: gcEvents.length,
      worstDurationMs: worst,
      totalDurationMs: total,
      metricLabel: `${gcEvents.length} GC pause${gcEvents.length === 1 ? '' : 's'} · Worst: ${worst} ms (Total: ${total} ms)`,
      explanation:
        'V8 stop-the-world MajorGC or frequent MinorGC cycles paused main-thread execution. High allocation churn or retained detached DOM subtrees force repeated mark-sweep-compact passes that drop frames.',
      evidence: gcEvents
        .slice(0, 3)
        .map((g) => `${g.name}: ${roundMs(g.durMs)} ms`),
      prescriptions: DETECTOR_PRESCRIPTIONS['gc-pauses'],
    });
  }

  return findings;
}
