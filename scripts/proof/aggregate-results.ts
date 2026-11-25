import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCliArgs } from '../../src/lib/cli-args';
import { CONTENT_DIR, SITE_ROOT } from '../../src/lib/paths';
import { readProofArtifact } from '../../src/lib/proof/artifact-io';
import {
  ARTIFACT_KINDS,
  type ArtifactKind,
  type ProofArtifact,
} from '../../src/lib/proof/artifact-schema';
import { ENGINE_IDS, type Claim } from '../../src/lib/proof/claim-schema';
import {
  computeClaimResults,
  nextDemotedPages,
  pagesToDemote,
  pagesToPromote,
} from '../../src/lib/proof/claim-status';
import { getAllClaims, getAllClaimsFiles } from '../../src/lib/proof/claims-loader';
import { loadExperimentBundle, loadExperimentIndex } from '../../src/lib/proof/experiment-bundles';
import type { ExperimentBundleIndexEntry } from '../../src/lib/proof/experiment-schema';
import { getAllPageRefs } from '../../src/lib/proof/page-registry';
import {
  emptyProofResults,
  ExperimentRunReportSchema,
  ProofResultsSchema,
  type ExperimentRunReport,
  type ProofResults,
} from '../../src/lib/proof/results-schema';
import { RUNTIME_VERSION } from '../../src/lib/proof/runtime/protocol';

/** Recursively sorts object keys so committed JSON diffs stay minimal and deterministic. */
export function sortKeysDeep<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((item) => sortKeysDeep(item)) as unknown as T;
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(value as Record<string, unknown>).sort()) {
    sorted[key] = sortKeysDeep((value as Record<string, unknown>)[key]);
  }
  return sorted as T;
}

export interface MergeExperimentsOutcome {
  experiments: ProofResults['experiments'];
  experimentMeta: ProofResults['experimentMeta'];
  engines: ProofResults['engines'];
  runner: ProofResults['runner'];
  freshExperiments: Set<string>;
}

/**
 * Pure merge of previous results with zero or more experiment run reports (shards).
 * Removes experiments absent from `index` and expect keys absent from `expectKeysByExperiment`.
 */
export function mergeExperimentReports(
  previous: ProofResults,
  reports: ExperimentRunReport[],
  index: ExperimentBundleIndexEntry[],
  expectKeysByExperiment?: Map<string, Set<string>>
): MergeExperimentsOutcome {
  const validExpIds = new Set(index.map((e) => e.id));
  const sortedReports = [...reports].sort((a, b) => a.generatedAt.localeCompare(b.generatedAt));

  const experiments: ProofResults['experiments'] = {};
  for (const [expId, cases] of Object.entries(previous.experiments)) {
    if (!validExpIds.has(expId)) continue;
    const validKeys = expectKeysByExperiment?.get(expId);
    const copiedCases: Record<string, ProofResults['experiments'][string][string]> = {};
    for (const [key, engineMap] of Object.entries(cases)) {
      if (validKeys && !validKeys.has(key)) continue;
      copiedCases[key] = { ...engineMap };
    }
    experiments[expId] = copiedCases;
  }

  const experimentMeta: ProofResults['experimentMeta'] = {};
  for (const [expId, meta] of Object.entries(previous.experimentMeta)) {
    if (!validExpIds.has(expId)) continue;
    experimentMeta[expId] = { ...meta, vacuity: { ...meta.vacuity } };
  }

  const engines: ProofResults['engines'] = { ...previous.engines };
  let runner = { ...previous.runner };
  const freshExperiments = new Set<string>();

  for (const report of sortedReports) {
    runner = { ...report.runner };
    for (const engine of ENGINE_IDS) {
      if (report.engines[engine]) engines[engine] = report.engines[engine];
    }

    for (const [expId, entry] of Object.entries(report.experiments)) {
      if (!validExpIds.has(expId)) continue;
      freshExperiments.add(expId);

      const validKeys = expectKeysByExperiment?.get(expId);
      if (!experiments[expId]) experiments[expId] = {};
      for (const [key, engineMap] of Object.entries(entry.cases)) {
        if (validKeys && !validKeys.has(key)) continue;
        if (!experiments[expId][key]) experiments[expId][key] = {};
        for (const engine of ENGINE_IDS) {
          if (engineMap[engine]) {
            experiments[expId][key][engine] = engineMap[engine];
          }
        }
      }

      const prevMeta = experimentMeta[expId];
      experimentMeta[expId] = {
        sourceHash: entry.sourceHash,
        runtimeVersion: entry.runtimeVersion,
        vacuity: { ...(prevMeta?.vacuity ?? {}), ...entry.vacuity },
        checkedAt: report.generatedAt,
      };
    }
  }

  return { experiments, experimentMeta, engines, runner, freshExperiments };
}

function readExperimentReports(artifactsDir: string): ExperimentRunReport[] {
  if (!fs.existsSync(artifactsDir)) return [];
  const files = fs
    .readdirSync(artifactsDir)
    .filter((f) => /^experiments(?:\..+)?\.json$/.test(f))
    .sort();
  return files.map((f) => {
    const full = path.join(artifactsDir, f);
    let raw: unknown;
    try {
      raw = JSON.parse(fs.readFileSync(full, 'utf-8'));
    } catch (err) {
      throw new Error(`Invalid JSON in ${full}: ${(err as Error).message}`);
    }
    const parsed = ExperimentRunReportSchema.safeParse(raw);
    if (!parsed.success) {
      throw new Error(
        `Invalid experiment run report ${full}: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`
      );
    }
    return parsed.data;
  });
}

function readVerifierReports(artifactsDir: string): Map<ArtifactKind, ProofArtifact> {
  const map = new Map<ArtifactKind, ProofArtifact>();
  if (!fs.existsSync(artifactsDir)) return map;
  for (const kind of ARTIFACT_KINDS) {
    const file = path.join(artifactsDir, `${kind}.json`);
    if (fs.existsSync(file)) {
      map.set(kind, readProofArtifact(file));
    }
  }
  return map;
}

function renderSummary(
  results: ProofResults,
  demotedCount: number,
  promotedCount: number
): string {
  const counts: Record<string, number> = {
    proven: 0,
    diverges: 0,
    failed: 0,
    stale: 0,
    pending: 0,
  };
  const nonProven: Array<[string, ProofResults['claims'][string]]> = [];
  for (const [id, c] of Object.entries(results.claims).sort(([a], [b]) => a.localeCompare(b))) {
    counts[c.status] = (counts[c.status] ?? 0) + 1;
    if (c.status !== 'proven') nonProven.push([id, c]);
  }

  const lines: string[] = [
    '## Proof summary',
    '',
    `- **proven**: ${counts.proven}`,
    `- **diverges**: ${counts.diverges}`,
    `- **failed**: ${counts.failed}`,
    `- **stale**: ${counts.stale}`,
    `- **pending**: ${counts.pending}`,
    `- **demotions queued**: ${demotedCount}`,
    `- **promotions queued**: ${promotedCount}`,
  ];

  if (nonProven.length > 0) {
    lines.push('', '### Non-proven claims (first 50)', '');
    for (const [id, c] of nonProven.slice(0, 50)) {
      const extra = c.detail ?? c.reason ?? '';
      lines.push(`- \`${id}\`: **${c.status}**${extra ? ` — ${extra}` : ''}`);
    }
    if (nonProven.length > 50) {
      lines.push(`- ... and ${nonProven.length - 50} more`);
    }
  }

  lines.push('');
  return lines.join('\n');
}

function main(): void {
  const args = parseCliArgs(process.argv.slice(2), {
    previous: 'string',
    out: 'string',
  });

  const artifactsDir = path.join(SITE_ROOT, 'artifacts', 'proof');
  const committedLatest = path.resolve(CONTENT_DIR, '.proof-results', 'latest.json');
  const previousPath = path.resolve(SITE_ROOT, args.previous ?? path.relative(SITE_ROOT, committedLatest));
  const outPath = path.resolve(SITE_ROOT, args.out ?? path.join('artifacts', 'proof', 'latest.preview.json'));

  if (outPath === committedLatest) {
    console.error(
      'Refusing to write directly to content/.proof-results/latest.json (single-writer rule: only the nightly publish job commits latest.json).'
    );
    process.exit(2);
  }

  const previous = fs.existsSync(previousPath)
    ? ProofResultsSchema.parse(JSON.parse(fs.readFileSync(previousPath, 'utf-8')))
    : emptyProofResults();

  const index = loadExperimentIndex();
  const currentSourceHashes = new Map<string, string>(index.map((e) => [e.id, e.sourceHash]));
  const currentExpectKeys = new Map<string, Set<string>>();
  for (const entry of index) {
    const bundle = loadExperimentBundle(entry.id);
    currentExpectKeys.set(entry.id, new Set(Object.keys(bundle.expect)));
  }

  const experimentReports = readExperimentReports(artifactsDir);
  const verifierReports = readVerifierReports(artifactsDir);
  const merged = mergeExperimentReports(previous, experimentReports, index, currentExpectKeys);

  const now = new Date().toISOString();
  const claims = getAllClaims();
  const computedClaims = computeClaimResults({
    claims,
    experiments: merged.experiments,
    experimentMeta: merged.experimentMeta,
    currentSourceHashes,
    currentRuntimeVersion: RUNTIME_VERSION,
    currentExpectKeys,
    verifierReports,
    freshExperiments: merged.freshExperiments,
    previous: previous.claims,
    now,
  });

  // Merge page-level checks (coverage, support) from present verifier reports, keeping previous when absent.
  const pagesMap: ProofResults['pages'] = {};
  for (const [pageId, entry] of Object.entries(previous.pages)) {
    pagesMap[pageId] = { ...entry };
  }
  const coverageReport = verifierReports.get('coverage');
  if (coverageReport) {
    for (const entry of Object.values(pagesMap)) delete entry.coverage;
    for (const [pageId, pageCheck] of Object.entries(coverageReport.pages)) {
      pagesMap[pageId] = { ...(pagesMap[pageId] ?? {}), coverage: pageCheck };
    }
  }
  const supportReport = verifierReports.get('support');
  if (supportReport) {
    for (const entry of Object.values(pagesMap)) delete entry.support;
    for (const [pageId, pageCheck] of Object.entries(supportReport.pages)) {
      pagesMap[pageId] = { ...(pagesMap[pageId] ?? {}), support: pageCheck };
    }
  }
  for (const [pageId, entry] of Object.entries(pagesMap)) {
    if (!entry.coverage && !entry.support) delete pagesMap[pageId];
  }

  const draftResults: ProofResults = {
    schemaVersion: 1,
    generatedAt: now,
    runner: merged.runner,
    engines: merged.engines,
    experiments: merged.experiments,
    experimentMeta: merged.experimentMeta,
    claims: computedClaims,
    pages: pagesMap,
    demotedPages: {},
  };

  const { pages: allPages } = getAllPageRefs();
  const claimsByPage = new Map<string, Claim[]>(
    [...getAllClaimsFiles().entries()].map(([pageId, file]) => [pageId, file.claims])
  );

  const demoted = pagesToDemote(allPages, claimsByPage, draftResults, now);
  const promoted = pagesToPromote(allPages, claimsByPage, previous, draftResults);
  draftResults.demotedPages = nextDemotedPages(previous, allPages, demoted, promoted, now);

  const validated = ProofResultsSchema.parse(draftResults);
  const sorted = sortKeysDeep(validated);

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(sorted, null, 2) + '\n');

  fs.mkdirSync(artifactsDir, { recursive: true });
  fs.writeFileSync(
    path.join(artifactsDir, 'demotions.json'),
    JSON.stringify(demoted, null, 2) + '\n'
  );
  fs.writeFileSync(
    path.join(artifactsDir, 'promotions.json'),
    JSON.stringify(promoted, null, 2) + '\n'
  );

  const summary = renderSummary(validated, demoted.length, promoted.length);
  fs.writeFileSync(path.join(artifactsDir, 'summary.md'), summary);
  if (process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary + '\n');
  }

  console.log(
    `✅ Aggregated ${Object.keys(validated.claims).length} claim(s) into ${path.relative(SITE_ROOT, outPath)}`
  );
}

const CURRENT_FILE = typeof __filename !== 'undefined' ? __filename : fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(CURRENT_FILE)) {
  main();
}
