import type { ProofResults } from '../proof/results-schema';

/**
 * Pure guard for `validate-content.ts`: returns `true` when an `unverified` page
 * is legitimately demoted or has a currently failing claim in `latest.json`
 * (own claims or cited foreign claims), so nightly regression PRs remain valid.
 */
export function isAllowedUnverified(
  pageId: string,
  claimsByPage: ReadonlyMap<string, readonly string[]>,
  results: ProofResults,
): boolean {
  if (results.demotedPages && results.demotedPages[pageId]) {
    return true;
  }

  const ownClaimIds = claimsByPage.get(pageId) ?? [];
  const foreignClaimIds = results.pages[pageId]?.coverage?.foreignClaimIds ?? [];
  const allClaimIds = new Set<string>([...ownClaimIds, ...foreignClaimIds]);

  for (const claimId of allClaimIds) {
    const rec = results.claims[claimId];
    if (rec && rec.failingSince !== null) {
      return true;
    }
  }

  return false;
}
