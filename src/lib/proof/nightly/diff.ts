import {
  ENGINE_IDS,
  splitClaimId,
  type ClaimStatus,
  type EngineId,
} from '../claim-schema';
import type { Json } from '../define-experiment';
import type { ClaimEngineStatus, ProofResults } from '../results-schema';

export interface NightlyStatusChange {
  claimId: string;
  pageId: string;
  from: ClaimStatus | null;
  to: ClaimStatus;
}

export interface NightlyRegression {
  claimId: string;
  pageId: string;
  from: ClaimStatus;
  to: 'failed' | 'diverges' | 'stale';
  engines: Partial<Record<EngineId, 'pass' | 'fail'>> | null;
  detail: string | null;
}

export interface NightlyRecovery {
  claimId: string;
  pageId: string;
  from: ClaimStatus;
  to: 'proven';
}

export interface NightlyObservedChange {
  experimentId: string;
  expectKey: string;
  engine: EngineId;
  before: Json;
  after: Json;
}

export interface NightlyDiff {
  at: string;
  statusChanged: NightlyStatusChange[];
  regressions: NightlyRegression[];
  recoveries: NightlyRecovery[];
  engineVersionsChanged: Partial<Record<EngineId, { from: string; to: string }>>;
  observedChanged: NightlyObservedChange[];
  infraErrors: string[];
}

function canonicalizeJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return '[' + value.map(canonicalizeJson).join(',') + ']';
  }
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
    a.localeCompare(b)
  );
  return '{' + entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalizeJson(v)}`).join(',') + '}';
}

function extractPassFailEngines(
  engines: Partial<Record<EngineId, ClaimEngineStatus>> | null
): Partial<Record<EngineId, 'pass' | 'fail'>> | null {
  if (!engines) return null;
  const out: Partial<Record<EngineId, 'pass' | 'fail'>> = {};
  let hasAny = false;
  for (const engine of ENGINE_IDS) {
    const v = engines[engine];
    if (v === 'pass' || v === 'fail') {
      out[engine] = v;
      hasAny = true;
    }
  }
  return hasAny ? out : null;
}

/**
 * Pure deterministic diff between previous and next ProofResults.
 * Computes no statuses: compares only what the aggregator already produced.
 */
export function diffProofResults(
  previous: ProofResults | null,
  next: ProofResults,
  now: Date,
  infraErrors: string[] = []
): NightlyDiff {
  const statusChanged: NightlyStatusChange[] = [];
  const regressions: NightlyRegression[] = [];
  const recoveries: NightlyRecovery[] = [];

  for (const claimId of Object.keys(next.claims).sort((a, b) => a.localeCompare(b))) {
    const nextClaim = next.claims[claimId];
    const prevClaim = previous?.claims[claimId];
    const from: ClaimStatus | null = prevClaim ? prevClaim.status : null;
    const to: ClaimStatus = nextClaim.status;
    if (from === to) continue;

    const { pageId } = splitClaimId(claimId);
    statusChanged.push({ claimId, pageId, from, to });

    if (from === 'proven' && (to === 'failed' || to === 'diverges' || to === 'stale')) {
      regressions.push({
        claimId,
        pageId,
        from,
        to,
        engines: extractPassFailEngines(nextClaim.engines),
        detail: nextClaim.detail ?? nextClaim.reason ?? null,
      });
    } else if (
      from !== null &&
      from !== 'proven' &&
      from !== 'pending' &&
      to === 'proven'
    ) {
      recoveries.push({
        claimId,
        pageId,
        from,
        to: 'proven',
      });
    }
  }

  const engineVersionsChanged: Partial<Record<EngineId, { from: string; to: string }>> = {};
  for (const engine of ENGINE_IDS) {
    const prevVersion = previous?.engines[engine];
    const nextVersion = next.engines[engine];
    if (prevVersion && nextVersion && prevVersion !== nextVersion) {
      engineVersionsChanged[engine] = { from: prevVersion, to: nextVersion };
    }
  }

  const observedChanged: NightlyObservedChange[] = [];
  for (const experimentId of Object.keys(next.experiments).sort((a, b) => a.localeCompare(b))) {
    const prevExp = previous?.experiments[experimentId];
    if (!prevExp) continue;
    const nextExp = next.experiments[experimentId];
    for (const expectKey of Object.keys(nextExp).sort((a, b) => a.localeCompare(b))) {
      const prevCases = prevExp[expectKey];
      if (!prevCases) continue;
      const nextCases = nextExp[expectKey];
      for (const engine of ENGINE_IDS) {
        const prevCase = prevCases[engine];
        const nextCase = nextCases[engine];
        if (!prevCase || !nextCase) continue;
        if (canonicalizeJson(prevCase.observed) !== canonicalizeJson(nextCase.observed)) {
          observedChanged.push({
            experimentId,
            expectKey,
            engine,
            before: prevCase.observed as Json,
            after: nextCase.observed as Json,
          });
        }
      }
    }
  }

  return {
    at: now.toISOString(),
    statusChanged,
    regressions,
    recoveries,
    engineVersionsChanged,
    observedChanged,
    infraErrors: [...infraErrors],
  };
}
