import fs from 'node:fs';
import path from 'node:path';
import { CONTENT_DIR, SITE_ROOT } from '../paths';
import type { ClaimStatus } from './claim-schema';
import {
  emptyProofResults,
  ProofResultsSchema,
  type ProofResults,
} from './results-schema';

function readIfExists(filePath: string): ProofResults | null {
  if (!fs.existsSync(filePath)) return null;
  return ProofResultsSchema.parse(JSON.parse(fs.readFileSync(filePath, 'utf-8')));
}

/**
 * Reads proof results for PR checks or local checks:
 * 1. `artifacts/proof/latest.preview.json` when present (written by `aggregate` in `proof:all`);
 * 2. complemented entry-by-entry by `content/.proof-results/latest.json` for entries absent from preview.
 * Never throws when either file is missing; throws when an existing file fails schema validation.
 */
export function readCheckResults(opts?: {
  previewPath?: string;
  latestPath?: string;
}): ProofResults {
  const previewPath =
    opts?.previewPath ?? path.join(SITE_ROOT, 'artifacts', 'proof', 'latest.preview.json');
  const latestPath =
    opts?.latestPath ??
    process.env.FR_PROOF_RESULTS_FILE ??
    path.join(CONTENT_DIR, '.proof-results', 'latest.json');

  const preview = readIfExists(previewPath);
  const latest = readIfExists(latestPath);

  if (!preview && !latest) return emptyProofResults();
  if (preview && !latest) return preview;
  if (!preview && latest) return latest;

  // Both exist: preview wins per top-level key, complemented by latest.
  const base = latest!;
  const head = preview!;

  return {
    schemaVersion: 1,
    generatedAt: head.generatedAt,
    runner: head.runner,
    engines: Object.keys(head.engines).length > 0 ? head.engines : base.engines,
    experiments: { ...base.experiments, ...head.experiments },
    experimentMeta: { ...base.experimentMeta, ...head.experimentMeta },
    claims: { ...base.claims, ...head.claims },
    pages: { ...base.pages, ...head.pages },
    demotedPages: { ...base.demotedPages, ...head.demotedPages },
  };
}

/** Status of a claim, or null if not present anywhere ("not yet checked"). */
export function claimStatusOrNull(results: ProofResults, claimId: string): ClaimStatus | null {
  return results.claims[claimId]?.status ?? null;
}
