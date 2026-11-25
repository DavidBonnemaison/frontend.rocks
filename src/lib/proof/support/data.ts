// No `import 'server-only'`: that package throws outside the `react-server` condition (tsx, Vitest).
// Exclusion from the client bundle is verified by grep and production build checks.
import { createRequire } from 'node:module';
import type { CompatData } from '@mdn/browser-compat-data';
import { features as defaultWebFeatures } from 'web-features';
import { readInstalledPackageVersion } from './package-version';

const require = createRequire(import.meta.url);

export type BcdData = CompatData;
export type WebFeaturesMap = typeof defaultWebFeatures;

let bcdCache: BcdData | null = null;
let bcdOverride: BcdData | null = null;
let webFeaturesOverride: WebFeaturesMap | null = null;
let compatIndex: Map<string, string[]> | null = null;

/** Full MDN browser-compat-data payload. Loaded once per process. */
export function getBcd(): BcdData {
  if (bcdOverride) return bcdOverride;
  if (!bcdCache) {
    // The package main export "." resolves to data.json. Do NOT require a subpath: it is not exported.
    bcdCache = require('@mdn/browser-compat-data') as BcdData;
  }
  return bcdCache;
}

export function getWebFeatures(): WebFeaturesMap {
  return webFeaturesOverride ?? defaultWebFeatures;
}

export function getDataVersions(): { bcd: string; webFeatures: string } {
  return {
    bcd: readInstalledPackageVersion('@mdn/browser-compat-data'),
    webFeatures: readInstalledPackageVersion('web-features'),
  };
}

/** Maps a BCD key to the web-features ids that list it in `compat_features`. */
export function getCompatIndex(): Map<string, string[]> {
  if (!compatIndex) {
    compatIndex = new Map();
    const features = getWebFeatures();
    for (const [id, f] of Object.entries(features)) {
      if ((f as { kind?: string }).kind !== 'feature') continue;
      for (const key of (f as { compat_features?: string[] }).compat_features ?? []) {
        const existing = compatIndex.get(key);
        if (existing) {
          existing.push(id);
        } else {
          compatIndex.set(key, [id]);
        }
      }
    }
  }
  return compatIndex;
}

/** Test hook to inject a synthetic BCD object. Pass `null` to restore real data. */
export function __setBcdForTests(obj: BcdData | null): void {
  bcdOverride = obj;
}

/** Test hook to inject a synthetic web-features map. Pass `null` to restore real data. */
export function __setWebFeaturesForTests(obj: WebFeaturesMap | null): void {
  webFeaturesOverride = obj;
  compatIndex = null;
}
