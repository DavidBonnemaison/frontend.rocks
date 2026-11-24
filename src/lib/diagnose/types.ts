export type DiagnoseSeverity = 'critical' | 'warning' | 'info';

export type DiagnoseInputFormat = 'chrome-trace' | 'har';

export type DetectorId =
  | 'long-tasks'
  | 'forced-reflow'
  | 'paint-compositor'
  | 'gc-pauses'
  | 'request-waterfall'
  | 'cache-miss'
  | 'duplicate-mutations';

export interface PrescriptionLink {
  type: 'concept' | 'symptom' | 'autopsy';
  slug: string;
  title: string;
  href: string;
}

export interface DiagnoseFinding {
  id: string;
  detector: DetectorId;
  title: string;
  severity: DiagnoseSeverity;
  occurrences: number;
  worstDurationMs: number;
  totalDurationMs?: number;
  metricLabel: string;
  explanation: string;
  evidence: string[];
  prescriptions: PrescriptionLink[];
}

export interface DiagnoseSummary {
  format: DiagnoseInputFormat;
  fileName: string;
  fileSizeBytes: number;
  parseTimeMs: number;
  totalEventsAnalyzed: number;
  findings: DiagnoseFinding[];
}

export interface DiagnoseWorkerRequest {
  id: string;
  fileName: string;
  rawText: string;
  fileSizeBytes: number;
}

export type DiagnoseWorkerResponse =
  | {
      id: string;
      ok: true;
      result: DiagnoseSummary;
    }
  | {
      id: string;
      ok: false;
      error: string;
    };

export const MAX_DIAGNOSE_FILE_BYTES = 50 * 1024 * 1024; // 50 MB
