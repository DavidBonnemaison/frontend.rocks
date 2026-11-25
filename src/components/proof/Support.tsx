import React from 'react';
import {
  BROWSER_LABELS,
  CORE_BROWSERS,
  getBcdSupport,
  type BrowserSupport,
  type CoreBrowser,
} from '@/lib/proof/support/bcd';
import { getBaseline, webFeaturesForBcdKey } from '@/lib/proof/support/baseline';
import { getBcd, getDataVersions } from '@/lib/proof/support/data';
import { renderSupportStatement } from '@/lib/proof/support/statements';
import './support.css';

export type SupportVariant = 'badge' | 'table' | 'sentence';
export type BaselineTier = 'high' | 'low' | 'limited';

export interface SupportRowViewModel {
  browser: CoreBrowser;
  label: string;
  statusLabel: string;
  version: string;
  releaseDate: string;
}

export interface SupportViewModel {
  feature?: string;
  webFeature?: string;
  baselineTier: BaselineTier | null;
  badgeLabel: string | null;
  badgeTitle: string;
  desktopSummary: string;
  rows: SupportRowViewModel[];
  sentence: string;
  mdnUrl: string | null;
  dataVersions: { bcd: string; webFeatures: string };
}

const DESKTOP_BROWSERS: readonly CoreBrowser[] = ['chrome', 'firefox', 'safari'];

function formatStatusLabel(entry: BrowserSupport): string {
  if (entry.status === 'supported') return 'Supported';
  if (entry.status === 'partial') return entry.prefixed ? 'Partial (prefixed)' : 'Partial';
  if (entry.status === 'unsupported') return entry.flagsOnly ? 'Behind a flag' : 'Not supported';
  return 'Unknown';
}

function formatBaselineBadgeLabel(tier: BaselineTier): string {
  if (tier === 'high') return 'Baseline · Widely available';
  if (tier === 'low') return 'Baseline · Newly available';
  return 'Limited availability';
}

function pagePrefix(pageId?: string): string {
  return pageId ? ` on page "${pageId}"` : '';
}

export function buildSupportViewModel(
  feature?: string,
  webFeature?: string,
  pageId?: string
): SupportViewModel {
  const hasFeature = Boolean(feature && feature.trim().length > 0);
  const hasWebFeature = Boolean(webFeature && webFeature.trim().length > 0);
  if (hasFeature === hasWebFeature) {
    throw new Error(
      `<Support>${pagePrefix(pageId)}: provide exactly one of "feature" or "webFeature".`
    );
  }

  let resolvedWebFeature = hasWebFeature ? webFeature!.trim() : undefined;
  let bcdSupport = null;

  if (hasFeature) {
    const bcdKey = feature!.trim();
    bcdSupport = getBcdSupport(bcdKey);
    if (!bcdSupport.exists) {
      throw new Error(`<Support feature="${bcdKey}">${pagePrefix(pageId)}: unknown BCD key.`);
    }
    const inferred = webFeaturesForBcdKey(bcdKey);
    if (inferred.length === 1) {
      resolvedWebFeature = inferred[0];
    }
  }

  let baselineInfo = null;
  if (resolvedWebFeature) {
    const lookup = getBaseline(resolvedWebFeature);
    if (!lookup.ok) {
      throw new Error(
        `<Support ${hasFeature ? `feature="${feature}"` : `webFeature="${resolvedWebFeature}"`}>${pagePrefix(pageId)}: ${lookup.message}.`
      );
    }
    baselineInfo = lookup.info;
  }

  const bcdData = getBcd();
  const rows: SupportRowViewModel[] = CORE_BROWSERS.map((browser) => {
    if (bcdSupport) {
      const entry = bcdSupport.browsers[browser];
      return {
        browser,
        label: BROWSER_LABELS[browser],
        statusLabel: formatStatusLabel(entry),
        version: entry.since ?? '—',
        releaseDate: entry.releaseDate ?? '—',
      };
    }

    const version = baselineInfo?.support[browser] ?? null;
    const normalized = version && version.startsWith('≤') ? version.slice(1) : version;
    const releaseDate =
      normalized ? (bcdData.browsers?.[browser]?.releases?.[normalized]?.release_date ?? null) : null;
    return {
      browser,
      label: BROWSER_LABELS[browser],
      statusLabel: version ? 'Supported' : 'Not supported',
      version: version ?? '—',
      releaseDate: releaseDate ?? '—',
    };
  });

  const badgeTitle = rows
    .map((r) => `${r.label}: ${r.version !== '—' ? r.version : r.statusLabel}`)
    .join(' · ');

  const desktopSummary = DESKTOP_BROWSERS.map((browser) => {
    const row = rows.find((r) => r.browser === browser)!;
    return row.version !== '—' ? `${row.label} ${row.version}` : `${row.label} (${row.statusLabel})`;
  }).join(' · ');

  const baselineTier: BaselineTier | null = baselineInfo
    ? baselineInfo.baseline === 'high'
      ? 'high'
      : baselineInfo.baseline === 'low'
        ? 'low'
        : 'limited'
    : null;

  const rendered = renderSupportStatement({
    bcdKey: hasFeature ? feature!.trim() : undefined,
    webFeatureId: resolvedWebFeature,
  });
  if (!rendered.ok) {
    throw new Error(
      `<Support ${hasFeature ? `feature="${feature}"` : `webFeature="${webFeature}"`}>${pagePrefix(pageId)}: ${rendered.message}.`
    );
  }

  return {
    feature: hasFeature ? feature!.trim() : undefined,
    webFeature: resolvedWebFeature,
    baselineTier,
    badgeLabel: baselineTier ? formatBaselineBadgeLabel(baselineTier) : null,
    badgeTitle,
    desktopSummary,
    rows,
    sentence: rendered.statement,
    mdnUrl: bcdSupport?.mdnUrl ?? null,
    dataVersions: getDataVersions(),
  };
}

export interface SupportProps {
  feature?: string;
  webFeature?: string;
  variant?: SupportVariant;
  pageId?: string;
}

export function Support({ feature, webFeature, variant = 'badge', pageId }: SupportProps) {
  const vm = buildSupportViewModel(feature, webFeature, pageId);

  if (variant === 'sentence') {
    return <span className="support-sentence">{vm.sentence}</span>;
  }

  if (variant === 'table') {
    return (
      <table className="support-table">
        <caption>
          Browser support (MDN browser-compat-data {vm.dataVersions.bcd}, web-features{' '}
          {vm.dataVersions.webFeatures})
          {vm.mdnUrl && (
            <>
              {' · '}
              <a href={vm.mdnUrl} target="_blank" rel="noopener noreferrer">
                MDN
              </a>
            </>
          )}
        </caption>
        <thead>
          <tr>
            <th scope="col">Browser</th>
            <th scope="col">Status</th>
            <th scope="col">Version</th>
            <th scope="col">Released</th>
          </tr>
        </thead>
        <tbody>
          {vm.rows.map((row) => (
            <tr key={row.browser}>
              <td>{row.label}</td>
              <td>{row.statusLabel}</td>
              <td className="support-table__version">{row.version}</td>
              <td className="support-table__date">{row.releaseDate}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  if (vm.baselineTier && vm.badgeLabel) {
    return (
      <span
        className={`support-badge support-badge--${vm.baselineTier}`}
        title={vm.badgeTitle}
      >
        {vm.badgeLabel}
      </span>
    );
  }

  return (
    <span className="support-badge support-badge--bcd" title={vm.badgeTitle}>
      {vm.desktopSummary}
    </span>
  );
}
