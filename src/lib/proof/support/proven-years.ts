import type { ClaimCheckResult, ProofArtifact } from '../artifact-schema';
import type { Claim } from '../claim-schema';
import { CORE_BROWSERS, getBcdSupport } from './bcd';
import { getBaseline } from './baseline';

export interface ProvenYearsInput {
  /** All claims indexed by full claim id ("page-id/slug"). */
  claims: Map<string, Claim>;
  /** artifacts/proof/spec-quotes.json from the current run, if present. */
  specArtifact: ProofArtifact | null;
  /** artifacts/proof/source-quotes.json from the current run, if present. */
  sourceArtifact: ProofArtifact | null;
  /** BCD claim results computed during the current support run. */
  supportResults: Map<string, ClaimCheckResult>;
}

const YEAR_IN_TEXT = /\b(19[89]\d|20[0-4]\d)\b/g;

function extractYears(text: string | null | undefined, out: Set<number>): void {
  if (!text) return;
  for (const match of text.matchAll(YEAR_IN_TEXT)) {
    out.add(Number(match[1]));
  }
}

export function collectProvenYears(input: ProvenYearsInput): Map<string, Set<number>> {
  const cache = new Map<string, Set<number>>();

  function resolve(claimId: string, visiting: Set<string>): Set<number> {
    const cached = cache.get(claimId);
    if (cached) return cached;
    if (visiting.has(claimId)) return new Set();

    const claim = input.claims.get(claimId);
    if (!claim) return new Set();

    const years = new Set<number>();

    switch (claim.proof.kind) {
      case 'spec-quote': {
        if (input.specArtifact?.claims[claimId]?.status === 'proven') {
          extractYears(claim.proof.quote, years);
        }
        break;
      }
      case 'source-quote': {
        if (input.sourceArtifact?.claims[claimId]?.status === 'proven') {
          extractYears(claim.proof.quote, years);
        }
        break;
      }
      case 'bcd': {
        if (input.supportResults.get(claimId)?.status === 'proven') {
          const bcd = getBcdSupport(claim.proof.bcdKey);
          if (bcd.exists) {
            for (const browser of CORE_BROWSERS) {
              const entry = bcd.browsers[browser];
              if (entry.status === 'supported') {
                extractYears(entry.releaseDate, years);
              }
            }
          }
          if (claim.proof.webFeatureId) {
            const baseline = getBaseline(claim.proof.webFeatureId);
            if (baseline.ok) {
              extractYears(baseline.info.lowDate, years);
              extractYears(baseline.info.highDate, years);
            }
          }
        }
        break;
      }
      case 'derived': {
        visiting.add(claimId);
        for (const depId of claim.proof.from) {
          for (const year of resolve(depId, visiting)) {
            years.add(year);
          }
        }
        visiting.delete(claimId);
        break;
      }
      case 'experiment': {
        // Observable and measured experiments never prove a calendar year.
        break;
      }
    }

    cache.set(claimId, years);
    return years;
  }

  for (const id of input.claims.keys()) {
    resolve(id, new Set());
  }

  return cache;
}
