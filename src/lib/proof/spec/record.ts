import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { CONTENT_DIR } from '../../paths';
import type { Claim, ClaimProof } from '../claim-schema';
import { classifySpecUrl, isRejection } from './domains';
import { normalizeSpecText } from './normalize';
import { buildSpecQuoteHref } from './text-fragment';

export type SpecQuoteClaim = Claim & { proof: Extract<ClaimProof, { kind: 'spec-quote' }> };

export const SPEC_RECORD_DIR = path.join(CONTENT_DIR, '.proof-cache', 'specs');

function resolveRecordDir(recordDir?: string): string {
  if (recordDir) return recordDir;
  if (process.env.FRONTEND_ROCKS_CONTENT_DIR) {
    return path.join(path.resolve(process.env.FRONTEND_ROCKS_CONTENT_DIR), '.proof-cache', 'specs');
  }
  return SPEC_RECORD_DIR;
}

export const SpecQuoteRecordSchema = z
  .object({
    quoteOriginal: z.string().min(1).max(800),
    fragment: z.string(),
    fragmentUnique: z.boolean(),
    recordedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  })
  .strict();
export type SpecQuoteRecord = z.infer<typeof SpecQuoteRecordSchema>;

export const SpecSectionRecordSchema = z
  .object({
    blockKind: z.enum([
      'section',
      'heading-section',
      'algorithm',
      'enclosing-section',
      'element',
      'definition-table',
    ]),
    sectionTitle: z.string().nullable(),
    sectionSha256: z.string().regex(/^[0-9a-f]{64}$/),
    quotes: z.record(z.string().regex(/^[0-9a-f]{40}$/), SpecQuoteRecordSchema),
  })
  .strict();
export type SpecSectionRecord = z.infer<typeof SpecSectionRecordSchema>;

export const SpecRecordFileSchema = z
  .object({
    schemaVersion: z.literal(2),
    url: z.string().url(),
    family: z.string(),
    maturity: z.string(),
    specTitle: z.string().nullable(),
    statusText: z.string().nullable(),
    sections: z.record(z.string(), SpecSectionRecordSchema),
  })
  .strict();
export type SpecRecordFile = z.infer<typeof SpecRecordFileSchema>;

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

export function specRecordPath(canonicalUrl: string, recordDir?: string): string {
  const hash = crypto.createHash('sha1').update(canonicalUrl).digest('hex');
  return path.join(resolveRecordDir(recordDir), `${hash}.json`);
}

export function readSpecRecord(canonicalUrl: string, recordDir?: string): SpecRecordFile | null {
  const filePath = specRecordPath(canonicalUrl, recordDir);
  if (!fs.existsSync(filePath)) return null;
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  return SpecRecordFileSchema.parse(raw);
}

export function writeSpecRecord(file: SpecRecordFile, recordDir?: string): void {
  const parsed = SpecRecordFileSchema.parse(file);
  const filePath = specRecordPath(parsed.url, recordDir);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const serialized = JSON.stringify(sortKeysDeep(parsed), null, 2) + '\n';
  fs.writeFileSync(filePath, serialized, 'utf-8');
}

export function quoteKey(quote: string): string {
  return crypto.createHash('sha1').update(normalizeSpecText(quote)).digest('hex');
}

export function findQuoteRecord(
  claim: Pick<SpecQuoteClaim, 'proof'>,
  recordDir?: string
): { file: SpecRecordFile; section: SpecSectionRecord; quote: SpecQuoteRecord } | null {
  const source = classifySpecUrl(claim.proof.url);
  if (isRejection(source)) return null;
  const file = readSpecRecord(source.canonicalUrl, recordDir);
  if (!file) return null;
  const section = file.sections[claim.proof.anchor];
  if (!section) return null;
  const quote = section.quotes[quoteKey(claim.proof.quote)];
  if (!quote) return null;
  return { file, section, quote };
}

export function getSpecQuoteHref(claim: Pick<SpecQuoteClaim, 'proof'>, recordDir?: string): string {
  const source = classifySpecUrl(claim.proof.url);
  const canonicalUrl = isRejection(source) ? claim.proof.url : source.canonicalUrl;
  const rec = findQuoteRecord(claim, recordDir);
  return buildSpecQuoteHref(canonicalUrl, claim.proof.anchor, rec?.quote.fragment ?? '');
}

export function pruneSpecRecords(
  claims: SpecQuoteClaim[],
  recordDir?: string
): { removedFiles: number; removedSections: number; removedQuotes: number } {
  const dir = resolveRecordDir(recordDir);
  if (!fs.existsSync(dir)) return { removedFiles: 0, removedSections: 0, removedQuotes: 0 };

  const live = new Map<string, Map<string, Set<string>>>();
  for (const claim of claims) {
    const source = classifySpecUrl(claim.proof.url);
    if (isRejection(source)) continue;
    let anchors = live.get(source.canonicalUrl);
    if (!anchors) {
      anchors = new Map();
      live.set(source.canonicalUrl, anchors);
    }
    let keys = anchors.get(claim.proof.anchor);
    if (!keys) {
      keys = new Set();
      anchors.set(claim.proof.anchor, keys);
    }
    keys.add(quoteKey(claim.proof.quote));
  }

  let removedFiles = 0;
  let removedSections = 0;
  let removedQuotes = 0;

  for (const entry of fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort()) {
    const filePath = path.join(dir, entry);
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    const file = SpecRecordFileSchema.parse(raw);
    const liveAnchors = live.get(file.url);

    if (!liveAnchors) {
      for (const sec of Object.values(file.sections)) {
        removedSections++;
        removedQuotes += Object.keys(sec.quotes).length;
      }
      fs.unlinkSync(filePath);
      removedFiles++;
      continue;
    }

    let modified = false;
    const nextSections: Record<string, SpecSectionRecord> = {};
    for (const [anchor, sec] of Object.entries(file.sections)) {
      const liveQuotes = liveAnchors.get(anchor);
      if (!liveQuotes) {
        removedSections++;
        removedQuotes += Object.keys(sec.quotes).length;
        modified = true;
        continue;
      }
      const nextQuotes: Record<string, SpecQuoteRecord> = {};
      for (const [qk, qrec] of Object.entries(sec.quotes)) {
        if (liveQuotes.has(qk)) {
          nextQuotes[qk] = qrec;
        } else {
          removedQuotes++;
          modified = true;
        }
      }
      if (Object.keys(nextQuotes).length === 0) {
        removedSections++;
        modified = true;
      } else {
        nextSections[anchor] = { ...sec, quotes: nextQuotes };
      }
    }

    if (Object.keys(nextSections).length === 0) {
      fs.unlinkSync(filePath);
      removedFiles++;
    } else if (modified) {
      writeSpecRecord({ ...file, sections: nextSections }, dir);
    }
  }

  return { removedFiles, removedSections, removedQuotes };
}
