import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { parseCliArgs } from '../../src/lib/cli-args';
import { SITE_ROOT } from '../../src/lib/paths';
import { ARTIFACT_KINDS } from '../../src/lib/proof/artifact-schema';
import { ENGINE_IDS, type EngineId } from '../../src/lib/proof/claim-schema';
import type { PageStatusChange } from '../../src/lib/proof/claim-status';
import { getAllClaims } from '../../src/lib/proof/claims-loader';
import { historyDir } from '../../src/lib/proof/history-loader';
import { diffProofResults } from '../../src/lib/proof/nightly/diff';
import { contentEnv, verifierEnv } from '../../src/lib/proof/nightly/env';
import { evaluateNightlyHealth, readRecentRunRecords } from '../../src/lib/proof/nightly/health';
import { buildIssues } from '../../src/lib/proof/nightly/issues';
import { prepareRunReport, prepareVerifierArtifact } from '../../src/lib/proof/nightly/prepare';
import {
  buildHistoryLines,
  renderPrBody,
  renderSummary,
  type StepOutcome,
} from '../../src/lib/proof/nightly/summary';
import { readProofResults } from '../../src/lib/proof/results-loader';
import { NIGHTLY_STEPS, type NightlyStep } from './nightly-steps';
import { PROOF_STEPS, type ProofStep } from './steps';

// Test overrides (same convention as scripts/proof/all.ts).
const STEPS: ProofStep[] = process.env.FR_PROOF_STEPS_FILE
  ? // eslint-disable-next-line @typescript-eslint/no-require-imports
    require(path.resolve(process.env.FR_PROOF_STEPS_FILE)).PROOF_STEPS
  : PROOF_STEPS;

const SCHEDULED_STEPS: NightlyStep[] = process.env.FR_NIGHTLY_STEPS_FILE
  ? // eslint-disable-next-line @typescript-eslint/no-require-imports
    require(path.resolve(process.env.FR_NIGHTLY_STEPS_FILE)).NIGHTLY_STEPS
  : NIGHTLY_STEPS;

const ART = path.join(SITE_ROOT, 'artifacts', 'proof');
const abs = (p: string) => path.resolve(SITE_ROOT, p);

function runTsx(args: string[], env: NodeJS.ProcessEnv): StepOutcome {
  const started = Date.now();
  const res = spawnSync('npx', ['tsx', ...args], {
    stdio: 'inherit',
    env,
    cwd: SITE_ROOT,
  });
  return {
    ok: res.status === 0,
    status: res.status,
    ms: Date.now() - started,
  };
}

function readDistro(): string {
  try {
    if (!fs.existsSync('/etc/os-release')) return 'unknown';
    const text = fs.readFileSync('/etc/os-release', 'utf-8');
    let id = '';
    let versionId = '';
    for (const line of text.split(/\r?\n/)) {
      const mId = line.match(/^ID=(.+)$/);
      if (mId) id = mId[1].trim().replace(/^["']|["']$/g, '');
      const mVer = line.match(/^VERSION_ID=(.+)$/);
      if (mVer) versionId = mVer[1].trim().replace(/^["']|["']$/g, '');
    }
    if (id && versionId) return `${id}-${versionId}`;
    return id || 'unknown';
  } catch {
    return 'unknown';
  }
}

function listFilesRecursive(rootDir: string): Set<string> {
  const out = new Set<string>();
  if (!fs.existsSync(rootDir)) return out;
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile() || entry.isSymbolicLink()) {
        out.add(full);
      }
    }
  };
  walk(rootDir);
  return out;
}

function copyModifiedCacheFiles(outCacheDir: string): void {
  let output: string;
  try {
    output = execFileSync(
      'git',
      ['status', '--porcelain', '--', 'content/.proof-cache/specs', 'content/.proof-cache/sources'],
      { cwd: SITE_ROOT, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] }
    );
  } catch {
    return;
  }

  for (const rawLine of output.split(/\r?\n/)) {
    if (!rawLine.trim()) continue;
    const rawPath = rawLine.slice(3).trim();
    const arrowIdx = rawPath.indexOf(' -> ');
    const relPath = arrowIdx >= 0 ? rawPath.slice(arrowIdx + 4) : rawPath;
    const match = relPath.match(/^content\/\.proof-cache\/(specs|sources)\/([^/]+\.json)$/);
    if (!match) continue;
    const src = path.join(SITE_ROOT, relPath);
    if (!fs.existsSync(src)) continue;
    const destDir = path.join(outCacheDir, match[1]);
    fs.mkdirSync(destDir, { recursive: true });
    fs.copyFileSync(src, path.join(destDir, match[2]));
  }
}

function readPageStatusChanges(filePath: string): PageStatusChange[] {
  if (!fs.existsSync(filePath)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as unknown;
    return Array.isArray(parsed) ? (parsed as PageStatusChange[]) : [];
  } catch {
    return [];
  }
}

function parseEngines(raw: string | undefined): EngineId[] {
  const tokens = (raw ?? 'chromium,firefox,webkit')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const valid = new Set<string>(ENGINE_IDS);
  const engines: EngineId[] = [];
  for (const token of tokens) {
    if (!valid.has(token)) {
      console.error(`Unknown engine "${token}" (expected one of: ${ENGINE_IDS.join(', ')})`);
      process.exit(2);
    }
    engines.push(token as EngineId);
  }
  if (engines.length === 0) {
    console.error('At least one engine must be specified');
    process.exit(2);
  }
  return engines;
}

async function main(): Promise<void> {
  const runStartedAt = Date.now();
  const raw = parseCliArgs(process.argv.slice(2), {
    out: 'string',
    'skip-run': 'boolean',
    engines: 'string',
    previous: 'string',
    now: 'string',
  });

  const engines = parseEngines(raw.engines);
  const now = raw.now ? new Date(raw.now) : new Date();
  if (Number.isNaN(now.getTime())) {
    console.error(`Invalid --now timestamp: "${raw.now}"`);
    process.exit(2);
  }

  const outDir = abs(raw.out ?? 'artifacts/proof-nightly');
  const skipRun = raw['skip-run'] === true;
  const previousPath = abs(raw.previous ?? 'content/.proof-results/latest.json');
  const previous = fs.existsSync(previousPath) ? readProofResults(previousPath) : null;

  const aggIndex = STEPS.findIndex((s) => s.name === 'aggregate');
  if (aggIndex < 0) {
    console.error('PROOF_STEPS is missing the "aggregate" step');
    process.exit(2);
  }

  const previewPath = path.join(ART, 'latest.preview.json');
  const steps: Record<string, StepOutcome> = {};

  if (!skipRun) {
    fs.rmSync(ART, { recursive: true, force: true });
    fs.mkdirSync(ART, { recursive: true });

    // 1. Pre-aggregation steps in PROOF_STEPS order.
    for (const step of STEPS.slice(0, aggIndex)) {
      if (!fs.existsSync(abs(step.script))) {
        if (step.optional) continue;
        console.error(`Missing required proof step script: ${step.script}`);
        process.exit(2);
      }
      const extra = [
        ...(step.args ?? []),
        ...(step.passThroughRunnerArgs
          ? ['--engines', engines.join(','), '--out', path.join(ART, 'experiments.json')]
          : []),
        ...(step.verifier && (step.name === 'verify-specs' || step.name === 'verify-sources')
          ? ['--max-age-hours', '0']
          : []),
      ];
      steps[step.name] = runTsx(
        [step.script, ...extra],
        step.verifier ? verifierEnv() : contentEnv()
      );
    }
  }

  // 2. Prepare inputs, then delegate all status computation to aggregate-results.ts.
  const infraErrors: string[] = [];
  const runPrep = prepareRunReport(path.join(ART, 'experiments.json'), engines);
  infraErrors.push(...runPrep.infraErrors);
  if (!skipRun && !runPrep.present) {
    infraErrors.push('experiments.json missing (runner failed or timed out)');
  }

  for (const kind of ARTIFACT_KINDS) {
    const prep = prepareVerifierArtifact(path.join(ART, `${kind}.json`), previous);
    infraErrors.push(...prep.infraErrors);
  }

  steps.aggregate = runTsx(
    ['scripts/proof/aggregate-results.ts', '--previous', previousPath, '--out', previewPath],
    contentEnv()
  );
  if (!steps.aggregate.ok) {
    console.error('aggregate-results.ts failed');
    process.exit(1);
  }

  // Prepare output artifact directory (exact top-level contract).
  fs.rmSync(outDir, { recursive: true, force: true });
  const outCacheDir = path.join(outDir, 'cache');
  const outExtraDir = path.join(outDir, 'extra');
  fs.mkdirSync(outCacheDir, { recursive: true });
  fs.mkdirSync(outExtraDir, { recursive: true });
  fs.writeFileSync(path.join(outCacheDir, '.keep'), '');
  fs.writeFileSync(path.join(outExtraDir, '.keep'), '');

  const outLatestPath = path.join(outDir, 'latest.json');
  fs.copyFileSync(previewPath, outLatestPath);

  const srcDemotions = path.join(ART, 'demotions.json');
  const srcPromotions = path.join(ART, 'promotions.json');
  const outDemotionsPath = path.join(outDir, 'demotions.json');
  const outPromotionsPath = path.join(outDir, 'promotions.json');
  if (fs.existsSync(srcDemotions)) {
    fs.copyFileSync(srcDemotions, outDemotionsPath);
  } else {
    fs.writeFileSync(outDemotionsPath, '[]\n');
  }
  if (fs.existsSync(srcPromotions)) {
    fs.copyFileSync(srcPromotions, outPromotionsPath);
  } else {
    fs.writeFileSync(outPromotionsPath, '[]\n');
  }

  const next = readProofResults(outLatestPath);

  // 3. Post-aggregation checks from PROOF_STEPS (excluding gate), informational at night.
  for (const step of STEPS.slice(aggIndex + 1)) {
    if (step.name === 'gate') continue;
    if (!fs.existsSync(abs(step.script))) continue;
    steps[step.name] = runTsx([step.script, ...(step.args ?? [])], contentEnv());
  }

  // 4. Scheduled extension steps from NIGHTLY_STEPS.
  for (const step of SCHEDULED_STEPS) {
    if (step.days && !step.days.includes(now.getUTCDay())) continue;
    if (!fs.existsSync(abs(step.script))) {
      if (step.optional) continue;
      steps[step.name] = { ok: false, status: null, ms: 0 };
      continue;
    }
    const beforeFiles = listFilesRecursive(outExtraDir);
    const outcome = runTsx(
      [
        step.script,
        '--extra-dir',
        outExtraDir,
        '--previous',
        previousPath,
        '--next',
        outLatestPath,
        '--now',
        now.toISOString(),
      ],
      step.env === 'verifier' ? verifierEnv() : contentEnv()
    );
    steps[step.name] = outcome;
    if (!outcome.ok) {
      const afterFiles = listFilesRecursive(outExtraDir);
      for (const file of afterFiles) {
        if (!beforeFiles.has(file)) {
          fs.rmSync(file, { force: true });
        }
      }
    }
  }

  copyModifiedCacheFiles(outCacheDir);

  const totalDurationMs = Date.now() - runStartedAt;
  const diff = diffProofResults(previous, next, now, infraErrors);
  const demotions = readPageStatusChanges(outDemotionsPath);
  const promotions = readPageStatusChanges(outPromotionsPath);

  const statementsByClaimId = new Map<string, string>();
  try {
    for (const claim of getAllClaims()) {
      statementsByClaimId.set(claim.id, claim.statement);
    }
  } catch {
    // Allow minimal fixture environments without full content tree.
  }

  const recentRuns = readRecentRunRecords(historyDir(), now);
  const health = evaluateNightlyHealth(recentRuns, now);
  const issues = buildIssues(diff, next, now, {
    statementsByClaimId,
    medianDurationMs: health.medianDurationMs,
  });

  const date = now.toISOString().slice(0, 10);
  const distro = readDistro();
  const historyLines = buildHistoryLines({
    next,
    diff,
    now,
    durationMs: totalDurationMs,
    distro,
  });
  const prBody = renderPrBody({ date, next, diff, demotions, promotions });
  const summary = renderSummary({
    date,
    next,
    diff,
    demotions,
    promotions,
    steps,
    totalDurationMs,
  });

  fs.writeFileSync(path.join(outDir, 'diff.json'), JSON.stringify(diff, null, 2) + '\n');
  fs.writeFileSync(path.join(outDir, 'issues.json'), JSON.stringify(issues, null, 2) + '\n');
  fs.writeFileSync(path.join(outDir, 'history-line.jsonl'), historyLines);
  fs.writeFileSync(path.join(outDir, 'pr-body.md'), prBody);
  fs.writeFileSync(path.join(outDir, 'summary.md'), summary);

  console.log(`✅ Nightly proof artifact written to ${outDir}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
