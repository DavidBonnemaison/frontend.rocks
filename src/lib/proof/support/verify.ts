import type { ClaimCheckResult } from '../artifact-schema';
import type { Claim } from '../claim-schema';
import { getBcdSupport } from './bcd';
import { getBaseline, type BaselineInfo } from './baseline';
import { getDataVersions, getWebFeatures } from './data';
import { renderSupportStatement } from './statements';

export type SupportClaim = Claim & { proof: Extract<Claim['proof'], { kind: 'bcd' }> };

export function verifySupportClaim(claim: SupportClaim, now: Date): ClaimCheckResult {
  const checkedAt = now.toISOString();
  const { bcdKey, webFeatureId } = claim.proof;

  const bcd = getBcdSupport(bcdKey);
  if (!bcd.exists) {
    return {
      claimId: claim.id,
      status: 'failed',
      reason: 'unknown-bcd-key',
      message: `Unknown BCD key "${bcdKey}".`,
      details: { bcdKey },
      checkedAt,
    };
  }

  let baselineInfo: BaselineInfo | null = null;
  if (webFeatureId) {
    const baseline = getBaseline(webFeatureId);
    if (!baseline.ok) {
      const reason =
        baseline.reason === 'moved'
          ? 'web-feature-moved'
          : baseline.reason === 'split'
            ? 'web-feature-split'
            : 'unknown-web-feature';
      return {
        claimId: claim.id,
        status: 'failed',
        reason,
        message: baseline.message,
        details: {
          bcdKey,
          webFeatureId,
          ...(baseline.redirectTo ? { redirectTo: baseline.redirectTo } : {}),
        },
        checkedAt,
      };
    }

    baselineInfo = baseline.info;
    const rawFeature = getWebFeatures()[webFeatureId];
    const compatFeatures: readonly string[] =
      rawFeature && rawFeature.kind === 'feature' && Array.isArray(rawFeature.compat_features)
        ? rawFeature.compat_features
        : [];
    if (!compatFeatures.includes(bcdKey)) {
      return {
        claimId: claim.id,
        status: 'failed',
        reason: 'bcd-key-not-in-feature',
        message: `BCD key "${bcdKey}" is not listed in compat_features of web-features "${webFeatureId}".`,
        details: { bcdKey, webFeatureId },
        checkedAt,
      };
    }
  }

  const rendered = renderSupportStatement({ bcdKey, webFeatureId });
  if (!rendered.ok) {
    return {
      claimId: claim.id,
      status: 'failed',
      reason: rendered.reason,
      message: rendered.message,
      details: { bcdKey, ...(webFeatureId ? { webFeatureId } : {}) },
      checkedAt,
    };
  }

  if (claim.statement !== rendered.statement) {
    return {
      claimId: claim.id,
      status: 'failed',
      reason: 'statement-outdated',
      message: 'Run: npm run proof:support -- --write',
      details: {
        bcdKey,
        ...(webFeatureId ? { webFeatureId } : {}),
        expected: rendered.statement,
        actual: claim.statement,
      },
      checkedAt,
    };
  }

  return {
    claimId: claim.id,
    status: 'proven',
    reason: null,
    message: null,
    details: {
      bcdKey,
      webFeatureId: webFeatureId ?? null,
      baseline: baselineInfo?.baseline ?? null,
      lowDate: baselineInfo?.lowDate ?? null,
      highDate: baselineInfo?.highDate ?? null,
      browsers: bcd.browsers,
      dataVersions: getDataVersions(),
    },
    checkedAt,
  };
}
