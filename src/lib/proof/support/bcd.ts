import type { CompatStatement, SimpleSupportStatement, SupportStatement } from '@mdn/browser-compat-data';
import { getBcd } from './data';

export const CORE_BROWSERS = [
  'chrome',
  'chrome_android',
  'edge',
  'firefox',
  'firefox_android',
  'safari',
  'safari_ios',
] as const;

export type CoreBrowser = (typeof CORE_BROWSERS)[number];

export const BROWSER_LABELS: Record<CoreBrowser, string> = {
  chrome: 'Chrome',
  chrome_android: 'Chrome Android',
  edge: 'Edge',
  firefox: 'Firefox',
  firefox_android: 'Firefox Android',
  safari: 'Safari',
  safari_ios: 'Safari iOS',
};

export type BrowserSupportStatus = 'supported' | 'partial' | 'unsupported' | 'unknown';

export interface BrowserSupport {
  status: BrowserSupportStatus;
  /** Raw BCD version string ("105", "≤79", "15.4"), or null if unsupported or unknown. */
  since: string | null;
  /** Release date of that version from BCD browsers.<id>.releases, or null if unknown. */
  releaseDate: string | null;
  flagsOnly: boolean;
  prefixed: boolean;
}

export interface BcdSupport {
  bcdKey: string;
  exists: boolean;
  deprecated: boolean;
  standardTrack: boolean;
  experimental: boolean;
  browsers: Record<CoreBrowser, BrowserSupport>;
  mdnUrl: string | null;
  specUrls: string[];
}

export interface BcdNodeWithCompat {
  __compat: CompatStatement;
  [key: string]: unknown;
}

/** Walks BCD by dot-separated segments and returns the node carrying `__compat`, or null. */
export function getBcdNode(bcdKey: string): BcdNodeWithCompat | null {
  if (!bcdKey) return null;
  const segments = bcdKey.split('.');
  let current: unknown = getBcd();
  for (const segment of segments) {
    if (
      typeof current !== 'object' ||
      current === null ||
      !Object.prototype.hasOwnProperty.call(current, segment)
    ) {
      return null;
    }
    current = (current as Record<string, unknown>)[segment];
  }
  if (
    typeof current === 'object' &&
    current !== null &&
    Object.prototype.hasOwnProperty.call(current, '__compat') &&
    (current as { __compat?: unknown }).__compat
  ) {
    return current as BcdNodeWithCompat;
  }
  return null;
}

function lookupReleaseDate(browser: CoreBrowser, version: string): string | null {
  const bcd = getBcd();
  const normalized = version.startsWith('≤') ? version.slice(1) : version;
  return bcd.browsers?.[browser]?.releases?.[normalized]?.release_date ?? null;
}

function unknownBrowserSupport(): BrowserSupport {
  return {
    status: 'unknown',
    since: null,
    releaseDate: null,
    flagsOnly: false,
    prefixed: false,
  };
}

function isStableVersionString(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0 && v !== 'preview';
}

function parseBrowserStatement(
  browser: CoreBrowser,
  raw: SupportStatement | undefined
): BrowserSupport {
  if (!raw) return unknownBrowserSupport();
  const list: SimpleSupportStatement[] = Array.isArray(raw) ? raw : [raw];
  if (list.length === 0) return unknownBrowserSupport();

  // Rule 2: first unflagged, unprefixed, non-alternative, non-removed statement with a stable version string.
  const direct = list.find(
    (s) =>
      (!s.flags || s.flags.length === 0) &&
      !s.prefix &&
      !s.alternative_name &&
      !s.version_removed &&
      isStableVersionString(s.version_added)
  );
  if (direct && isStableVersionString(direct.version_added)) {
    return {
      status: direct.partial_implementation ? 'partial' : 'supported',
      since: direct.version_added,
      releaseDate: lookupReleaseDate(browser, direct.version_added),
      flagsOnly: false,
      prefixed: false,
    };
  }

  // Rule 3: prefixed / alternative_name without flags -> partial + prefixed; flags -> unsupported + flagsOnly.
  const prefixed = list.find(
    (s) =>
      (!s.flags || s.flags.length === 0) &&
      Boolean(s.prefix || s.alternative_name) &&
      !s.version_removed &&
      isStableVersionString(s.version_added)
  );
  if (prefixed && isStableVersionString(prefixed.version_added)) {
    return {
      status: 'partial',
      since: prefixed.version_added,
      releaseDate: lookupReleaseDate(browser, prefixed.version_added),
      flagsOnly: false,
      prefixed: true,
    };
  }

  const flagged = list.find(
    (s) =>
      Array.isArray(s.flags) &&
      s.flags.length > 0 &&
      !s.version_removed &&
      s.version_added !== false &&
      (s.version_added as unknown) !== null &&
      (s.version_added as unknown) !== undefined
  );
  if (flagged) {
    return {
      status: 'unsupported',
      since: null,
      releaseDate: null,
      flagsOnly: true,
      prefixed: false,
    };
  }

  // Rule 4 & 5: false / preview / removed -> unsupported; null / missing -> unknown.
  const hasKnownUnsupported = list.some(
    (s) =>
      s.version_added === false ||
      s.version_added === 'preview' ||
      Boolean(s.version_removed)
  );
  if (hasKnownUnsupported) {
    return {
      status: 'unsupported',
      since: null,
      releaseDate: null,
      flagsOnly: false,
      prefixed: false,
    };
  }

  return unknownBrowserSupport();
}

export function getBcdSupport(bcdKey: string): BcdSupport {
  const node = getBcdNode(bcdKey);
  if (!node) {
    const browsers = Object.fromEntries(
      CORE_BROWSERS.map((b) => [b, unknownBrowserSupport()])
    ) as Record<CoreBrowser, BrowserSupport>;
    return {
      bcdKey,
      exists: false,
      deprecated: false,
      standardTrack: false,
      experimental: false,
      browsers,
      mdnUrl: null,
      specUrls: [],
    };
  }

  const compat = node.__compat;
  const browsers = Object.fromEntries(
    CORE_BROWSERS.map((b) => [b, parseBrowserStatement(b, compat.support?.[b])])
  ) as Record<CoreBrowser, BrowserSupport>;

  const specUrls = Array.isArray(compat.spec_url)
    ? [...compat.spec_url]
    : typeof compat.spec_url === 'string'
      ? [compat.spec_url]
      : [];

  return {
    bcdKey,
    exists: true,
    deprecated: Boolean(compat.status?.deprecated),
    standardTrack: Boolean(compat.status?.standard_track),
    experimental: Boolean(compat.status?.experimental),
    browsers,
    mdnUrl: compat.mdn_url ?? null,
    specUrls,
  };
}
