import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { CONTENT_DIR } from '../../paths';

export const COVERAGE_CACHE_DIR = path.join(CONTENT_DIR, '.proof-cache', 'coverage');

export const CoverageLabelSchema = z.enum(['factual', 'non-factual', 'ok', 'overreach']);
export type CoverageLabel = z.infer<typeof CoverageLabelSchema>;

export const CoverageMetaSchema = z
  .object({
    schemaVersion: z.literal(1),
    epochs: z
      .object({
        classifier: z.string().regex(/^[0-9a-f]{16}$/),
        overreach: z.string().regex(/^[0-9a-f]{16}$/),
      })
      .strict(),
  })
  .strict();
export type CoverageMeta = z.infer<typeof CoverageMetaSchema>;

export const CoveragePageFileSchema = z
  .object({
    schemaVersion: z.literal(1),
    labels: z.record(z.string().regex(/^[0-9a-f]{40}$/), CoverageLabelSchema),
  })
  .strict();
export type CoveragePageFile = z.infer<typeof CoveragePageFileSchema>;

function resolveCoverageCacheDir(cacheDir?: string): string {
  if (cacheDir) return cacheDir;
  if (process.env.FRONTEND_ROCKS_CONTENT_DIR) {
    return path.join(path.resolve(process.env.FRONTEND_ROCKS_CONTENT_DIR), '.proof-cache', 'coverage');
  }
  return COVERAGE_CACHE_DIR;
}

export function coverageMetaPath(cacheDir?: string): string {
  return path.join(resolveCoverageCacheDir(cacheDir), '_meta.json');
}

export function coveragePagePath(pageId: string, cacheDir?: string): string {
  return path.join(resolveCoverageCacheDir(cacheDir), `${pageId}.json`);
}

export function readCoverageMeta(cacheDir?: string): CoverageMeta | null {
  const filePath = coverageMetaPath(cacheDir);
  if (!fs.existsSync(filePath)) return null;
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  return CoverageMetaSchema.parse(raw);
}

export function writeCoverageMeta(meta: CoverageMeta, cacheDir?: string): void {
  const parsed = CoverageMetaSchema.parse(meta);
  const filePath = coverageMetaPath(cacheDir);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const normalized: CoverageMeta = {
    schemaVersion: 1,
    epochs: {
      classifier: parsed.epochs.classifier,
      overreach: parsed.epochs.overreach,
    },
  };
  fs.writeFileSync(filePath, JSON.stringify(normalized, null, 2) + '\n', 'utf-8');
}

export function readCoverageLabels(pageId: string, cacheDir?: string): Map<string, CoverageLabel> {
  const filePath = coveragePagePath(pageId, cacheDir);
  if (!fs.existsSync(filePath)) return new Map();
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  const parsed = CoveragePageFileSchema.parse(raw);
  return new Map(Object.entries(parsed.labels));
}

export function writeCoverageLabels(
  pageId: string,
  labels: Map<string, CoverageLabel>,
  cacheDir?: string
): void {
  const sortedRecord: Record<string, CoverageLabel> = {};
  for (const key of [...labels.keys()].sort()) {
    const val = labels.get(key);
    if (val !== undefined) sortedRecord[key] = val;
  }
  const parsed = CoveragePageFileSchema.parse({
    schemaVersion: 1,
    labels: sortedRecord,
  });
  const filePath = coveragePagePath(pageId, cacheDir);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(parsed, null, 2) + '\n', 'utf-8');
}

/** Removes keys not present in `referencedKeys` from the page cache file; returns count removed. */
export function pruneCoverageLabels(
  pageId: string,
  referencedKeys: Set<string>,
  cacheDir?: string
): number {
  const filePath = coveragePagePath(pageId, cacheDir);
  if (!fs.existsSync(filePath)) return 0;
  const current = readCoverageLabels(pageId, cacheDir);
  let removed = 0;
  const kept = new Map<string, CoverageLabel>();
  for (const [key, val] of current.entries()) {
    if (referencedKeys.has(key)) {
      kept.set(key, val);
    } else {
      removed += 1;
    }
  }
  if (removed > 0) {
    writeCoverageLabels(pageId, kept, cacheDir);
  }
  return removed;
}
