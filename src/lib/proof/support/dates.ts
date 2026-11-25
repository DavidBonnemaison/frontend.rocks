import { CORE_BROWSERS, getBcdSupport, type CoreBrowser } from './bcd';
import { getBaseline, webFeaturesForBcdKey } from './baseline';
import { getBcd } from './data';

export type SupportEvent =
  | 'first-release'
  | 'baseline-low'
  | 'baseline-high'
  | `browser:${CoreBrowser}`;

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function preciseDateOrNull(raw: string | null | undefined): string | null {
  if (!raw || raw.startsWith('≤')) return null;
  return ISO_DATE_RE.test(raw) ? raw : null;
}

function resolveWebFeatureId(input: { bcdKey?: string; webFeatureId?: string }): string | null {
  if (input.webFeatureId) return input.webFeatureId;
  if (!input.bcdKey) return null;
  const matches = webFeaturesForBcdKey(input.bcdKey);
  return matches.length === 1 ? matches[0] : null;
}

function lookupBcdBrowserReleaseDate(browser: CoreBrowser, version: string): string | null {
  if (version.startsWith('≤')) return null;
  const raw = getBcd().browsers?.[browser]?.releases?.[version]?.release_date ?? null;
  return preciseDateOrNull(raw);
}

/** Returns the exact ISO date (YYYY-MM-DD) for a support event, or null if unknown or imprecise. */
export function getSupportEventDate(
  input: { bcdKey?: string; webFeatureId?: string },
  event: SupportEvent
): string | null {
  if (event === 'baseline-low' || event === 'baseline-high') {
    const wfId = resolveWebFeatureId(input);
    if (!wfId) return null;
    const lookup = getBaseline(wfId);
    if (!lookup.ok) return null;
    return preciseDateOrNull(event === 'baseline-low' ? lookup.info.lowDate : lookup.info.highDate);
  }

  if (event === 'first-release') {
    if (input.bcdKey) {
      const bcd = getBcdSupport(input.bcdKey);
      if (!bcd.exists) return null;
      const dates: string[] = [];
      for (const browser of CORE_BROWSERS) {
        const entry = bcd.browsers[browser];
        if (entry.status !== 'supported') continue;
        const d = preciseDateOrNull(entry.releaseDate);
        if (d) dates.push(d);
      }
      dates.sort();
      return dates[0] ?? null;
    }
    if (input.webFeatureId) {
      const lookup = getBaseline(input.webFeatureId);
      if (!lookup.ok) return null;
      const dates: string[] = [];
      for (const browser of CORE_BROWSERS) {
        const version = lookup.info.support[browser];
        if (!version) continue;
        const d = lookupBcdBrowserReleaseDate(browser, version);
        if (d) dates.push(d);
      }
      dates.sort();
      return dates[0] ?? null;
    }
    return null;
  }

  if (event.startsWith('browser:')) {
    const browser = event.slice('browser:'.length) as CoreBrowser;
    if (!(CORE_BROWSERS as readonly string[]).includes(browser)) return null;
    if (input.bcdKey) {
      const bcd = getBcdSupport(input.bcdKey);
      if (!bcd.exists) return null;
      return preciseDateOrNull(bcd.browsers[browser].releaseDate);
    }
    if (input.webFeatureId) {
      const lookup = getBaseline(input.webFeatureId);
      if (!lookup.ok) return null;
      const version = lookup.info.support[browser];
      if (!version) return null;
      return lookupBcdBrowserReleaseDate(browser, version);
    }
  }

  return null;
}
