import type { ArtifactKind, ProofArtifact } from './artifact-schema';
import {
  ENGINE_IDS,
  type Claim,
  type ClaimStatus,
  type EngineId,
} from './claim-schema';
import type { PageKind, PageRef } from './page-registry';
import type {
  ClaimEngineStatus,
  ClaimResult,
  ProofResults,
} from './results-schema';

export interface ComputeInput {
  claims: Claim[];
  experiments: ProofResults['experiments'];
  experimentMeta: ProofResults['experimentMeta'];
  currentSourceHashes: Map<string, string>;
  currentRuntimeVersion: string;
  currentExpectKeys: Map<string, Set<string>>;
  verifierReports: Map<ArtifactKind, ProofArtifact>;
  freshExperiments: Set<string>;
  previous: ProofResults['claims'];
  now: string;
}

const PROOF_KIND_TO_ARTIFACT: Partial<Record<Claim['proof']['kind'], ArtifactKind>> = {
  'spec-quote': 'spec-quotes',
  'source-quote': 'source-quotes',
  bcd: 'support',
};

function computeDates(
  newStatus: ClaimStatus,
  prev: ClaimResult | undefined,
  now: string,
  checkedAtOverride?: string | null
): { checkedAt: string | null; provenSince: string | null; failingSince: string | null } {
  const checkedAt = checkedAtOverride !== undefined ? checkedAtOverride : now;
  const provenSince =
    newStatus === 'proven'
      ? prev?.status === 'proven' && prev.provenSince
        ? prev.provenSince
        : now
      : null;

  let failingSince: string | null;
  if (newStatus === 'proven') {
    failingSince = null;
  } else if (prev?.status === 'proven' && newStatus !== 'pending') {
    failingSince = now;
  } else if (prev?.failingSince) {
    failingSince = prev.failingSince;
  } else {
    failingSince = null;
  }

  return { checkedAt, provenSince, failingSince };
}

function evaluateExperimentClaim(claim: Claim, input: ComputeInput): ClaimResult {
  if (claim.proof.kind !== 'experiment') {
    throw new Error(`Expected experiment proof for ${claim.id}`);
  }
  const { experimentId, expectKeys } = claim.proof;
  const scopeEngines: EngineId[] = claim.scope?.engines ?? [...ENGINE_IDS];
  const prev = input.previous[claim.id];
  const expCases = input.experiments[experimentId] ?? {};

  const buildEngineStatuses = (): Partial<Record<EngineId, ClaimEngineStatus>> => {
    const out: Partial<Record<EngineId, ClaimEngineStatus>> = {};
    for (const engine of scopeEngines) {
      const keyStatuses = expectKeys.map((k) => expCases[k]?.[engine]?.status);
      if (keyStatuses.some((s) => s === 'fail' || s === 'vacuous')) {
        out[engine] = 'fail';
      } else if (keyStatuses.some((s) => s === 'error')) {
        out[engine] = 'error';
      } else if (keyStatuses.some((s) => s === undefined)) {
        out[engine] = 'missing';
      } else {
        out[engine] = 'pass';
      }
    }
    return out;
  };

  // Rule 2: stale check when experiment was not run in this run and sourceHash/runtimeVersion changed.
  const meta = input.experimentMeta[experimentId];
  const currentHash = input.currentSourceHashes.get(experimentId);
  if (
    !input.freshExperiments.has(experimentId) &&
    meta &&
    ((currentHash !== undefined && meta.sourceHash !== currentHash) ||
      meta.runtimeVersion !== input.currentRuntimeVersion)
  ) {
    const status: ClaimStatus =
      prev?.status === 'proven' || prev?.status === 'stale' ? 'stale' : 'pending';
    const dates =
      status === prev?.status
        ? {
            checkedAt: prev.checkedAt,
            provenSince: prev.provenSince,
            failingSince: prev.failingSince,
          }
        : computeDates(status, prev, input.now, status === 'pending' ? null : input.now);
    return {
      status,
      proofKind: 'experiment',
      engines: buildEngineStatuses(),
      ...dates,
      reason: null,
      detail: 'experiment or runtime changed since last run',
    };
  }

  // Rule 3: unknown expectKey in current bundle.
  const knownKeys = input.currentExpectKeys.get(experimentId);
  if (knownKeys) {
    for (const k of expectKeys) {
      if (!knownKeys.has(k)) {
        const dates = computeDates('failed', prev, input.now);
        return {
          status: 'failed',
          proofKind: 'experiment',
          engines: buildEngineStatuses(),
          ...dates,
          reason: null,
          detail: `unknown expect key "${k}"`,
        };
      }
    }
  }

  // Rules 4 & 5: per-engine status and overall status.
  const engines = buildEngineStatuses();
  const statuses = scopeEngines.map((e) => engines[e]!);
  const hasPass = statuses.includes('pass');
  const hasFail = statuses.includes('fail');
  const allPass = statuses.every((s) => s === 'pass');

  if (hasPass && hasFail) {
    const dates = computeDates('diverges', prev, input.now);
    return {
      status: 'diverges',
      proofKind: 'experiment',
      engines,
      ...dates,
      reason: null,
      detail: null,
    };
  }
  if (allPass) {
    const dates = computeDates('proven', prev, input.now);
    return {
      status: 'proven',
      proofKind: 'experiment',
      engines,
      ...dates,
      reason: null,
      detail: null,
    };
  }
  if (hasFail && !hasPass) {
    const dates = computeDates('failed', prev, input.now);
    return {
      status: 'failed',
      proofKind: 'experiment',
      engines,
      ...dates,
      reason: null,
      detail: null,
    };
  }

  // Only error/missing (no fail): keep previous status if present, else pending.
  const inconclusive = scopeEngines.filter(
    (e) => engines[e] === 'error' || engines[e] === 'missing'
  );
  if (prev) {
    return {
      status: prev.status,
      proofKind: 'experiment',
      engines,
      checkedAt: prev.checkedAt,
      provenSince: prev.provenSince,
      failingSince: prev.failingSince,
      reason: prev.reason,
      detail: `no conclusive result in ${inconclusive.join(', ')}, previous status kept`,
    };
  }
  return {
    status: 'pending',
    proofKind: 'experiment',
    engines,
    checkedAt: null,
    provenSince: null,
    failingSince: null,
    reason: null,
    detail: null,
  };
}

function evaluateVerifierClaim(claim: Claim, input: ComputeInput): ClaimResult {
  const artifactKind = PROOF_KIND_TO_ARTIFACT[claim.proof.kind];
  if (!artifactKind) {
    throw new Error(`Unexpected proof kind "${claim.proof.kind}" for ${claim.id}`);
  }
  const prev = input.previous[claim.id];
  const report = input.verifierReports.get(artifactKind);

  if (report) {
    const entry = report.claims[claim.id];
    if (entry) {
      const dates = computeDates(entry.status, prev, input.now, entry.checkedAt);
      return {
        status: entry.status,
        proofKind: claim.proof.kind,
        engines: null,
        ...dates,
        reason: entry.reason,
        detail: entry.message,
      };
    }
    return {
      status: 'pending',
      proofKind: claim.proof.kind,
      engines: null,
      checkedAt: null,
      provenSince: null,
      failingSince: prev?.failingSince ?? null,
      reason: null,
      detail: `claim not checked by ${artifactKind}`,
    };
  }

  if (prev) {
    return {
      status: prev.status,
      proofKind: claim.proof.kind,
      engines: null,
      checkedAt: prev.checkedAt,
      provenSince: prev.provenSince,
      failingSince: prev.failingSince,
      reason: prev.reason,
      detail: prev.detail,
    };
  }

  return {
    status: 'pending',
    proofKind: claim.proof.kind,
    engines: null,
    checkedAt: null,
    provenSince: null,
    failingSince: null,
    reason: null,
    detail: null,
  };
}

/** Single source of truth for ClaimStatus computation across the runner, aggregator, and nightly. */
export function computeClaimResults(input: ComputeInput): Record<string, ClaimResult> {
  const results: Record<string, ClaimResult> = {};
  const derivedById = new Map<string, Claim>();

  for (const claim of input.claims) {
    if (claim.proof.kind === 'experiment') {
      results[claim.id] = evaluateExperimentClaim(claim, input);
    } else if (claim.proof.kind === 'derived') {
      derivedById.set(claim.id, claim);
    } else {
      results[claim.id] = evaluateVerifierClaim(claim, input);
    }
  }

  const visiting = new Set<string>();
  const resolveDerived = (id: string): ClaimResult => {
    if (results[id]) return results[id];
    const claim = derivedById.get(id);
    if (!claim || claim.proof.kind !== 'derived') {
      return {
        status: 'pending',
        proofKind: 'derived',
        engines: null,
        checkedAt: null,
        provenSince: null,
        failingSince: null,
        reason: null,
        detail: null,
      };
    }
    if (visiting.has(id)) {
      throw new Error(`Cycle detected in derived claims at "${id}"`);
    }
    visiting.add(id);
    const depStatuses = claim.proof.from.map((depId) => resolveDerived(depId).status);
    visiting.delete(id);

    let status: ClaimStatus;
    if (depStatuses.every((s) => s === 'proven')) {
      status = 'proven';
    } else if (depStatuses.includes('failed')) {
      status = 'failed';
    } else if (depStatuses.includes('stale')) {
      status = 'stale';
    } else if (depStatuses.includes('diverges')) {
      status = 'diverges';
    } else {
      status = 'pending';
    }

    const prev = input.previous[id];
    const dates =
      status === 'pending' && !prev
        ? { checkedAt: null, provenSince: null, failingSince: null }
        : status === prev?.status && prev.checkedAt
          ? {
              checkedAt: prev.checkedAt,
              provenSince: prev.provenSince,
              failingSince: prev.failingSince,
            }
          : computeDates(status, prev, input.now);

    const res: ClaimResult = {
      status,
      proofKind: 'derived',
      engines: null,
      ...dates,
      reason: null,
      detail: null,
    };
    results[id] = res;
    return res;
  };

  for (const id of [...derivedById.keys()].sort()) {
    resolveDerived(id);
  }

  return results;
}

/** Sorted ids of a page's own claims followed by foreign claims cited via <C id="other/slug">. */
export function pageClaimIds(
  pageId: string,
  claimsByPage: Map<string, Claim[]>,
  results: ProofResults
): string[] {
  const own = (claimsByPage.get(pageId) ?? []).map((c) => c.id).sort();
  const ownSet = new Set(own);
  const foreign = (results.pages[pageId]?.coverage?.foreignClaimIds ?? [])
    .filter((id) => !ownSet.has(id))
    .sort();
  return [...own, ...foreign];
}

/** File whose proof_status the nightly updates, or null when the page has no modifiable file. */
export function statusFileOf(page: PageRef): string | null {
  if (page.mdxPath) return page.mdxPath;
  return page.kind === 'vs' ? 'content/vs/pairs.json' : null;
}

export interface PageStatusChange {
  pageId: string;
  kind: PageKind;
  file: string;
  claimIds: string[];
}

const MS_PER_DAY = 86_400_000;

function utcDayNumber(iso: string): number {
  const d = new Date(iso);
  return Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / MS_PER_DAY);
}

/** Pages currently `proven` with at least one own or foreign claim failing for >= `days` UTC days. */
export function pagesToDemote(
  pages: PageRef[],
  claimsByPage: Map<string, Claim[]>,
  results: ProofResults,
  now: string,
  days = 7
): PageStatusChange[] {
  const nowDay = utcDayNumber(now);
  const out: PageStatusChange[] = [];

  for (const page of pages) {
    if (page.proofStatus !== 'proven') continue;
    const file = statusFileOf(page);
    if (!file) continue;

    const claimIds = pageClaimIds(page.id, claimsByPage, results).filter((id) => {
      const failingSince = results.claims[id]?.failingSince;
      if (!failingSince) return false;
      return nowDay - utcDayNumber(failingSince) >= days;
    });

    if (claimIds.length > 0) {
      out.push({ pageId: page.id, kind: page.kind, file, claimIds });
    }
  }

  return out.sort((a, b) => a.pageId.localeCompare(b.pageId));
}

/** Pages currently `unverified` in previous.demotedPages whose own and foreign claims are all `proven`. */
export function pagesToPromote(
  pages: PageRef[],
  claimsByPage: Map<string, Claim[]>,
  previous: ProofResults,
  results: ProofResults
): PageStatusChange[] {
  const out: PageStatusChange[] = [];

  for (const page of pages) {
    if (page.proofStatus !== 'unverified') continue;
    const demotedEntry = previous.demotedPages[page.id];
    if (!demotedEntry) continue;
    const file = statusFileOf(page);
    if (!file) continue;

    const allIds = pageClaimIds(page.id, claimsByPage, results);
    if (allIds.length === 0) continue;
    if (allIds.every((id) => results.claims[id]?.status === 'proven')) {
      out.push({
        pageId: page.id,
        kind: page.kind,
        file,
        claimIds: [...demotedEntry.claimIds],
      });
    }
  }

  return out.sort((a, b) => a.pageId.localeCompare(b.pageId));
}

/** Next registry of nightly-demoted pages (`ProofResults['demotedPages']`). */
export function nextDemotedPages(
  previous: ProofResults,
  pages: PageRef[],
  demoted: PageStatusChange[],
  promoted: PageStatusChange[],
  now: string
): ProofResults['demotedPages'] {
  const pageById = new Map(pages.map((p) => [p.id, p]));
  const demotedSet = new Set(demoted.map((d) => d.pageId));
  const promotedSet = new Set(promoted.map((p) => p.pageId));

  const next: ProofResults['demotedPages'] = {};

  for (const [pageId, entry] of Object.entries(previous.demotedPages)) {
    const page = pageById.get(pageId);
    if (!page) continue; // page removed
    if (promotedSet.has(pageId)) continue; // promoted back
    if (page.proofStatus === 'proven' && !demotedSet.has(pageId)) continue; // restored outside nightly
    next[pageId] = { since: entry.since, claimIds: [...entry.claimIds] };
  }

  for (const d of demoted) {
    if (!next[d.pageId]) {
      next[d.pageId] = { since: now, claimIds: [...d.claimIds] };
    }
  }

  return next;
}
