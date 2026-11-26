import type { Claim } from './claim-schema';
import { getClaimsForPage } from './claims-loader';
import { loadExperimentBundle } from './experiment-bundles';
import type { ExperimentBundle } from './experiment-schema';
import { getProofResults } from './results-loader';
import type { MeasuredObserved } from './results-schema';
import { notRunnableReason, type NotRunnableReason } from './runtime/browser';

export const MAX_INLINE_BUNDLES_BYTES = 200 * 1024;

export interface BrowserProofItem {
  claimId: string;
  slug: string;
  type: 'observable' | 'measured';
  experimentId: string;
  expectKeys: string[];
  notRunnable: NotRunnableReason | null;
  ciRatio: number | null;
}

export interface BrowserProofPayload {
  items: BrowserProofItem[];
  /** Inline deduplicated bundles, or null when total size exceeds 200 KiB (fetched on click from /experiments/<id>.json). */
  bundles: Record<string, ExperimentBundle> | null;
}

function extractMeasuredRatio(experimentId: string, expectKeys: string[]): number | null {
  const results = getProofResults();
  const expCases = results.experiments[experimentId];
  if (!expCases) return null;
  for (const key of expectKeys) {
    const perEngine = expCases[key];
    if (!perEngine) continue;
    for (const caseRes of Object.values(perEngine)) {
      if (caseRes && 'ratio' in caseRes.observed) {
        return (caseRes.observed as MeasuredObserved).ratio;
      }
    }
  }
  return null;
}

export function buildBrowserProofPayloadForClaims(claims: Claim[]): BrowserProofPayload {
  const bundlesMap: Record<string, ExperimentBundle> = {};
  const items: BrowserProofItem[] = [];

  for (const claim of claims) {
    if (claim.proof.kind !== 'experiment') continue;
    if (claim.type !== 'observable' && claim.type !== 'measured') continue;

    const { experimentId, expectKeys } = claim.proof;
    let bundle = bundlesMap[experimentId];
    if (!bundle) {
      try {
        bundle = loadExperimentBundle(experimentId);
        bundlesMap[experimentId] = bundle;
      } catch {
        continue;
      }
    }

    const reason = notRunnableReason(bundle);
    const slug = claim.id.split('/')[1];
    items.push({
      claimId: claim.id,
      slug,
      type: claim.type,
      experimentId,
      expectKeys,
      notRunnable: reason,
      ciRatio: claim.type === 'measured' ? extractMeasuredRatio(experimentId, expectKeys) : null,
    });
  }

  const inlineBytes = Buffer.byteLength(JSON.stringify(bundlesMap), 'utf-8');
  return {
    items,
    bundles: inlineBytes <= MAX_INLINE_BUNDLES_BYTES ? bundlesMap : null,
  };
}

export function buildBrowserProofPayload(pageId: string): BrowserProofPayload {
  const file = getClaimsForPage(pageId);
  if (!file) return { items: [], bundles: {} };
  return buildBrowserProofPayloadForClaims(file.claims);
}
