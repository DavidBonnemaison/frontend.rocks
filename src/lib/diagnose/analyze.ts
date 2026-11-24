import { analyzeHar, extractHarEntries } from './har-analyzer';
import { analyzeChromeTrace, extractTraceEvents } from './trace-analyzer';
import {
  MAX_DIAGNOSE_FILE_BYTES,
  type DiagnoseFinding,
  type DiagnoseSeverity,
  type DiagnoseSummary,
} from './types';

const SEVERITY_RANK: Record<DiagnoseSeverity, number> = {
  critical: 0,
  warning: 1,
  info: 2,
};

function sortFindings(findings: DiagnoseFinding[]): DiagnoseFinding[] {
  return [...findings].sort((a, b) => {
    const sevDiff = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    if (sevDiff !== 0) return sevDiff;
    return b.worstDurationMs - a.worstDurationMs;
  });
}

export function analyzeDiagnosticPayload(
  rawText: string,
  fileName: string,
  fileSizeBytes?: number
): DiagnoseSummary {
  const actualBytes = fileSizeBytes ?? new TextEncoder().encode(rawText).byteLength;
  if (actualBytes > MAX_DIAGNOSE_FILE_BYTES) {
    throw new Error(
      `File exceeds the 50 MB local analysis limit (${(actualBytes / (1024 * 1024)).toFixed(1)} MB).`
    );
  }

  const start = typeof performance !== 'undefined' ? performance.now() : Date.now();
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    throw new Error(
      'Invalid JSON file. Upload a Chrome DevTools Performance trace (.json) or an HTTP Archive (.har).'
    );
  }

  const harEntries = extractHarEntries(parsed);
  if (harEntries) {
    const findings = sortFindings(analyzeHar(harEntries));
    const end = typeof performance !== 'undefined' ? performance.now() : Date.now();
    return {
      format: 'har',
      fileName,
      fileSizeBytes: actualBytes,
      parseTimeMs: Math.max(0.1, Math.round((end - start) * 10) / 10),
      totalEventsAnalyzed: harEntries.length,
      findings,
    };
  }

  const traceEvents = extractTraceEvents(parsed);
  if (traceEvents) {
    const findings = sortFindings(analyzeChromeTrace(traceEvents));
    const end = typeof performance !== 'undefined' ? performance.now() : Date.now();
    return {
      format: 'chrome-trace',
      fileName,
      fileSizeBytes: actualBytes,
      parseTimeMs: Math.max(0.1, Math.round((end - start) * 10) / 10),
      totalEventsAnalyzed: traceEvents.length,
      findings,
    };
  }

  throw new Error(
    'Unrecognized file structure. Expected a Chrome DevTools trace ({ "traceEvents": [...] } or [...]) or a HAR file ({ "log": { "entries": [...] } }).'
  );
}
