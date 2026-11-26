import type { Claim } from './claim-schema';
import { getSpecQuoteHref } from './spec/record';
import { getBcdSupport } from './support/bcd';

/**
 * Builds a specification URL with a verified Scroll-to-Text-Fragment directive
 * when a committed record exists, falling back to the anchor alone.
 */
export function buildSpecFragmentUrl(url: string, anchor: string, quote: string): string {
  return getSpecQuoteHref({
    proof: { kind: 'spec-quote', url, anchor, quote },
  });
}

/** Link to a pinned line range in a public GitHub repository. */
export function buildSourceLineUrl(
  repo: string,
  commit: string,
  path: string,
  lines: [number, number]
): string {
  return `https://github.com/${repo}/blob/${commit}/${path}#L${lines[0]}-L${lines[1]}`;
}

export function externalHrefFor(claim: Claim): string | null {
  switch (claim.proof.kind) {
    case 'spec-quote':
      return getSpecQuoteHref({ proof: claim.proof });
    case 'source-quote':
      return buildSourceLineUrl(
        claim.proof.repo,
        claim.proof.commit,
        claim.proof.path,
        claim.proof.lines
      );
    case 'bcd': {
      const support = getBcdSupport(claim.proof.bcdKey);
      return support.exists ? support.mdnUrl : null;
    }
    default:
      return null;
  }
}
