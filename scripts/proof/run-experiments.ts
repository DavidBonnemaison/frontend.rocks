import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { chromium, firefox, webkit, type Browser, type BrowserType } from '@playwright/test';
import { CliArgsError } from '../../src/lib/cli-args';
import { SITE_ROOT } from '../../src/lib/paths';
import type { EngineId } from '../../src/lib/proof/claim-schema';
import { getAllClaimsFiles } from '../../src/lib/proof/claims-loader';
import { loadExperimentBundle, loadExperimentIndex } from '../../src/lib/proof/experiment-bundles';
import type { ExperimentBundle } from '../../src/lib/proof/experiment-schema';
import {
  ExperimentRunReportSchema,
  type ExperimentRunReport,
} from '../../src/lib/proof/results-schema';
import { runExperimentInEngine, type EngineRunOutcome } from './runner-core';
import {
  applyShard,
  parseRunnerArgs,
  selectChangedExperiments,
  type RunnerArgs,
} from './runner-select';
import { startStaticServer, type StaticServer } from './static-server';
import { startTestServer, type TestServer } from './test-server';

const ENGINES: Record<EngineId, BrowserType> = { chromium, firefox, webkit };

function gitChangedFiles(base: string): string[] | null {
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
    const files = new Set<string>();
    for (const line of diffOut.split('\n')) {
      const trimmed = line.trim();
      if (trimmed) files.add(trimmed);
    }
    for (const line of statusOut.split('\n')) {
      if (!line.trim()) continue;
      // Format: XY path (or XY old -> new)
      const rawPath = line.slice(3).trim();
      const arrowIdx = rawPath.indexOf(' -> ');
      files.add(arrowIdx >= 0 ? rawPath.slice(arrowIdx + 4) : rawPath);
    }
    return [...files].sort();
  } catch (err) {
    console.warn(
      `⚠️  git diff against "${base}" failed (${(err as Error).message.trim()}); running all experiments.`
    );
    return null;
  }
}

function claimsExperimentRefs(): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const [pageId, file] of getAllClaimsFiles()) {
    const expIds = new Set<string>();
    for (const claim of file.claims) {
      if (claim.proof.kind === 'experiment') {
        expIds.add(claim.proof.experimentId);
      }
    }
    if (expIds.size > 0) map.set(pageId, [...expIds].sort());
  }
  return map;
}

function playwrightVersion(): string {
  const pkgPath = path.join(SITE_ROOT, 'node_modules', '@playwright', 'test', 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) as { version: string };
  return pkg.version;
}

function reactVersion(): string | null {
  const versionsPath = path.join(SITE_ROOT, '.proof-build', 'vendor', 'versions.json');
  if (!fs.existsSync(versionsPath)) return null;
  const data = JSON.parse(fs.readFileSync(versionsPath, 'utf-8')) as { react?: string };
  return data.react ?? null;
}

async function startLabServer(): Promise<StaticServer> {
  const dir = path.join(SITE_ROOT, 'dist-lab-dev');
  if (!fs.existsSync(dir)) {
    throw new Error(
      'Missing dist-lab-dev/ for host "origin" experiments. Run "npm run proof:build-lab -- --dev" first.'
    );
  }
  return startStaticServer(dir, { host: '127.0.0.1' });
}

function mergeOutcome(
  report: ExperimentRunReport,
  bundle: ExperimentBundle,
  engine: EngineId,
  outcome: EngineRunOutcome,
  durationMs: number
): void {
  const existing = report.experiments[bundle.id] ?? {
    sourceHash: bundle.sourceHash,
    runtimeVersion: bundle.runtimeVersion,
    durationMs: 0,
    vacuity: {},
    cases: {},
  };
  existing.durationMs += durationMs;
  existing.vacuity[engine] = outcome.vacuity;
  for (const [key, caseResult] of Object.entries(outcome.cases)) {
    if (!existing.cases[key]) existing.cases[key] = {};
    existing.cases[key][engine] = caseResult;
  }
  report.experiments[bundle.id] = existing;
}

function logOutcome(engine: EngineId, id: string, outcome: EngineRunOutcome): void {
  const entries = Object.values(outcome.cases);
  const total = entries.length;
  const counts: Record<string, number> = {};
  for (const c of entries) {
    counts[c.status] = (counts[c.status] ?? 0) + 1;
  }
  const allPass = counts.pass === total && total > 0;
  if (allPass) {
    console.log(`✅ ${engine} ${id} ${total}/${total} pass`);
  } else {
    const summary = Object.entries(counts)
      .map(([status, n]) => `${n} ${status}`)
      .join(', ');
    console.log(`❌ ${engine} ${id} ${summary}`);
  }
}

function writeReport(outPath: string, report: ExperimentRunReport): void {
  const resolved = path.isAbsolute(outPath) ? outPath : path.join(SITE_ROOT, outPath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, JSON.stringify(report, null, 2) + '\n');
}

async function main(): Promise<void> {
  let args: RunnerArgs;
  try {
    args = parseRunnerArgs(process.argv.slice(2));
  } catch (e) {
    if (e instanceof CliArgsError) {
      console.error(e.message);
      process.exit(2);
    }
    throw e;
  }

  const allIds = loadExperimentIndex().map((e) => e.id);
  let ids = args.only ?? allIds;
  if (args.changedBase) {
    const changed = gitChangedFiles(args.changedBase);
    if (changed !== null) {
      ids = selectChangedExperiments(changed, ids, claimsExperimentRefs());
    }
  }
  ids = applyShard(ids, args.shard);

  const report: ExperimentRunReport = {
    schemaVersion: 1,
    kind: 'experiments',
    generatedAt: new Date().toISOString(),
    runner: {
      playwright: playwrightVersion(),
      node: process.version,
      os: process.platform,
      react: reactVersion(),
    },
    engines: {},
    shard: args.shard,
    experiments: {},
  };

  if (ids.length === 0) {
    writeReport(args.out, ExperimentRunReportSchema.parse(report));
    console.log('ℹ️ No experiment to run.');
    return;
  }

  const harnessDir = path.join(SITE_ROOT, '.proof-build', 'harness');
  if (!fs.existsSync(path.join(harnessDir, 'index.html'))) {
    throw new Error('Missing proof harness in .proof-build/harness. Run "npm run proof:build" first.');
  }

  const bundles = ids.map((id) => loadExperimentBundle(id));
  const harness = await startStaticServer(harnessDir, { host: '127.0.0.1' });
  const needsServer = bundles.some((b) => b.network?.mode === 'server');
  const testServer: TestServer | null = needsServer ? await startTestServer() : null;
  const needsLab = bundles.some((b) => b.host === 'origin');
  const lab: StaticServer | null = needsLab ? await startLabServer() : null;

  try {
    for (const engine of args.engines) {
      const browser: Browser = await ENGINES[engine].launch({ headless: !args.headed });
      report.engines[engine] = browser.version();
      try {
        for (const bundle of bundles) {
          const started = Date.now();
          const outcome = await runExperimentInEngine({
            browser,
            engine,
            bundle,
            harnessOrigin: harness.origin,
            labOrigin: lab?.origin ?? null,
            testServer,
            timeoutMs: args.timeoutMs,
            headed: args.headed,
          });
          mergeOutcome(report, bundle, engine, outcome, Date.now() - started);
          logOutcome(engine, bundle.id, outcome);
        }
      } finally {
        await browser.close();
      }
    }
  } finally {
    await harness.close();
    await testServer?.close();
    await lab?.close();
  }

  writeReport(args.out, ExperimentRunReportSchema.parse(report));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
