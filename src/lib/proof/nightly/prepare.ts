import fs from 'node:fs';
import { readProofArtifact, writeProofArtifact } from '../artifact-io';
import type { ProofArtifact } from '../artifact-schema';
import { ENGINE_IDS, type EngineId } from '../claim-schema';
import {
  ExperimentRunReportSchema,
  type ExperimentRunReport,
  type ProofResults,
} from '../results-schema';

const CASE_INFRA_ERROR_RE = /Target closed|browser has been closed|net::ERR_/i;
const VERIFIER_INFRA_RE =
  /HTTP\s+5\d\d|ETIMEDOUT|ECONNRESET|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|timed out|timeout/i;
const VERIFIER_INFRA_REASONS = new Set(['unavailable', 'network-error', 'timeout']);

export interface PrepareRunReportResult {
  report: ExperimentRunReport;
  infraErrors: string[];
}

export interface PrepareVerifierResult {
  artifact: ProofArtifact;
  infraErrors: string[];
}

/**
 * Strips cases and vacuity entries affected by infrastructure failures (missing
 * engine, browser crash, network timeout) so the aggregator preserves previous
 * statuses instead of treating outages as regressions.
 */
export function filterInfraErrors(
  report: ExperimentRunReport,
  expectedEngines?: readonly EngineId[]
): PrepareRunReportResult {
  const infraErrors: string[] = [];
  const missingEngines = new Set<EngineId>();

  if (expectedEngines) {
    for (const engine of expectedEngines) {
      if (!report.engines[engine]) {
        missingEngines.add(engine);
        infraErrors.push(`engine ${engine} missing from experiment run report`);
      }
    }
  }

  const experiments: ExperimentRunReport['experiments'] = {};
  for (const [expId, entry] of Object.entries(report.experiments)) {
    const vacuity: typeof entry.vacuity = {};
    for (const engine of ENGINE_IDS) {
      if (missingEngines.has(engine)) continue;
      if (entry.vacuity[engine]) {
        vacuity[engine] = { ...entry.vacuity[engine]! };
      }
    }

    const cases: typeof entry.cases = {};
    for (const [expectKey, engineMap] of Object.entries(entry.cases)) {
      const nextEngineMap: typeof engineMap = {};
      for (const engine of ENGINE_IDS) {
        if (missingEngines.has(engine)) continue;
        const caseRes = engineMap[engine];
        if (!caseRes) continue;
        if (
          caseRes.status === 'error' &&
          typeof caseRes.error === 'string' &&
          CASE_INFRA_ERROR_RE.test(caseRes.error)
        ) {
          infraErrors.push(`experiment ${expId}/${expectKey} (${engine}): ${caseRes.error}`);
          continue;
        }
        nextEngineMap[engine] = caseRes;
      }
      cases[expectKey] = nextEngineMap;
    }

    experiments[expId] = {
      ...entry,
      vacuity,
      cases,
    };
  }

  return {
    report: {
      ...report,
      engines: { ...report.engines },
      runner: { ...report.runner },
      experiments,
    },
    infraErrors,
  };
}

/**
 * Normalizes a verifier artifact before aggregation:
 * - removes claims that failed due to transient network/server errors (HTTP >= 500, timeout)
 *   so the aggregator preserves their previous status;
 * - downgrades `stale` to `failed` when the claim was never `proven` or `stale` before.
 */
export function downgradeNeverProvenStale(
  artifact: ProofArtifact,
  previous: ProofResults | null
): PrepareVerifierResult {
  const infraErrors: string[] = [];
  const claims: ProofArtifact['claims'] = {};

  for (const [claimId, entry] of Object.entries(artifact.claims)) {
    const detailsStatus =
      typeof entry.details?.status === 'number' ? entry.details.status : null;
    const isNetworkError =
      entry.status !== 'proven' &&
      ((entry.reason !== null && VERIFIER_INFRA_REASONS.has(entry.reason)) ||
        (detailsStatus !== null && detailsStatus >= 500) ||
        (typeof entry.message === 'string' && VERIFIER_INFRA_RE.test(entry.message)));

    if (isNetworkError) {
      infraErrors.push(
        `verifier ${artifact.kind} ${claimId}: ${entry.message ?? entry.reason ?? 'network error'}`
      );
      continue;
    }

    if (entry.status === 'stale') {
      const prevStatus = previous?.claims[claimId]?.status ?? null;
      if (prevStatus !== 'proven' && prevStatus !== 'stale') {
        claims[claimId] = {
          ...entry,
          status: 'failed',
        };
        continue;
      }
    }

    claims[claimId] = entry;
  }

  return {
    artifact: {
      ...artifact,
      claims,
    },
    infraErrors,
  };
}

function unavailableSidecarPath(filePath: string): string {
  return filePath.endsWith('.json')
    ? `${filePath.slice(0, -'.json'.length)}.unavailable.json`
    : `${filePath}.unavailable.json`;
}

export function prepareRunReport(
  filePath: string,
  expectedEngines?: readonly EngineId[]
): { present: boolean; infraErrors: string[] } {
  if (!fs.existsSync(filePath)) {
    return { present: false, infraErrors: [] };
  }
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as unknown;
  const parsed = ExperimentRunReportSchema.parse(raw);
  const { report, infraErrors } = filterInfraErrors(parsed, expectedEngines);
  fs.writeFileSync(filePath, JSON.stringify(report, null, 2) + '\n');
  return { present: true, infraErrors };
}

export function prepareVerifierArtifact(
  filePath: string,
  previous: ProofResults | null
): { present: boolean; infraErrors: string[] } {
  const infraErrors: string[] = [];

  const sidecar = unavailableSidecarPath(filePath);
  if (fs.existsSync(sidecar)) {
    try {
      const entries = JSON.parse(fs.readFileSync(sidecar, 'utf-8')) as unknown;
      if (Array.isArray(entries)) {
        for (const item of entries) {
          if (item && typeof item === 'object') {
            const rec = item as Record<string, unknown>;
            const claimId = typeof rec.claimId === 'string' ? rec.claimId : 'unknown';
            const err = typeof rec.error === 'string' ? rec.error : 'unavailable';
            infraErrors.push(`unavailable ${claimId}: ${err}`);
          }
        }
      }
    } catch {
      infraErrors.push(`invalid unavailable sidecar: ${sidecar}`);
    }
  }

  if (!fs.existsSync(filePath)) {
    return { present: false, infraErrors };
  }

  const artifact = readProofArtifact(filePath);
  const { artifact: prepared, infraErrors: artifactErrors } = downgradeNeverProvenStale(
    artifact,
    previous
  );
  writeProofArtifact(prepared, filePath);
  return { present: true, infraErrors: [...infraErrors, ...artifactErrors] };
}
