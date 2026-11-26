import { ENGINE_IDS, type Claim, type EngineId } from './claim-schema';
import type { ExperimentRunReport, ProofResults } from './results-schema';

export interface GatePageRef {
  id: string;
  kind: string;
  proofStatus: 'unverified' | 'proven';
  mdxPath: string | null;
}

export interface GateInput {
  pages: GatePageRef[];
  claimsByPage: Map<string, Claim[]>;
  preview: ProofResults;
  baseline: ProofResults;
  baselineClaimsByPage: Map<string, Claim[]>;
  baselineProofStatus: Map<string, 'proven' | 'unverified' | null>;
  runReports: ExperimentRunReport[];
  changedFiles: Set<string> | 'all';
}

export interface GateOutcome {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

export type ClaimTouchReason = 'definition' | 'page' | 'experiment' | 'promotion';

function sortKeysDeep(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(value as Record<string, unknown>).sort()) {
    out[k] = sortKeysDeep((value as Record<string, unknown>)[k]);
  }
  return out;
}

function canonicalClaim(claim: Claim): string {
  return JSON.stringify(sortKeysDeep(claim));
}

function hasProofEngineChange(changedFiles: Set<string>): boolean {
  for (const f of changedFiles) {
    if (f.startsWith('src/lib/proof/') || f.startsWith('scripts/proof/')) return true;
  }
  return false;
}

function hasExperimentDirChange(changedFiles: Set<string>, experimentId: string): boolean {
  const prefix = `content/experiments/${experimentId}/`;
  for (const f of changedFiles) {
    if (f.startsWith(prefix)) return true;
  }
  return false;
}

/** Returns which touch conditions (a)-(d) apply to a claim; empty array if untouched. */
export function claimTouches(
  pageId: string,
  claim: Claim,
  input: GateInput
): ClaimTouchReason[] {
  if (input.changedFiles === 'all') return ['definition'];

  const reasons: ClaimTouchReason[] = [];
  const changed = input.changedFiles;
  const page = input.pages.find((p) => p.id === pageId);

  // (a) definition: claims file changed AND this claim entry was added or modified.
  const claimsFile = `content/claims/${pageId}.claims.json`;
  if (changed.has(claimsFile)) {
    const baselineClaims = input.baselineClaimsByPage.get(pageId) ?? [];
    const baselineClaim = baselineClaims.find((c) => c.id === claim.id);
    if (!baselineClaim || canonicalClaim(claim) !== canonicalClaim(baselineClaim)) {
      reasons.push('definition');
    }
  }

  // (b) page: MDX file of the page changed.
  if (page?.mdxPath && changed.has(page.mdxPath)) {
    reasons.push('page');
  }

  // (c) experiment: experiment proof only, when experiment folder changed OR proof engine changed on a baseline-proven claim.
  if (claim.proof.kind === 'experiment') {
    const expChanged = hasExperimentDirChange(changed, claim.proof.experimentId);
    const engineChangedOnProven =
      hasProofEngineChange(changed) && input.baseline.claims[claim.id]?.status === 'proven';
    if (expChanged || engineChangedOnProven) {
      reasons.push('experiment');
    }
  }

  // (d) promotion: page is proven on HEAD and was not proven on base (unverified or absent).
  if (page?.proofStatus === 'proven' && input.baselineProofStatus.get(pageId) !== 'proven') {
    reasons.push('promotion');
  }

  return reasons;
}

/** Pure PR proof gate evaluator. */
export function evaluateGate(input: GateInput): GateOutcome {
  const errors: string[] = [];
  const warnings: string[] = [];

  const provenPages = input.pages.filter((p) => p.proofStatus === 'proven');

  // Rule 1: claims of proven pages.
  for (const page of provenPages) {
    const pageClaims = input.claimsByPage.get(page.id) ?? [];
    for (const claim of pageClaims) {
      const res = input.preview.claims[claim.id];
      const status = res?.status ?? 'pending';
      if (status === 'proven') continue;

      const detail = res?.detail ?? res?.reason ?? 'not proven';
      const msg = `[${page.kind} ${page.id}] claim ${claim.id} is ${status}: ${detail}`;
      const touches = claimTouches(page.id, claim, input);
      const hardTouch =
        touches.includes('definition') ||
        touches.includes('experiment') ||
        touches.includes('promotion');
      const pageTouchRegression =
        touches.includes('page') && input.baseline.claims[claim.id]?.status === 'proven';

      if (hardTouch || pageTouchRegression) {
        errors.push(msg);
      } else {
        warnings.push(`WARN ${msg}`);
      }
    }
  }

  // Rule 2: error and vacuous cases in this run's experiment reports.
  const seenCases = new Set<string>();
  const engineChanged =
    input.changedFiles !== 'all' && hasProofEngineChange(input.changedFiles);

  for (const report of input.runReports) {
    for (const [expId, expEntry] of Object.entries(report.experiments)) {
      for (const [key, engineMap] of Object.entries(expEntry.cases)) {
        for (const engine of ENGINE_IDS) {
          const caseRes = engineMap[engine];
          if (!caseRes || (caseRes.status !== 'error' && caseRes.status !== 'vacuous')) continue;
          const dedupeKey = `${expId}\0${key}\0${engine}`;
          if (seenCases.has(dedupeKey)) continue;
          seenCases.add(dedupeKey);

          const msg = `[experiment ${expId}] ${engine} ${key} is ${caseRes.status}: ${caseRes.error ?? 'no detail'}`;

          const isBlocking = provenPages.some((page) => {
            const pageClaims = input.claimsByPage.get(page.id) ?? [];
            return pageClaims.some((claim) => {
              if (claim.proof.kind !== 'experiment') return false;
              if (claim.proof.experimentId !== expId) return false;
              if (!claim.proof.expectKeys.includes(key)) return false;
              const scopeEngines: EngineId[] = claim.scope?.engines ?? [...ENGINE_IDS];
              if (!scopeEngines.includes(engine)) return false;

              if (input.changedFiles === 'all') return true;
              if (hasExperimentDirChange(input.changedFiles, expId)) return true;
              if (engineChanged && input.baseline.claims[claim.id]?.status === 'proven') return true;
              return false;
            });
          });

          if (isBlocking) {
            errors.push(msg);
          } else {
            warnings.push(`WARN ${msg}`);
          }
        }
      }
    }
  }

  // Rule 3: page-level checks (coverage, support).
  for (const page of input.pages) {
    const pageEntry = input.preview.pages[page.id];
    if (!pageEntry) continue;
    for (const checkKind of ['coverage', 'support'] as const) {
      const check = pageEntry[checkKind];
      if (!check || !check.enforced || check.status !== 'fail') continue;
      const msg = `[${page.kind} ${page.id}] ${checkKind}: ${check.violations.length} violation(s)`;
      const pageChanged =
        input.changedFiles === 'all' ||
        (page.mdxPath !== null && input.changedFiles.has(page.mdxPath)) ||
        input.changedFiles.has(`content/claims/${page.id}.claims.json`);
      if (pageChanged) {
        errors.push(msg);
      } else {
        warnings.push(`WARN ${msg}`);
      }
    }
  }

  return { ok: errors.length === 0, errors, warnings };
}

/**
 * Detects a runner outage in `--report-only` mode:
 * - an expected engine failed to start (absent from all run reports when at least one report exists);
 * - or more than 20% of recorded experiment cases ended in `error`.
 */
export function detectRunnerOutage(
  runReports: readonly ExperimentRunReport[],
  expectedEngines: readonly EngineId[] = ENGINE_IDS
): string | null {
  if (runReports.length === 0) return null;

  const presentEngines = new Set<EngineId>();
  let totalCases = 0;
  let errorCases = 0;

  for (const report of runReports) {
    for (const engine of ENGINE_IDS) {
      if (report.engines[engine]) presentEngines.add(engine);
    }
    for (const expEntry of Object.values(report.experiments)) {
      for (const engineMap of Object.values(expEntry.cases)) {
        for (const engine of ENGINE_IDS) {
          const caseRes = engineMap[engine];
          if (!caseRes) continue;
          totalCases += 1;
          if (caseRes.status === 'error') errorCases += 1;
        }
      }
    }
  }

  const missing = expectedEngines.filter((e) => !presentEngines.has(e));
  if (missing.length > 0) {
    return `runner outage: missing engine(s): ${missing.join(', ')}`;
  }

  if (totalCases > 0 && errorCases / totalCases > 0.2) {
    return `runner outage: ${errorCases}/${totalCases} cases in error (> 20%)`;
  }

  return null;
}

