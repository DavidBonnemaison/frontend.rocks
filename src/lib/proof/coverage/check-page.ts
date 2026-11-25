import type { PageCheckResult, PageViolation } from '../artifact-schema';
import { ClaimIdSchema, type Claim } from '../claim-schema';
import type { CoverageLabel, CoverageMeta } from './cache';
import { extractClaimReferences, toClaimId } from './claim-refs';
import { classifierKey, overreachKey, type OverreachKeyClaim } from './keys';
import { extractSentences } from './sentences';

export interface CheckPageInput {
  pageId: string;
  raw: string;
  /** All claims, full id -> claim (supports cross-page references). */
  claimsById: Map<string, Claim>;
  enforced: boolean;
  meta: CoverageMeta | null;
  labels: Map<string, CoverageLabel>;
}

const CACHE_MISS_MESSAGE =
  'No coverage label for this text yet. Labels are added by the maintainers; external contributors can leave this, a maintainer will add them to the pull request.';

const OVERREACH_MESSAGE =
  'This text states more than its linked claims. Narrow it to what the claims say.';

function toOverreachKeyClaim(claim: Claim): OverreachKeyClaim {
  return {
    id: claim.id,
    statement: claim.statement,
    engines: claim.scope?.engines ?? null,
    proofKind: claim.proof.kind,
    bcdKey: claim.proof.kind === 'bcd' ? claim.proof.bcdKey : null,
  };
}

/** Extracts sorted, deduplicated cross-page claim ids referenced by a page's MDX. */
export function extractForeignClaimIds(raw: string, pageId: string): string[] {
  try {
    const refs = extractClaimReferences(raw);
    const foreign = new Set<string>();
    for (const r of refs) {
      if (r.ref.includes('/') && !r.ref.startsWith(`${pageId}/`)) {
        if (ClaimIdSchema.safeParse(r.ref).success) {
          foreign.add(r.ref);
        }
      }
    }
    return [...foreign].sort();
  } catch {
    return [];
  }
}

/** Computes all cache keys currently referenced by a page (used for cache pruning). */
export function collectPageCoverageKeys(
  raw: string,
  pageId: string,
  claimsById: Map<string, Claim>,
  meta: CoverageMeta
): Set<string> {
  const keys = new Set<string>();
  const { sentences, units, errors } = extractSentences(raw, pageId);
  if (errors.some((e) => e.rule === 'coverage/mdx-parse-error')) {
    return keys;
  }

  for (const s of sentences) {
    if (s.skip === null && s.claimRefs.length === 0) {
      keys.add(classifierKey(meta.epochs.classifier, s.text));
    }
  }

  for (const u of units) {
    const resolved: Claim[] = [];
    let allKnown = true;
    for (const ref of u.claimRefs) {
      const claim = claimsById.get(toClaimId(pageId, ref));
      if (!claim) {
        allKnown = false;
        break;
      }
      resolved.push(claim);
    }
    if (!allKnown || resolved.length === 0) continue;
    keys.add(overreachKey(meta.epochs.overreach, u.text, resolved.map(toOverreachKeyClaim)));
  }

  return keys;
}

export function checkPageCoverage(input: CheckPageInput): PageCheckResult {
  const { pageId, raw, claimsById, enforced, meta, labels } = input;
  const violations: PageViolation[] = [];

  const { sentences, units, errors } = extractSentences(raw, pageId);
  for (const err of errors) {
    violations.push({
      rule: err.rule,
      line: err.line,
      column: null,
      message: err.message,
      excerpt: null,
    });
  }

  if (errors.some((e) => e.rule === 'coverage/mdx-parse-error')) {
    return {
      pageId,
      status: 'fail',
      enforced,
      violations,
      stats: {
        sentences: 0,
        checked: 0,
        skipped: 0,
        linked: 0,
        units: 0,
        factualUnlinked: 0,
        overreach: 0,
        cacheMisses: 0,
        orphanClaims: 0,
      },
      foreignClaimIds: [],
    };
  }

  const referencedClaimIds = new Set<string>();
  const foreignSet = new Set<string>();

  try {
    const refs = extractClaimReferences(raw);
    for (const r of refs) {
      const fullId = toClaimId(pageId, r.ref);
      referencedClaimIds.add(fullId);
      if (r.ref.includes('/') && !r.ref.startsWith(`${pageId}/`)) {
        if (ClaimIdSchema.safeParse(r.ref).success) {
          foreignSet.add(r.ref);
        }
      }
      if (!claimsById.has(fullId)) {
        violations.push({
          rule: 'coverage/unknown-claim',
          line: r.line,
          column: null,
          message: `Unknown claim reference "${r.ref}" (resolved to "${fullId}").`,
          excerpt: null,
        });
      }
    }
  } catch (err) {
    violations.push({
      rule: 'coverage/mdx-parse-error',
      line: null,
      column: null,
      message: err instanceof Error ? err.message : String(err),
      excerpt: null,
    });
  }

  const unlinkedToCheck = sentences.filter((s) => s.skip === null && s.claimRefs.length === 0);
  const resolvableUnits: Array<{ unit: (typeof units)[number]; claims: Claim[] }> = [];
  for (const unit of units) {
    const resolved: Claim[] = [];
    let allKnown = true;
    for (const ref of unit.claimRefs) {
      const claim = claimsById.get(toClaimId(pageId, ref));
      if (!claim) {
        allKnown = false;
        break;
      }
      resolved.push(claim);
    }
    if (allKnown && resolved.length > 0) {
      resolvableUnits.push({ unit, claims: resolved });
    }
  }

  let factualUnlinked = 0;
  let overreach = 0;
  let cacheMisses = 0;

  if (meta === null) {
    cacheMisses = unlinkedToCheck.length + resolvableUnits.length;
    if (cacheMisses > 0) {
      violations.push({
        rule: 'coverage/cache-miss',
        line: null,
        column: null,
        message: `${cacheMisses} items unchecked. ${CACHE_MISS_MESSAGE}`,
        excerpt: null,
      });
    }
  } else {
    for (const sentence of unlinkedToCheck) {
      const key = classifierKey(meta.epochs.classifier, sentence.text);
      const label = labels.get(key);
      if (!label) {
        cacheMisses += 1;
        violations.push({
          rule: 'coverage/cache-miss',
          line: sentence.line,
          column: sentence.column,
          message: CACHE_MISS_MESSAGE,
          excerpt: sentence.text,
        });
      } else if (label === 'factual') {
        factualUnlinked += 1;
        violations.push({
          rule:
            sentence.context === 'advice'
              ? 'coverage/advice-factual'
              : 'coverage/uncovered-factual',
          line: sentence.line,
          column: sentence.column,
          message: `${sentence.text} Wrap it in <C id="..."> linked to a claim, rewrite it as advice, or delete it.`,
          excerpt: sentence.text,
        });
      }
    }

    for (const { unit, claims } of resolvableUnits) {
      const key = overreachKey(
        meta.epochs.overreach,
        unit.text,
        claims.map(toOverreachKeyClaim)
      );
      const label = labels.get(key);
      if (!label) {
        cacheMisses += 1;
        violations.push({
          rule: 'coverage/cache-miss',
          line: unit.line,
          column: null,
          message: CACHE_MISS_MESSAGE,
          excerpt: unit.text,
        });
      } else if (label === 'overreach') {
        overreach += 1;
        violations.push({
          rule: 'coverage/overreach',
          line: unit.line,
          column: null,
          message: OVERREACH_MESSAGE,
          excerpt: unit.text,
        });
      }
    }
  }

  let orphanClaims = 0;
  const pagePrefix = `${pageId}/`;
  for (const id of claimsById.keys()) {
    if (id.startsWith(pagePrefix) && !referencedClaimIds.has(id)) {
      orphanClaims += 1;
    }
  }

  return {
    pageId,
    status: violations.length === 0 ? 'pass' : 'fail',
    enforced,
    violations,
    stats: {
      sentences: sentences.length,
      checked: unlinkedToCheck.length,
      skipped: sentences.filter((s) => s.skip !== null).length,
      linked: sentences.filter((s) => s.claimRefs.length > 0).length,
      units: units.length,
      factualUnlinked,
      overreach,
      cacheMisses,
      orphanClaims,
    },
    foreignClaimIds: [...foreignSet].sort(),
  };
}
