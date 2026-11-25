import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCliArgs } from '../../src/lib/cli-args';
import {
  computeLiveInBrowser,
  ExperimentBundleSchema,
  type ExperimentBundle,
  type ExperimentBundleIndexEntry,
} from '../../src/lib/proof/experiment-schema';
import { runStaticChecks } from '../../src/lib/proof/experiment-static-checks';
import { RUNTIME_VERSION } from '../../src/lib/proof/runtime/protocol';
import { CONTENT_DIR, PUBLIC_DIR as SITE_PUBLIC_DIR, SITE_ROOT } from '../../src/lib/paths';

export const EXPERIMENTS_DIR = path.join(CONTENT_DIR, 'experiments');
export const OUT_DIR = path.join(SITE_ROOT, '.proof-build', 'experiments');
export const PUBLIC_DIR = path.join(SITE_PUBLIC_DIR, 'experiments');

export interface BuildOutcome {
  id: string;
  bundle: ExperimentBundle | null;
  errors: string[];
}

export function buildExperimentFromSource(tsSource: string, folderName: string): BuildOutcome {
  const { bundleInput, errors } = runStaticChecks(tsSource, folderName);
  const messages = errors.map((e) => `[experiments/${folderName}] ${e.message}`);
  if (!bundleInput || errors.length > 0) return { id: folderName, bundle: null, errors: messages };
  const candidate = {
    schemaVersion: 1,
    runtimeVersion: RUNTIME_VERSION,
    sourceHash: crypto.createHash('sha256').update(tsSource).digest('hex'),
    ...bundleInput,
    // Recomputed right after schema validation once defaults have been applied.
    liveInBrowser: false,
  };
  const parsed = ExperimentBundleSchema.safeParse(candidate);
  if (!parsed.success) {
    return {
      id: folderName,
      bundle: null,
      errors: parsed.error.issues.map(
        (i) => `[experiments/${folderName}] S16 ${i.path.join('.')}: ${i.message}`
      ),
    };
  }
  const bundle = { ...parsed.data, liveInBrowser: computeLiveInBrowser(parsed.data) };
  return { id: folderName, bundle, errors: [] };
}

export function listExperimentFolders(dir = EXPERIMENTS_DIR): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && fs.existsSync(path.join(dir, d.name, 'experiment.ts')))
    .map((d) => d.name)
    .sort();
}

function main(): void {
  const values = parseCliArgs(process.argv.slice(2), {
    only: 'string',
    dir: 'string',
    out: 'string',
  });
  const only = values.only ? new Set(values.only.split(',').filter(Boolean)) : null;
  const dirArg = values.dir;
  const sourceDir = dirArg ? path.resolve(dirArg) : EXPERIMENTS_DIR;
  const outArg = values.out;
  const outDir = outArg ? path.resolve(outArg) : OUT_DIR;
  // Only mirror into public/experiments/ for the default build (not test temp dirs).
  const writePublic = !outArg && !dirArg;

  fs.mkdirSync(outDir, { recursive: true });
  if (writePublic) fs.mkdirSync(PUBLIC_DIR, { recursive: true });
  const folders = listExperimentFolders(sourceDir).filter((f) => !only || only.has(f));
  const errors: string[] = [];
  const index: ExperimentBundleIndexEntry[] = [];

  for (const folder of folders) {
    const source = fs.readFileSync(path.join(sourceDir, folder, 'experiment.ts'), 'utf-8');
    const outcome = buildExperimentFromSource(source, folder);
    if (!outcome.bundle) {
      errors.push(...outcome.errors);
      continue;
    }
    const json = JSON.stringify(outcome.bundle, null, 2) + '\n';
    fs.writeFileSync(path.join(outDir, `${folder}.json`), json);
    if (writePublic) fs.writeFileSync(path.join(PUBLIC_DIR, `${folder}.json`), json);
    const b = outcome.bundle;
    index.push({
      id: b.id,
      title: b.title,
      kind: b.kind,
      sourceHash: b.sourceHash,
      host: b.host,
      liveInBrowser: b.liveInBrowser,
    });
  }

  // Keep the full index intact when building with --only.
  if (!only) {
    const indexJson = JSON.stringify(index, null, 2) + '\n';
    fs.writeFileSync(path.join(outDir, 'index.json'), indexJson);
    if (writePublic) fs.writeFileSync(path.join(PUBLIC_DIR, 'index.json'), indexJson);
    // Remove bundles for deleted experiments.
    const keep = new Set(index.map((e) => `${e.id}.json`).concat('index.json'));
    for (const f of fs.readdirSync(outDir)) {
      if (f.endsWith('.json') && !keep.has(f)) fs.rmSync(path.join(outDir, f));
    }
    if (writePublic) {
      for (const f of fs.readdirSync(PUBLIC_DIR)) {
        if (f.endsWith('.json') && !keep.has(f)) fs.rmSync(path.join(PUBLIC_DIR, f));
      }
    }
  }

  if (errors.length > 0) {
    console.error(`❌ Experiment build failed (${errors.length} error(s)):`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log(
    `✅ Built ${index.length || folders.length} experiment bundle(s) into ${path.relative(SITE_ROOT, outDir)}`
  );
}

const CURRENT_FILE = typeof __filename !== 'undefined' ? __filename : fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(CURRENT_FILE)) {
  main();
}
