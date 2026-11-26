import fs from 'node:fs';
import path from 'node:path';

export interface NightlyRunRecord {
  at: string;
  durationMs: number;
  infraErrors: number;
}

export interface NightlyHealthReport {
  runsCount: number;
  lastRunAt: string | null;
  ageHours: number | null;
  medianDurationMs: number | null;
  maxDurationMs: number | null;
  stale: boolean;
  aboveDurationBudget: boolean;
}

export const HEALTH_WINDOW_DAYS = 30;
export const STALE_RUN_HOURS = 48;
export const DURATION_BUDGET_MS = 12 * 60_000;

/**
 * Reads `kind: "run"` lines from JSONL history files under `historyDir` within the
 * last `windowDays` UTC days relative to `now`.
 */
export function readRecentRunRecords(
  dir: string,
  now: Date,
  windowDays = HEALTH_WINDOW_DAYS
): NightlyRunRecord[] {
  if (!fs.existsSync(dir)) return [];

  const cutoffMs = now.getTime() - windowDays * 86_400_000;
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.jsonl'))
    .sort();

  const records: NightlyRunRecord[] = [];
  for (const file of files) {
    const content = fs.readFileSync(path.join(dir, file), 'utf-8');
    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line) continue;
      let parsed: unknown;
      try {
        parsed = JSON.parse(line);
      } catch {
        continue;
      }
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) continue;
      const rec = parsed as Record<string, unknown>;
      if (rec.kind !== 'run' && rec.type !== 'run') continue;
      if (typeof rec.at !== 'string') continue;
      const ts = Date.parse(rec.at);
      if (Number.isNaN(ts) || ts < cutoffMs) continue;
      const durationMs =
        typeof rec.durationMs === 'number' && Number.isFinite(rec.durationMs) && rec.durationMs >= 0
          ? rec.durationMs
          : 0;
      const infraErrors =
        typeof rec.infraErrors === 'number' && Number.isFinite(rec.infraErrors)
          ? rec.infraErrors
          : 0;
      records.push({ at: rec.at, durationMs, infraErrors });
    }
  }

  records.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  return records;
}

export function computeMedian(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid];
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

export function evaluateNightlyHealth(
  records: readonly NightlyRunRecord[],
  now: Date
): NightlyHealthReport {
  if (records.length === 0) {
    return {
      runsCount: 0,
      lastRunAt: null,
      ageHours: null,
      medianDurationMs: null,
      maxDurationMs: null,
      stale: true,
      aboveDurationBudget: false,
    };
  }

  const ordered = [...records].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const last = ordered[ordered.length - 1];
  const ageHours = (now.getTime() - Date.parse(last.at)) / 3_600_000;
  const durations = ordered.map((r) => r.durationMs);
  const medianDurationMs = computeMedian(durations);
  const maxDurationMs = Math.max(...durations);

  return {
    runsCount: ordered.length,
    lastRunAt: last.at,
    ageHours,
    medianDurationMs,
    maxDurationMs,
    stale: ageHours > STALE_RUN_HOURS,
    aboveDurationBudget: medianDurationMs !== null && medianDurationMs > DURATION_BUDGET_MS,
  };
}
