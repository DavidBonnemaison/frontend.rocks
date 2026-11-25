import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCliArgs } from '../../src/lib/cli-args';
import { CONTENT_DIR, SITE_ROOT } from '../../src/lib/paths';
import { ClaimsFileSchema, UNANCHORED, type Claim, type ClaimsFile } from '../../src/lib/proof/claim-schema';
import { EvidenceDossierSchema, type EvidenceDossier } from '../../src/lib/schemas';

export interface SkippedExtract {
  pageId: string;
  index: number;
  reason: 'statement-too-long' | 'quote-length' | 'invalid-url';
  sourceUrl: string;
}

export interface MigrationResult {
  file: ClaimsFile | null;
  skipped: SkippedExtract[];
}

export function slugify(input: string, max = 40): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max)
    .replace(/-+$/g, '');
}

export function toStatement(quote: string): string | null {
  const normalized = quote.replace(/\s+/g, ' ').trim();
  if (normalized.length <= 280) return normalized.length >= 20 ? normalized : null;
  const match = normalized.match(/^(.+?\.)(\s|$)/);
  const first = match?.[1];
  return first && first.length >= 20 && first.length <= 280 ? first : null;
}

export function splitUrl(raw: string): { url: string; anchor: string } | null {
  try {
    const u = new URL(raw);
    const rawAnchor = u.hash.replace(/^#/, '');
    u.hash = '';
    let anchor = UNANCHORED;
    if (rawAnchor.length > 0) {
      try {
        anchor = decodeURIComponent(rawAnchor);
      } catch {
        anchor = rawAnchor;
      }
    }
    return { url: u.toString(), anchor };
  } catch {
    return null;
  }
}

export function migrateDossier(dossier: EvidenceDossier): MigrationResult {
  const pageId = dossier.concept_id;
  const skipped: SkippedExtract[] = [];
  const claims: Claim[] = [];
  const usedSlugs = new Set<string>();

  dossier.normative_extracts.forEach((extract, index) => {
    const parts = splitUrl(extract.source_url);
    if (!parts) {
      skipped.push({ pageId, index, reason: 'invalid-url', sourceUrl: extract.source_url });
      return;
    }
    const quote = extract.quote.trim();
    if (quote.length < 20 || quote.length > 600) {
      skipped.push({ pageId, index, reason: 'quote-length', sourceUrl: extract.source_url });
      return;
    }
    const statement = toStatement(quote);
    if (!statement) {
      skipped.push({ pageId, index, reason: 'statement-too-long', sourceUrl: extract.source_url });
      return;
    }
    let slug = `spec-${slugify(extract.spec_section) || 'section'}-${index + 1}`;
    while (usedSlugs.has(slug)) slug = `${slug}-b`;
    usedSlugs.add(slug);

    claims.push({
      id: `${pageId}/${slug}`,
      type: 'normative',
      statement,
      proof: { kind: 'spec-quote', url: parts.url, anchor: parts.anchor, quote },
    });
  });

  if (claims.length === 0) return { file: null, skipped };
  return { file: ClaimsFileSchema.parse({ pageId, claims }), skipped };
}

function main(): void {
  const args = parseCliArgs(process.argv.slice(2), { force: 'boolean', 'dry-run': 'boolean' });
  const force = args.force === true;
  const dryRun = args['dry-run'] === true;
  const evidenceDir = path.join(CONTENT_DIR, 'evidence');
  const claimsDir = path.join(CONTENT_DIR, 'claims');
  const reportPath = path.join(SITE_ROOT, 'artifacts', 'migration', 'evidence-to-claims.json');

  const files = fs
    .readdirSync(evidenceDir)
    .filter((f) => f.endsWith('.evidence-dossier.json'))
    .sort();
  const report = {
    written: [] as string[],
    keptExisting: [] as string[],
    empty: [] as string[],
    skipped: [] as SkippedExtract[],
    unanchored: 0,
    totalClaims: 0,
  };

  if (!dryRun) fs.mkdirSync(claimsDir, { recursive: true });

  for (const file of files) {
    const dossier = EvidenceDossierSchema.parse(
      JSON.parse(fs.readFileSync(path.join(evidenceDir, file), 'utf-8'))
    );
    const { file: claimsFile, skipped } = migrateDossier(dossier);
    report.skipped.push(...skipped);
    if (!claimsFile) {
      report.empty.push(dossier.concept_id);
      continue;
    }
    const target = path.join(claimsDir, `${claimsFile.pageId}.claims.json`);
    if (fs.existsSync(target) && !force) {
      report.keptExisting.push(claimsFile.pageId);
      continue;
    }
    report.totalClaims += claimsFile.claims.length;
    report.unanchored += claimsFile.claims.filter(
      (c) => c.proof.kind === 'spec-quote' && c.proof.anchor === UNANCHORED
    ).length;
    if (!dryRun) fs.writeFileSync(target, JSON.stringify(claimsFile, null, 2) + '\n');
    report.written.push(claimsFile.pageId);
  }

  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
  console.log(
    `✅ Migrated ${report.written.length} dossier(s), ${report.totalClaims} claim(s) (${report.unanchored} unanchored), ` +
      `${report.skipped.length} extract(s) skipped, ${report.keptExisting.length} existing file(s) kept. Report: ${path.relative(SITE_ROOT, reportPath)}`
  );
}

const currentFile = typeof __filename !== 'undefined' ? __filename : fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(currentFile)) {
  main();
}
