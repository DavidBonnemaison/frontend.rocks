import fs from 'node:fs';
import path from 'node:path';
import { CONTENT_DIR } from '../paths';
import {
  emptyProofResults,
  ProofResultsSchema,
  type ClaimResult,
  type ProofResults,
} from './results-schema';

/** FR_PROOF_RESULTS_FILE overrides the default path (tests, preview builds). */
export const LATEST_RESULTS_PATH =
  process.env.FR_PROOF_RESULTS_FILE ?? path.join(CONTENT_DIR, '.proof-results', 'latest.json');

let cache: ProofResults | null = null;

export function readProofResults(file = LATEST_RESULTS_PATH): ProofResults {
  if (!fs.existsSync(file)) return emptyProofResults();
  return ProofResultsSchema.parse(JSON.parse(fs.readFileSync(file, 'utf-8')));
}

export function getProofResults(): ProofResults {
  if (!cache) cache = readProofResults();
  return cache;
}

export function getClaimResult(id: string): ClaimResult | null {
  return getProofResults().claims[id] ?? null;
}

export function resetProofResultsCache(): void {
  cache = null;
}
