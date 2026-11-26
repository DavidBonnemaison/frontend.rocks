import fs from 'node:fs';
import path from 'node:path';
import { CONTENT_DIR } from '../paths';
import { CLAIM_STATUSES, ENGINE_IDS, type ClaimStatus, type EngineId } from './claim-schema';

export interface ClaimStatusChange {
  at: string;
  from: ClaimStatus | null;
  to: ClaimStatus;
  engines?: Partial<Record<EngineId, 'pass' | 'fail'>>;
}

export interface GlobalHistoryPoint {
  at: string;
  proven: number;
  total: number;
}

const VALID_STATUSES = new Set<string>(CLAIM_STATUSES);
const MAX_HISTORY_FILES = 12;

export function historyDir(): string {
  return process.env.FR_PROOF_HISTORY_DIR ?? path.join(CONTENT_DIR, '.proof-results', 'history');
}

function listRecentHistoryFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.jsonl'))
    .sort();
  return files.slice(-MAX_HISTORY_FILES).map((f) => path.join(dir, f));
}

function parseEngines(raw: unknown): Partial<Record<EngineId, 'pass' | 'fail'>> | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const out: Partial<Record<EngineId, 'pass' | 'fail'>> = {};
  let hasAny = false;
  for (const engine of ENGINE_IDS) {
    const v = (raw as Record<string, unknown>)[engine];
    if (v === 'pass' || v === 'fail') {
      out[engine] = v;
      hasAny = true;
    }
  }
  return hasAny ? out : undefined;
}

interface RawClaimObservation {
  at: string;
  status: ClaimStatus;
  engines?: Partial<Record<EngineId, 'pass' | 'fail'>>;
}

function extractClaimObservation(
  record: Record<string, unknown>,
  claimId: string
): RawClaimObservation | null {
  const at = typeof record.at === 'string' ? record.at : typeof record.generatedAt === 'string' ? record.generatedAt : null;
  if (!at) return null;

  // Format 1: per-claim line { claimId, status, at, engines? } or { id, status, at }
  const lineId =
    typeof record.claimId === 'string'
      ? record.claimId
      : typeof record.id === 'string'
        ? record.id
        : null;
  if (lineId === claimId && typeof record.status === 'string' && VALID_STATUSES.has(record.status)) {
    return {
      at,
      status: record.status as ClaimStatus,
      engines: parseEngines(record.engines),
    };
  }

  // Format 2: run line with nested claims map { type: 'run', at, claims: { [claimId]: { status, engines? } | status } }
  if (record.claims && typeof record.claims === 'object' && !Array.isArray(record.claims)) {
    const entry = (record.claims as Record<string, unknown>)[claimId];
    if (typeof entry === 'string' && VALID_STATUSES.has(entry)) {
      return { at, status: entry as ClaimStatus };
    }
    if (entry && typeof entry === 'object') {
      const status = (entry as Record<string, unknown>).status;
      if (typeof status === 'string' && VALID_STATUSES.has(status)) {
        return {
          at,
          status: status as ClaimStatus,
          engines: parseEngines((entry as Record<string, unknown>).engines),
        };
      }
    }
  }

  return null;
}

/**
 * Reads up to the last 12 monthly JSONL files in `content/.proof-results/history/`,
 * filters observations for `claimId`, reduces to status transitions, and returns
 * at most `limit` changes ordered most-recent-first.
 */
export function getClaimHistory(
  claimId: string,
  limit = 20,
  dir: string = historyDir()
): ClaimStatusChange[] {
  const files = listRecentHistoryFiles(dir);
  const observations: RawClaimObservation[] = [];

  for (const filePath of files) {
    const lines = fs.readFileSync(filePath, 'utf-8').split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      let parsed: unknown;
      try {
        parsed = JSON.parse(line);
      } catch {
        console.warn(`[proof:history] Skipping invalid JSON line in ${path.basename(filePath)}:${i + 1}`);
        continue;
      }
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) continue;
      const obs = extractClaimObservation(parsed as Record<string, unknown>, claimId);
      if (obs) observations.push(obs);
    }
  }

  observations.sort((a, b) => a.at.localeCompare(b.at));

  const changes: ClaimStatusChange[] = [];
  let prevStatus: ClaimStatus | null = null;
  for (const obs of observations) {
    if (obs.status !== prevStatus) {
      changes.push({
        at: obs.at,
        from: prevStatus,
        to: obs.status,
        ...(obs.engines ? { engines: obs.engines } : {}),
      });
      prevStatus = obs.status;
    }
  }

  return changes.reverse().slice(0, limit);
}

/**
 * Reads `run` lines from `content/.proof-results/history/*.jsonl` for the `/proof`
 * global trend chart, returning up to `maxPoints` chronological points.
 */
export function getGlobalRunHistory(
  maxPoints = 90,
  dir: string = historyDir()
): GlobalHistoryPoint[] {
  const files = listRecentHistoryFiles(dir);
  const points: GlobalHistoryPoint[] = [];

  for (const filePath of files) {
    const lines = fs.readFileSync(filePath, 'utf-8').split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      let parsed: unknown;
      try {
        parsed = JSON.parse(line);
      } catch {
        console.warn(`[proof:history] Skipping invalid JSON line in ${path.basename(filePath)}:${i + 1}`);
        continue;
      }
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) continue;
      const rec = parsed as Record<string, unknown>;
      if (rec.type !== 'run') continue;
      const at = typeof rec.at === 'string' ? rec.at : typeof rec.generatedAt === 'string' ? rec.generatedAt : null;
      if (!at) continue;

      let proven: number | null = null;
      let total: number | null = null;

      if (typeof rec.proven === 'number') {
        proven = rec.proven;
      } else if (rec.byStatus && typeof rec.byStatus === 'object') {
        const bs = rec.byStatus as Record<string, unknown>;
        if (typeof bs.proven === 'number') proven = bs.proven;
      } else if (rec.counts && typeof rec.counts === 'object') {
        const counts = rec.counts as Record<string, unknown>;
        if (typeof counts.proven === 'number') proven = counts.proven;
      }

      if (typeof rec.total === 'number') {
        total = rec.total;
      } else if (rec.byStatus && typeof rec.byStatus === 'object') {
        const vals = Object.values(rec.byStatus as Record<string, unknown>).filter(
          (v): v is number => typeof v === 'number'
        );
        if (vals.length > 0) total = vals.reduce((a, b) => a + b, 0);
      }

      if (proven !== null) {
        points.push({ at, proven, total: total ?? proven });
      }
    }
  }

  points.sort((a, b) => a.at.localeCompare(b.at));
  return points.slice(-maxPoints);
}
