import { CORE_BROWSERS, type CoreBrowser } from './bcd';
import { getCompatIndex, getWebFeatures } from './data';

export interface BaselineInfo {
  webFeatureId: string;
  name: string;
  baseline: 'high' | 'low' | false;
  /** "2023-02-14"; dates prefixed with "≤" are preserved as-is. */
  lowDate: string | null;
  highDate: string | null;
  /** Core browser versions reported by web-features. */
  support: Partial<Record<CoreBrowser, string>>;
}

export type BaselineLookup =
  | { ok: true; info: BaselineInfo }
  | {
      ok: false;
      reason: 'unknown-web-feature' | 'moved' | 'split';
      message: string;
      redirectTo?: string[];
    };

export function getBaseline(webFeatureId: string): BaselineLookup {
  const features = getWebFeatures();
  if (!Object.prototype.hasOwnProperty.call(features, webFeatureId)) {
    return {
      ok: false,
      reason: 'unknown-web-feature',
      message: `Unknown web_feature_id "${webFeatureId}" in web-features`,
    };
  }

  const entry = features[webFeatureId];
  if (entry.kind === 'moved') {
    return {
      ok: false,
      reason: 'moved',
      message: `web_feature_id "${webFeatureId}" moved to "${entry.redirect_target}"`,
      redirectTo: [entry.redirect_target],
    };
  }

  if (entry.kind === 'split') {
    const targets = [...entry.redirect_targets];
    return {
      ok: false,
      reason: 'split',
      message: `web_feature_id "${webFeatureId}" split into ${targets.map((t) => `"${t}"`).join(', ')}`,
      redirectTo: targets,
    };
  }

  const rawSupport = entry.status?.support ?? {};
  const support: Partial<Record<CoreBrowser, string>> = {};
  for (const browser of CORE_BROWSERS) {
    const version = (rawSupport as Record<string, string | undefined>)[browser];
    if (typeof version === 'string' && version.length > 0) {
      support[browser] = version;
    }
  }

  const rawBaseline = entry.status?.baseline;
  const baseline: 'high' | 'low' | false =
    rawBaseline === 'high' || rawBaseline === 'low' ? rawBaseline : false;

  return {
    ok: true,
    info: {
      webFeatureId,
      name: entry.name,
      baseline,
      lowDate: entry.status?.baseline_low_date ?? null,
      highDate: entry.status?.baseline_high_date ?? null,
      support,
    },
  };
}

/** Returns web-features ids that list the given BCD key in `compat_features` (0, 1, or more). */
export function webFeaturesForBcdKey(bcdKey: string): string[] {
  return [...(getCompatIndex().get(bcdKey) ?? [])];
}
