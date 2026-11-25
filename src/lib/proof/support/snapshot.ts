import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { getAllConcepts, type LoadedConcept } from '../../content-loader';
import { CONTENT_DIR, SITE_ROOT } from '../../paths';
import { splitClaimId, type Claim } from '../claim-schema';
import { getAllClaims } from '../claims-loader';
import {
  CORE_BROWSERS,
  getBcdSupport,
  type BrowserSupportStatus,
  type CoreBrowser,
} from './bcd';
import { getBaseline } from './baseline';
import { getDataVersions } from './data';

export interface SupportSnapshotFeature {
  baseline: 'high' | 'low' | false;
  lowDate: string | null;
  highDate: string | null;
  support: Partial<Record<CoreBrowser, string>>;
}

export type SupportSnapshotBcdKey = Record<
  CoreBrowser,
  { status: BrowserSupportStatus; since: string | null }
>;

export interface SupportSnapshot {
  generatedAt: string;
  dataVersions: { bcd: string; webFeatures: string };
  features: Record<string, SupportSnapshotFeature>;
  bcdKeys: Record<string, SupportSnapshotBcdKey>;
}

export interface SupportChange {
  kind: 'baseline' | 'browser';
  /** webFeatureId for kind 'baseline', or bcdKey for kind 'browser'. */
  id: string;
  before: unknown;
  after: unknown;
  affectedPages: string[];
}

export const DEFAULT_SNAPSHOT_RELATIVE_PATH = path.join(
  'content',
  '.proof-cache',
  'support-snapshot.json'
);

export function getDefaultSnapshotPath(): string {
  return path.join(CONTENT_DIR, '.proof-cache', 'support-snapshot.json');
}

function sortedObject<T>(entries: Array<[string, T]>): Record<string, T> {
  entries.sort(([a], [b]) => a.localeCompare(b));
  return Object.fromEntries(entries);
}

/** Collects maps of webFeatureId -> pageIds and bcdKey -> pageIds referenced by content. */
export function collectSupportReferences(options: {
  concepts?: LoadedConcept[];
  claims?: Claim[];
} = {}): {
  featureToPages: Map<string, string[]>;
  bcdKeyToPages: Map<string, string[]>;
} {
  const concepts = options.concepts ?? getAllConcepts();
  const claims = options.claims ?? getAllClaims();

  const featureSets = new Map<string, Set<string>>();
  const bcdKeySets = new Map<string, Set<string>>();

  const addRef = (map: Map<string, Set<string>>, key: string, pageId: string) => {
    let set = map.get(key);
    if (!set) {
      set = new Set();
      map.set(key, set);
    }
    set.add(pageId);
  };

  for (const concept of concepts) {
    if (concept.frontmatter.web_feature_id) {
      addRef(featureSets, concept.frontmatter.web_feature_id, concept.frontmatter.id);
    }
  }

  for (const claim of claims) {
    if (claim.type !== 'support' || claim.proof.kind !== 'bcd') continue;
    const { pageId } = splitClaimId(claim.id);
    addRef(bcdKeySets, claim.proof.bcdKey, pageId);
    if (claim.proof.webFeatureId) {
      addRef(featureSets, claim.proof.webFeatureId, pageId);
    }
  }

  const toSortedMap = (src: Map<string, Set<string>>): Map<string, string[]> =>
    new Map([...src.entries()].map(([k, v]) => [k, [...v].sort()]));

  return {
    featureToPages: toSortedMap(featureSets),
    bcdKeyToPages: toSortedMap(bcdKeySets),
  };
}

/** Builds a deterministic snapshot of all web-features and BCD keys referenced by content. */
export function buildSupportSnapshot(options: {
  now?: Date;
  concepts?: LoadedConcept[];
  claims?: Claim[];
} = {}): SupportSnapshot {
  const now = options.now ?? new Date();
  const { featureToPages, bcdKeyToPages } = collectSupportReferences({
    concepts: options.concepts,
    claims: options.claims,
  });

  const featureEntries: Array<[string, SupportSnapshotFeature]> = [];
  for (const webFeatureId of [...featureToPages.keys()].sort()) {
    const lookup = getBaseline(webFeatureId);
    if (!lookup.ok) continue;
    const supportEntries: Array<[string, string]> = [];
    for (const browser of CORE_BROWSERS) {
      const version = lookup.info.support[browser];
      if (version) supportEntries.push([browser, version]);
    }
    featureEntries.push([
      webFeatureId,
      {
        baseline: lookup.info.baseline,
        lowDate: lookup.info.lowDate,
        highDate: lookup.info.highDate,
        support: Object.fromEntries(supportEntries) as Partial<Record<CoreBrowser, string>>,
      },
    ]);
  }

  const bcdEntries: Array<[string, SupportSnapshotBcdKey]> = [];
  for (const bcdKey of [...bcdKeyToPages.keys()].sort()) {
    const bcd = getBcdSupport(bcdKey);
    if (!bcd.exists) continue;
    const browsers = Object.fromEntries(
      CORE_BROWSERS.map((b) => [
        b,
        {
          status: bcd.browsers[b].status,
          since: bcd.browsers[b].since,
        },
      ])
    ) as SupportSnapshotBcdKey;
    bcdEntries.push([bcdKey, browsers]);
  }

  return {
    generatedAt: now.toISOString(),
    dataVersions: getDataVersions(),
    features: sortedObject(featureEntries),
    bcdKeys: sortedObject(bcdEntries),
  };
}

export function readSupportSnapshot(filePath = getDefaultSnapshotPath()): SupportSnapshot | null {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as SupportSnapshot;
}

/**
 * Reads the committed snapshot from `git show HEAD:content/.proof-cache/support-snapshot.json`
 * so the radar compares against HEAD even if the working tree snapshot was already updated.
 */
export function readCommittedSupportSnapshot(repoRoot = SITE_ROOT): SupportSnapshot | null {
  try {
    const raw = execFileSync(
      'git',
      ['show', 'HEAD:content/.proof-cache/support-snapshot.json'],
      { cwd: repoRoot, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }
    );
    return JSON.parse(raw) as SupportSnapshot;
  } catch {
    return readSupportSnapshot(path.join(repoRoot, DEFAULT_SNAPSHOT_RELATIVE_PATH));
  }
}

export function writeSupportSnapshot(
  snapshot: SupportSnapshot,
  filePath = getDefaultSnapshotPath()
): void {
  const normalized: SupportSnapshot = {
    generatedAt: snapshot.generatedAt,
    dataVersions: {
      bcd: snapshot.dataVersions.bcd,
      webFeatures: snapshot.dataVersions.webFeatures,
    },
    features: sortedObject(Object.entries(snapshot.features)),
    bcdKeys: sortedObject(Object.entries(snapshot.bcdKeys)),
  };
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(normalized, null, 2)}\n`, 'utf-8');
}

function stableJson(value: unknown): string {
  return JSON.stringify(value);
}

export function diffSupportSnapshots(
  prev: SupportSnapshot | null,
  next: SupportSnapshot,
  refs?: {
    featureToPages?: Map<string, string[]>;
    bcdKeyToPages?: Map<string, string[]>;
  }
): SupportChange[] {
  if (!prev) return [];
  const changes: SupportChange[] = [];

  for (const id of Object.keys(next.features).sort()) {
    const before = prev.features[id];
    const after = next.features[id];
    if (!before) continue;
    if (stableJson(before) !== stableJson(after)) {
      changes.push({
        kind: 'baseline',
        id,
        before,
        after,
        affectedPages: [...(refs?.featureToPages?.get(id) ?? [])].sort(),
      });
    }
  }

  for (const id of Object.keys(next.bcdKeys).sort()) {
    const before = prev.bcdKeys[id];
    const after = next.bcdKeys[id];
    if (!before) continue;
    if (stableJson(before) !== stableJson(after)) {
      changes.push({
        kind: 'browser',
        id,
        before,
        after,
        affectedPages: [...(refs?.bcdKeyToPages?.get(id) ?? [])].sort(),
      });
    }
  }

  return changes;
}
