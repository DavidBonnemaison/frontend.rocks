import fs from 'node:fs';
import path from 'node:path';
import { CONTENT_DIR, SITE_ROOT } from '../paths';
import { ClaimsFileSchema, type Claim, type ClaimsFile } from './claim-schema';

export const CLAIMS_DIR = path.join(CONTENT_DIR, 'claims');
export const CLAIMS_FILE_SUFFIX = '.claims.json';

let cache: Map<string, ClaimsFile> | null = null;

function formatZodError(err: unknown): string {
  if (err && typeof err === 'object' && 'issues' in err && Array.isArray((err as { issues: unknown[] }).issues)) {
    return (err as { issues: Array<{ path: PropertyKey[]; message: string }> }).issues
      .map((i) => `  - ${i.path.map(String).join('.') || '(root)'}: ${i.message}`)
      .join('\n');
  }
  return err instanceof Error ? err.message : String(err);
}

export function parseClaimsFile(raw: unknown, label: string): ClaimsFile {
  const result = ClaimsFileSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(`Invalid claims file ${label}:\n${formatZodError(result.error)}`);
  }
  return result.data;
}

export function readClaimsFileFromDisk(filePath: string): ClaimsFile {
  const label = path.relative(SITE_ROOT, filePath);
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch (err) {
    throw new Error(`Cannot parse JSON in ${label}: ${err instanceof Error ? err.message : String(err)}`);
  }
  const parsed = parseClaimsFile(raw, label);
  const expectedPageId = path.basename(filePath, CLAIMS_FILE_SUFFIX);
  if (parsed.pageId !== expectedPageId) {
    throw new Error(`${label}: pageId "${parsed.pageId}" does not match file name "${expectedPageId}"`);
  }
  return parsed;
}

/** Loads all claims files. Result is cached for the lifetime of the process. */
export function getAllClaimsFiles(): Map<string, ClaimsFile> {
  if (cache) return cache;
  const map = new Map<string, ClaimsFile>();
  if (fs.existsSync(CLAIMS_DIR)) {
    const files = fs
      .readdirSync(CLAIMS_DIR)
      .filter((f) => f.endsWith(CLAIMS_FILE_SUFFIX))
      .sort();
    for (const file of files) {
      const parsed = readClaimsFileFromDisk(path.join(CLAIMS_DIR, file));
      map.set(parsed.pageId, parsed);
    }
  }
  cache = map;
  return map;
}

export function getClaimsForPage(pageId: string): ClaimsFile | null {
  return getAllClaimsFiles().get(pageId) ?? null;
}

export function getAllClaims(): Claim[] {
  return [...getAllClaimsFiles().values()].flatMap((f) => f.claims);
}

export function getClaimById(id: string): Claim | null {
  for (const file of getAllClaimsFiles().values()) {
    const found = file.claims.find((c) => c.id === id);
    if (found) return found;
  }
  return null;
}

/** Intended for tests and scripts that write claims and reload them. */
export function resetClaimsCache(): void {
  cache = null;
}
