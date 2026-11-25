import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { CONTENT_DIR } from '../../paths';
import { SOURCE_REPOS, type Claim, type ClaimProof } from '../claim-schema';
import type { SourceRepo } from './repos';

export type SourceQuoteClaim = Claim & {
  proof: Extract<ClaimProof, { kind: 'source-quote' }>;
};

export const SOURCE_RECORD_DIR = path.join(CONTENT_DIR, '.proof-cache', 'sources');

function resolveRecordDir(recordDir?: string): string {
  if (recordDir) return recordDir;
  if (process.env.FRONTEND_ROCKS_CONTENT_DIR) {
    return path.join(
      path.resolve(process.env.FRONTEND_ROCKS_CONTENT_DIR),
      '.proof-cache',
      'sources'
    );
  }
  return SOURCE_RECORD_DIR;
}

export const SourceExcerptRecordSchema = z
  .object({
    quoteSha256: z.string().regex(/^[0-9a-f]{64}$/),
    recordedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  })
  .strict();
export type SourceExcerptRecord = z.infer<typeof SourceExcerptRecordSchema>;

export const SourceRecordFileSchema = z
  .object({
    schemaVersion: z.literal(2),
    repo: z.enum(SOURCE_REPOS),
    commit: z.string().regex(/^[0-9a-f]{40}$/),
    path: z.string().min(1),
    excerpts: z.record(z.string().regex(/^\d+-\d+$/), SourceExcerptRecordSchema),
  })
  .strict();
export type SourceRecordFile = z.infer<typeof SourceRecordFileSchema>;

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value !== null && typeof value === 'object') {
    const sorted: Record<string, unknown> = {};
    for (const k of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[k] = sortKeysDeep((value as Record<string, unknown>)[k]);
    }
    return sorted;
  }
  return value;
}

export function linesKey(lines: readonly [number, number]): string {
  return `${lines[0]}-${lines[1]}`;
}

export function quoteSha256(quote: string): string {
  return crypto.createHash('sha256').update(quote).digest('hex');
}

export function sourceRecordPath(
  repo: SourceRepo,
  commit: string,
  filePath: string,
  recordDir?: string
): string {
  const hash = crypto.createHash('sha1').update(`${repo}@${commit}:${filePath}`).digest('hex');
  return path.join(resolveRecordDir(recordDir), `${hash}.json`);
}

export function readSourceRecord(
  repo: SourceRepo,
  commit: string,
  filePath: string,
  recordDir?: string
): SourceRecordFile | null {
  const target = sourceRecordPath(repo, commit, filePath, recordDir);
  if (!fs.existsSync(target)) return null;
  const raw = JSON.parse(fs.readFileSync(target, 'utf8'));
  return SourceRecordFileSchema.parse(raw);
}

export function writeSourceRecord(file: SourceRecordFile, recordDir?: string): void {
  const parsed = SourceRecordFileSchema.parse(file);
  const target = sourceRecordPath(parsed.repo, parsed.commit, parsed.path, recordDir);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const serialized = JSON.stringify(sortKeysDeep(parsed), null, 2) + '\n';
  fs.writeFileSync(target, serialized, 'utf8');
}

/**
 * Looks up a committed source excerpt record matching the claim's repo, commit, path,
 * line range, and SHA-256 of the normalized quote.
 */
export function findExcerptRecord(
  claim: Pick<SourceQuoteClaim, 'proof'>,
  recordDir?: string
): { file: SourceRecordFile; excerpt: SourceExcerptRecord } | null {
  const { repo, commit, path: filePath, lines, quote } = claim.proof;
  const file = readSourceRecord(repo, commit, filePath, recordDir);
  if (!file) return null;
  const excerpt = file.excerpts[linesKey(lines)];
  if (!excerpt) return null;
  if (excerpt.quoteSha256 !== quoteSha256(quote)) return null;
  return { file, excerpt };
}

export function recordSourceExcerpt(
  claim: Pick<SourceQuoteClaim, 'proof'>,
  recordedOn: string,
  recordDir?: string
): void {
  const { repo, commit, path: filePath, lines, quote } = claim.proof;
  const existing = readSourceRecord(repo, commit, filePath, recordDir);
  const next: SourceRecordFile = existing
    ? {
        ...existing,
        excerpts: {
          ...existing.excerpts,
          [linesKey(lines)]: {
            quoteSha256: quoteSha256(quote),
            recordedOn,
          },
        },
      }
    : {
        schemaVersion: 2,
        repo,
        commit,
        path: filePath,
        excerpts: {
          [linesKey(lines)]: {
            quoteSha256: quoteSha256(quote),
            recordedOn,
          },
        },
      };
  writeSourceRecord(next, recordDir);
}

export function pruneSourceRecords(
  claims: SourceQuoteClaim[],
  recordDir?: string
): { removedFiles: number; removedExcerpts: number } {
  const dir = resolveRecordDir(recordDir);
  if (!fs.existsSync(dir)) return { removedFiles: 0, removedExcerpts: 0 };

  const live = new Map<string, Map<string, Set<string>>>();
  for (const claim of claims) {
    const { repo, commit, path: filePath, lines, quote } = claim.proof;
    const fileKey = `${repo}@${commit}:${filePath}`;
    let ranges = live.get(fileKey);
    if (!ranges) {
      ranges = new Map();
      live.set(fileKey, ranges);
    }
    const rangeKey = linesKey(lines);
    let hashes = ranges.get(rangeKey);
    if (!hashes) {
      hashes = new Set();
      ranges.set(rangeKey, hashes);
    }
    hashes.add(quoteSha256(quote));
  }

  let removedFiles = 0;
  let removedExcerpts = 0;

  for (const entry of fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort()) {
    const target = path.join(dir, entry);
    const raw = JSON.parse(fs.readFileSync(target, 'utf8'));
    const file = SourceRecordFileSchema.parse(raw);
    const fileKey = `${file.repo}@${file.commit}:${file.path}`;
    const liveRanges = live.get(fileKey);

    if (!liveRanges) {
      removedExcerpts += Object.keys(file.excerpts).length;
      fs.unlinkSync(target);
      removedFiles++;
      continue;
    }

    let modified = false;
    const nextExcerpts: Record<string, SourceExcerptRecord> = {};
    for (const [rangeKey, rec] of Object.entries(file.excerpts)) {
      const hashes = liveRanges.get(rangeKey);
      if (hashes && hashes.has(rec.quoteSha256)) {
        nextExcerpts[rangeKey] = rec;
      } else {
        removedExcerpts++;
        modified = true;
      }
    }

    if (Object.keys(nextExcerpts).length === 0) {
      fs.unlinkSync(target);
      removedFiles++;
    } else if (modified) {
      writeSourceRecord({ ...file, excerpts: nextExcerpts }, dir);
    }
  }

  return { removedFiles, removedExcerpts };
}
