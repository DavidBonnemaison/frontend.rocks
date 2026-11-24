import { DETECTOR_PRESCRIPTIONS } from './prescriptions';
import type { DiagnoseFinding } from './types';

export interface HarHeader {
  name: string;
  value: string;
}

export interface HarEntry {
  startedDateTime?: string;
  time?: number;
  request?: {
    method?: string;
    url?: string;
    headers?: HarHeader[];
  };
  response?: {
    status?: number;
    headers?: HarHeader[];
    content?: {
      size?: number;
      mimeType?: string;
    };
  };
  _initiator?: {
    type?: string;
    url?: string;
    stack?: {
      callFrames?: Array<{ url?: string }>;
    };
  };
}

export interface HarPayload {
  log: {
    version?: string;
    entries: HarEntry[];
  };
}

const WATERFALL_MIN_LEVELS = 4; // > 3 levels
const DUPLICATE_MUTATION_WINDOW_MS = 150;

function roundMs(value: number): number {
  return Math.round(value * 10) / 10;
}

function shortUrl(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    return `${parsed.pathname}${parsed.search}`.slice(0, 80) || rawUrl;
  } catch {
    return rawUrl.slice(0, 80);
  }
}

function getHeaderValue(headers: HarHeader[] | undefined, targetName: string): string | null {
  if (!Array.isArray(headers)) return null;
  const lower = targetName.toLowerCase();
  const match = headers.find((h) => h && typeof h.name === 'string' && h.name.toLowerCase() === lower);
  return match ? String(match.value ?? '') : null;
}

function isStaticAsset(entry: HarEntry): boolean {
  const url = entry.request?.url ?? '';
  const pathOnly = url.split('?')[0].split('#')[0].toLowerCase();
  if (pathOnly.endsWith('.js') || pathOnly.endsWith('.mjs') || pathOnly.endsWith('.css')) {
    return true;
  }
  const mime = (entry.response?.content?.mimeType ?? '').toLowerCase();
  return mime.includes('javascript') || mime.includes('text/css');
}

function getInitiatorUrl(entry: HarEntry): string | null {
  if (entry._initiator?.url) return entry._initiator.url;
  const frameUrl = entry._initiator?.stack?.callFrames?.[0]?.url;
  return frameUrl ?? null;
}

export function extractHarEntries(parsed: unknown): HarEntry[] | null {
  if (
    parsed &&
    typeof parsed === 'object' &&
    'log' in parsed &&
    (parsed as HarPayload).log &&
    typeof (parsed as HarPayload).log === 'object' &&
    Array.isArray((parsed as HarPayload).log.entries)
  ) {
    return (parsed as HarPayload).log.entries;
  }
  return null;
}

export function analyzeHar(entries: HarEntry[]): DiagnoseFinding[] {
  const findings: DiagnoseFinding[] = [];

  // Normalize entries with timing info
  const normalized = entries
    .map((entry, index) => {
      const startMs = entry.startedDateTime ? Date.parse(entry.startedDateTime) : NaN;
      const durationMs = typeof entry.time === 'number' && Number.isFinite(entry.time) ? entry.time : 0;
      return {
        index,
        entry,
        url: entry.request?.url ?? '',
        method: (entry.request?.method ?? 'GET').toUpperCase(),
        startMs: Number.isFinite(startMs) ? startMs : index * 10,
        durationMs,
        endMs: (Number.isFinite(startMs) ? startMs : index * 10) + durationMs,
        initiatorUrl: getInitiatorUrl(entry),
      };
    })
    .sort((a, b) => a.startMs - b.startMs);

  // 1. Request Waterfalls (sequential blocking request chains > 3 levels)
  if (normalized.length >= WATERFALL_MIN_LEVELS) {
    const byUrl = new Map<string, (typeof normalized)[number]>();
    for (const item of normalized) {
      if (item.url && !byUrl.has(item.url)) {
        byUrl.set(item.url, item);
      }
    }

    const depthByIndex = new Map<number, number>();
    const chainByIndex = new Map<number, (typeof normalized)[number][]>();

    for (const item of normalized) {
      let bestParent: (typeof normalized)[number] | null = null;

      // First: explicit _initiator dependency if parent finished before or near child start
      if (item.initiatorUrl && item.initiatorUrl !== item.url) {
        const initiator = byUrl.get(item.initiatorUrl);
        if (initiator && initiator.startMs < item.startMs) {
          bestParent = initiator;
        }
      }

      // Fallback: sequential non-overlapping blocking chain heuristic (child starts after parent ends within 150ms)
      if (!bestParent) {
        let bestDepth = 0;
        for (const candidate of normalized) {
          if (candidate.index === item.index) continue;
          if (candidate.endMs <= item.startMs && item.startMs - candidate.endMs <= 150) {
            const candidateDepth = depthByIndex.get(candidate.index) ?? 1;
            if (candidateDepth > bestDepth) {
              bestDepth = candidateDepth;
              bestParent = candidate;
            }
          }
        }
      }

      if (bestParent) {
        const parentChain = chainByIndex.get(bestParent.index) ?? [bestParent];
        const nextChain = [...parentChain, item];
        depthByIndex.set(item.index, nextChain.length);
        chainByIndex.set(item.index, nextChain);
      } else {
        depthByIndex.set(item.index, 1);
        chainByIndex.set(item.index, [item]);
      }
    }

    let deepestChain: (typeof normalized)[number][] = [];
    for (const chain of chainByIndex.values()) {
      if (chain.length > deepestChain.length) {
        deepestChain = chain;
      }
    }

    if (deepestChain.length >= WATERFALL_MIN_LEVELS) {
      const chainTotalMs = roundMs(
        deepestChain[deepestChain.length - 1].endMs - deepestChain[0].startMs
      );
      findings.push({
        id: 'har-request-waterfall',
        detector: 'request-waterfall',
        title: 'Sequential Blocking Request Waterfall',
        severity: deepestChain.length >= 5 || chainTotalMs > 1000 ? 'critical' : 'warning',
        occurrences: deepestChain.length,
        worstDurationMs: chainTotalMs,
        totalDurationMs: chainTotalMs,
        metricLabel: `${deepestChain.length}-level sequential chain · ${chainTotalMs} ms end-to-end`,
        explanation:
          'Resources are discovered sequentially instead of in parallel, forcing the browser to wait for each round-trip before discovering the next dependency. Preload hints, 103 Early Hints, and HTTP/2+ multiplexing flatten this critical path.',
        evidence: deepestChain
          .slice(0, 4)
          .map((item, idx) => `L${idx + 1}: ${shortUrl(item.url)} (${roundMs(item.durationMs)} ms)`),
        prescriptions: DETECTOR_PRESCRIPTIONS['request-waterfall'],
      });
    }
  }

  // 2. Cache Miss / no-store on static assets (.js / .css)
  const uncachedAssets: { url: string; header: string; hasNoStore: boolean; durMs: number }[] = [];
  for (const item of normalized) {
    if (!isStaticAsset(item.entry)) continue;
    const cc = getHeaderValue(item.entry.response?.headers, 'cache-control');
    const ccLower = (cc ?? '').toLowerCase();
    const hasNoStore = ccLower.includes('no-store');
    const hasNoCache = ccLower.includes('no-cache') || ccLower.includes('max-age=0');
    const hasImmutableOrLongMaxAge =
      ccLower.includes('immutable') || /max-age=\s*([1-9]\d{4,})/.test(ccLower);

    if (hasNoStore || hasNoCache || !cc || !hasImmutableOrLongMaxAge) {
      uncachedAssets.push({
        url: item.url,
        header: cc ? `Cache-Control: ${cc}` : 'Missing Cache-Control header',
        hasNoStore,
        durMs: item.durationMs,
      });
    }
  }

  if (uncachedAssets.length > 0) {
    const anyNoStore = uncachedAssets.some((a) => a.hasNoStore);
    const worst = roundMs(uncachedAssets.reduce((max, a) => Math.max(max, a.durMs), 0));
    const total = roundMs(uncachedAssets.reduce((sum, a) => sum + a.durMs, 0));

    findings.push({
      id: 'har-cache-miss',
      detector: 'cache-miss',
      title: 'Uncached Static Assets / Cache-Control: no-store',
      severity: anyNoStore ? 'critical' : 'warning',
      occurrences: uncachedAssets.length,
      worstDurationMs: worst,
      totalDurationMs: total,
      metricLabel: `${uncachedAssets.length} static asset${uncachedAssets.length === 1 ? '' : 's'} missing immutable caching${anyNoStore ? ' (no-store detected)' : ''}`,
      explanation:
        'Static JS/CSS bundles served with Cache-Control: no-store or without long-lived immutable directives force repeated network fetches on every navigation and can disqualify pages from Back/Forward Cache (bfcache).',
      evidence: uncachedAssets
        .slice(0, 3)
        .map((a) => `${shortUrl(a.url)} → ${a.header}`),
      prescriptions: DETECTOR_PRESCRIPTIONS['cache-miss'],
    });
  }

  // 3. Duplicate Concurrent Mutations (identical POST/PUT within < 150 ms)
  const mutationsByKey = new Map<string, (typeof normalized)[number][]>();
  for (const item of normalized) {
    if (item.method !== 'POST' && item.method !== 'PUT') continue;
    const key = `${item.method} ${item.url}`;
    const list = mutationsByKey.get(key) ?? [];
    list.push(item);
    mutationsByKey.set(key, list);
  }

  const duplicatePairs: { key: string; deltaMs: number; durMs: number }[] = [];
  for (const [key, list] of mutationsByKey.entries()) {
    if (list.length < 2) continue;
    for (let i = 1; i < list.length; i += 1) {
      const deltaMs = list[i].startMs - list[i - 1].startMs;
      if (deltaMs >= 0 && deltaMs < DUPLICATE_MUTATION_WINDOW_MS) {
        duplicatePairs.push({
          key,
          deltaMs: roundMs(deltaMs),
          durMs: Math.max(list[i].durationMs, list[i - 1].durationMs),
        });
      }
    }
  }

  if (duplicatePairs.length > 0) {
    duplicatePairs.sort((a, b) => a.deltaMs - b.deltaMs);
    const worstDur = roundMs(duplicatePairs.reduce((max, p) => Math.max(max, p.durMs), 0));

    findings.push({
      id: 'har-duplicate-mutations',
      detector: 'duplicate-mutations',
      title: 'Duplicate Concurrent Mutations (< 150 ms)',
      severity: 'critical',
      occurrences: duplicatePairs.length,
      worstDurationMs: worstDur,
      metricLabel: `${duplicatePairs.length} duplicate mutation burst${duplicatePairs.length === 1 ? '' : 's'} · Min gap: ${duplicatePairs[0].deltaMs} ms`,
      explanation:
        'Identical POST/PUT requests were dispatched within 150 ms of each other—typically caused by rapid double-clicks racing ahead of asynchronous UI state updates. Without idempotency keys and a state-machine guard, this causes duplicate charges or state corruption.',
      evidence: duplicatePairs
        .slice(0, 3)
        .map((p) => `${p.key.split(' ')[0]} ${shortUrl(p.key.split(' ')[1] ?? '')} (Δ ${p.deltaMs} ms)`),
      prescriptions: DETECTOR_PRESCRIPTIONS['duplicate-mutations'],
    });
  }

  return findings;
}
