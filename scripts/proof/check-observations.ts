import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { INSTRUMENT_REGISTRY } from '../../src/components/instruments/registry';
import { parseCliArgs } from '../../src/lib/cli-args';
import { CONTENT_DIR } from '../../src/lib/paths';
import { readCheckResults } from '../../src/lib/proof/check-results';
import type { EngineId } from '../../src/lib/proof/claim-schema';
import type { Json } from '../../src/lib/proof/define-experiment';
import { loadExperimentIndex } from '../../src/lib/proof/experiment-bundles';
import type { ProofResults } from '../../src/lib/proof/results-schema';
import { selectPath } from '../../src/lib/proof/select-path';
import { ExperimentViewSchema, type ExperimentView } from '../../src/lib/proof/view-schema';

export interface ObservationViolation {
  experimentId: string;
  expectKey: string;
  engine: EngineId;
  path: string;
  message: string;
}

export interface CheckObservationsInput {
  results: ProofResults;
  views: Map<string, ExperimentView>;
  bundleHashes: Map<string, string>;
}

const ENGINES: readonly EngineId[] = ['chromium', 'firefox', 'webkit'];

/**
 * Validates observed.treatment of passing cases against the declared instrument's observedSchema.
 * Skips any experiment whose recorded sourceHash differs from the current bundle's sourceHash
 * (stale results from a previous revision before a PR edited observe + view.json together).
 */
export function checkObservations({
  results,
  views,
  bundleHashes,
}: CheckObservationsInput): ObservationViolation[] {
  const violations: ObservationViolation[] = [];

  for (const [experimentId, view] of views.entries()) {
    if (view.instrument === 'frame-budget') continue;

    const expResults = results.experiments[experimentId];
    if (!expResults) continue;

    const currentHash = bundleHashes.get(experimentId);
    const recordedHash = results.experimentMeta[experimentId]?.sourceHash;
    if (currentHash && recordedHash && recordedHash !== currentHash) {
      continue;
    }

    const schema = INSTRUMENT_REGISTRY[view.instrument].observedSchema;

    for (const [expectKey, perEngine] of Object.entries(expResults)) {
      for (const engine of ENGINES) {
        const caseRes = perEngine[engine];
        if (!caseRes || caseRes.status !== 'pass') continue;
        if (!('treatment' in caseRes.observed)) continue;
        // Skip measured observations (shape { treatment: { median, n }, control: { median, n }, ratio, pValue })
        if ('ratio' in caseRes.observed && 'pValue' in caseRes.observed) continue;

        const treatment = caseRes.observed.treatment as Json;
        const selected = selectPath(treatment, view.observedPath);
        if (!selected.ok) {
          violations.push({
            experimentId,
            expectKey,
            engine,
            path: selected.at,
            message: `No data at path "${selected.at}"`,
          });
          continue;
        }

        const parsed = schema.safeParse(selected.value);
        if (!parsed.success) {
          const first = parsed.error.issues[0];
          const issuePath =
            first && first.path.length > 0 ? first.path.map(String).join('.') : '(root)';
          violations.push({
            experimentId,
            expectKey,
            engine,
            path: issuePath,
            message: first?.message ?? 'Schema mismatch',
          });
        }
      }
    }
  }

  return violations;
}

function loadAllExperimentViews(): Map<string, ExperimentView> {
  const map = new Map<string, ExperimentView>();
  const experimentsDir = path.join(CONTENT_DIR, 'experiments');
  if (!fs.existsSync(experimentsDir)) return map;

  for (const entry of fs.readdirSync(experimentsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const viewPath = path.join(experimentsDir, entry.name, 'view.json');
    if (!fs.existsSync(viewPath)) continue;
    const raw = JSON.parse(fs.readFileSync(viewPath, 'utf-8'));
    map.set(entry.name, ExperimentViewSchema.parse(raw));
  }
  return map;
}

async function main(): Promise<void> {
  parseCliArgs(process.argv.slice(2), {});
  const results = readCheckResults();
  const views = loadAllExperimentViews();
  const index = loadExperimentIndex();
  const bundleHashes = new Map(index.map((e) => [e.id, e.sourceHash]));

  const violations = checkObservations({ results, views, bundleHashes });
  if (violations.length > 0) {
    console.error(`❌ Observation schema check failed (${violations.length} violation(s)):`);
    for (const v of violations) {
      console.error(`  - ${v.experimentId} [${v.expectKey}] (${v.engine}) at ${v.path}: ${v.message}`);
    }
    process.exit(1);
  }

  console.log(`✅ Observation schema check passed (${views.size} view.json checked).`);
}

const thisFile = typeof __filename !== 'undefined' ? __filename : fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(thisFile)) {
  main().catch((err) => {
    console.error('❌ check-observations crashed:', err);
    process.exit(2);
  });
}
