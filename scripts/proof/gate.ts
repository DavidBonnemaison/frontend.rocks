import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import { parseCliArgs } from '../../src/lib/cli-args';
import { CONTENT_DIR, SITE_ROOT } from '../../src/lib/paths';
import { ClaimsFileSchema, type Claim } from '../../src/lib/proof/claim-schema';
import { getAllClaimsFiles } from '../../src/lib/proof/claims-loader';
import { evaluateGate } from '../../src/lib/proof/gate';
import { getAllPageRefs } from '../../src/lib/proof/page-registry';
import {
  emptyProofResults,
  ExperimentRunReportSchema,
  ProofResultsSchema,
  type ExperimentRunReport,
  type ProofResults,
} from '../../src/lib/proof/results-schema';

function gitShow(ref: string, relPath: string): string | null {
  try {
    return execFileSync('git', ['show', `${ref}:${relPath}`], {
      cwd: SITE_ROOT,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch {
    return null;
  }
}

function computeChangedFiles(base: string, allPages: boolean): Set<string> | 'all' {
  if (allPages) {
    console.log('ℹ️ Gate mode: --all-pages (strict: all claims treated as touched)');
    return 'all';
  }
  try {
    const diffOut = execFileSync('git', ['diff', '--name-only', `${base}...HEAD`], {
      cwd: SITE_ROOT,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const statusOut = execFileSync('git', ['status', '--porcelain'], {
      cwd: SITE_ROOT,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const set = new Set<string>();
    for (const line of diffOut.split('\n')) {
      const trimmed = line.trim();
      if (trimmed) set.add(trimmed);
    }
    for (const line of statusOut.split('\n')) {
      if (!line.trim()) continue;
      const rawPath = line.slice(3).trim();
      const arrowIdx = rawPath.indexOf(' -> ');
      set.add(arrowIdx >= 0 ? rawPath.slice(arrowIdx + 4) : rawPath);
    }
    console.log(`ℹ️ Gate mode: changed against ${base} (${set.size} file(s) changed)`);
    return set;
  } catch (err) {
    console.warn(
      `⚠️  Gate mode: git diff against "${base}" unavailable (${(err as Error).message.trim()}); falling back to --all-pages (strict)`
    );
    return 'all';
  }
}

function readResultsFile(filePath: string): ProofResults {
  if (!fs.existsSync(filePath)) return emptyProofResults();
  return ProofResultsSchema.parse(JSON.parse(fs.readFileSync(filePath, 'utf-8')));
}

function readExperimentReports(artifactsDir: string): ExperimentRunReport[] {
  if (!fs.existsSync(artifactsDir)) return [];
  return fs
    .readdirSync(artifactsDir)
    .filter((f) => /^experiments(?:\..+)?\.json$/.test(f))
    .sort()
    .map((f) =>
      ExperimentRunReportSchema.parse(
        JSON.parse(fs.readFileSync(path.join(artifactsDir, f), 'utf-8'))
      )
    );
}

function parseVsPairsProofStatus(raw: string): Map<string, 'proven' | 'unverified'> {
  const map = new Map<string, 'proven' | 'unverified'>();
  try {
    const parsed = JSON.parse(raw) as unknown;
    const entries = Array.isArray(parsed)
      ? parsed
      : parsed && typeof parsed === 'object' && 'pairs' in parsed && Array.isArray((parsed as { pairs: unknown[] }).pairs)
        ? (parsed as { pairs: unknown[] }).pairs
        : [];
    for (const item of entries) {
      if (item && typeof item === 'object' && 'slug' in item && 'proof_status' in item) {
        const slug = String((item as { slug: unknown }).slug);
        const st = (item as { proof_status: unknown }).proof_status;
        if (st === 'proven' || st === 'unverified') {
          map.set(`vs-${slug}`, st);
        }
      }
    }
  } catch {
    // Ignore malformed historical file.
  }
  return map;
}

function main(): void {
  const args = parseCliArgs(process.argv.slice(2), {
    results: 'string',
    baseline: 'string',
    'changed-base': 'string',
    'all-pages': 'boolean',
    'report-only': 'boolean',
  });

  const artifactsDir = path.join(SITE_ROOT, 'artifacts', 'proof');
  const previewPath = path.resolve(
    SITE_ROOT,
    args.results ?? path.join('artifacts', 'proof', 'latest.preview.json')
  );
  const baselinePath = path.resolve(
    SITE_ROOT,
    args.baseline ?? path.relative(SITE_ROOT, path.join(CONTENT_DIR, '.proof-results', 'latest.json'))
  );
  const baseRef = args['changed-base'] ?? 'origin/main';

  const preview = readResultsFile(previewPath);
  const baseline = readResultsFile(baselinePath);
  const runReports = readExperimentReports(artifactsDir);
  const changedFiles = computeChangedFiles(baseRef, Boolean(args['all-pages']));

  const { pages } = getAllPageRefs();
  const claimsByPage = new Map<string, Claim[]>(
    [...getAllClaimsFiles().entries()].map(([pageId, file]) => [pageId, file.claims])
  );

  // Baseline claims for modified claims files only.
  const baselineClaimsByPage = new Map<string, Claim[]>();
  if (changedFiles !== 'all') {
    for (const file of changedFiles) {
      const m = file.match(/^content\/claims\/([a-z0-9-]+)\.claims\.json$/);
      if (!m) continue;
      const raw = gitShow(baseRef, file);
      if (!raw) continue;
      try {
        const parsed = ClaimsFileSchema.parse(JSON.parse(raw));
        baselineClaimsByPage.set(m[1], parsed.claims);
      } catch {
        // Treat invalid historical claims file as absent so all current claims count as modified.
      }
    }
  }

  // Baseline proof_status for all pages (only read git show for modified MDX or pairs.json).
  const baselineProofStatus = new Map<string, 'proven' | 'unverified' | null>();
  const vsPairsChanged = changedFiles !== 'all' && changedFiles.has('content/vs/pairs.json');
  const baselineVsMap = vsPairsChanged
    ? parseVsPairsProofStatus(gitShow(baseRef, 'content/vs/pairs.json') ?? '')
    : null;

  for (const page of pages) {
    if (changedFiles === 'all') {
      baselineProofStatus.set(page.id, page.proofStatus);
      continue;
    }
    if (page.mdxPath && changedFiles.has(page.mdxPath)) {
      const raw = gitShow(baseRef, page.mdxPath);
      if (!raw) {
        baselineProofStatus.set(page.id, null);
      } else {
        const fm = matter(raw).data as { proof_status?: unknown };
        baselineProofStatus.set(
          page.id,
          fm.proof_status === 'proven' || fm.proof_status === 'unverified'
            ? fm.proof_status
            : null
        );
      }
    } else if (page.kind === 'vs' && baselineVsMap) {
      baselineProofStatus.set(page.id, baselineVsMap.get(page.id) ?? null);
    } else {
      baselineProofStatus.set(page.id, page.proofStatus);
    }
  }

  const outcome = evaluateGate({
    pages,
    claimsByPage,
    preview,
    baseline,
    baselineClaimsByPage,
    baselineProofStatus,
    runReports,
    changedFiles,
  });

  for (const w of outcome.warnings) console.warn(w);
  for (const e of outcome.errors) console.error(`❌ ${e}`);

  fs.mkdirSync(artifactsDir, { recursive: true });
  fs.writeFileSync(
    path.join(artifactsDir, 'gate.json'),
    JSON.stringify(outcome, null, 2) + '\n'
  );

  if (process.env.GITHUB_STEP_SUMMARY) {
    const lines = [
      '## Proof gate',
      '',
      `- **status**: ${outcome.ok ? 'pass' : args['report-only'] ? 'report-only (errors recorded)' : 'fail'}`,
      `- **errors**: ${outcome.errors.length}`,
      `- **warnings**: ${outcome.warnings.length}`,
      '',
    ];
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join('\n'));
  }

  if (!outcome.ok && !args['report-only']) {
    console.error(`❌ Proof gate failed with ${outcome.errors.length} error(s).`);
    process.exit(1);
  }
  console.log(
    `✅ Proof gate passed (${outcome.errors.length} error(s), ${outcome.warnings.length} warning(s)).`
  );
}

main();
