import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SITE_ROOT } from '../../src/lib/paths';
import { ENGINE_IDS, type EngineId } from '../../src/lib/proof/claim-schema';
import { ExperimentRunReportSchema } from '../../src/lib/proof/results-schema';

type Expected = 'pass' | 'fail' | 'vacuous';
type Rule = Expected | Partial<Record<EngineId, Expected | Expected[]>>;

const EXPECTED: Record<string, Rule> = {
  'network-shim-abort': 'pass',
  'network-server-cors': 'pass',
  'console-page-error': 'pass',
  'measured-forced-layout': 'pass',
  'vacuous-absence': 'vacuous',
  'mutation-noop': 'vacuous',
  'wrong-expectation': 'fail',
  'trusted-click': 'pass',
  'prefers-reduced-motion': 'pass',
  'react-vendor-render': 'pass',
  'idb-versionchange': 'pass',
  // Service worker: WebKit behavior is recorded without masking engine differences.
  'sw-waiting': { chromium: 'pass', firefox: 'pass', webkit: ['pass', 'fail', 'vacuous'] },
};

function allowedStatuses(rule: Rule, engine: EngineId): Expected[] {
  if (typeof rule === 'string') return [rule];
  const perEng = rule[engine];
  if (!perEng) return [];
  return Array.isArray(perEng) ? perEng : [perEng];
}

function listFixtureDirs(fixturesDir: string): string[] {
  if (!fs.existsSync(fixturesDir)) return [];
  return fs
    .readdirSync(fixturesDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && fs.existsSync(path.join(fixturesDir, d.name, 'experiment.ts')))
    .map((d) => d.name)
    .sort();
}

function main(): void {
  const fixturesDir = path.join(SITE_ROOT, 'tests', 'fixtures', 'experiments');
  const fixtureIds = listFixtureDirs(fixturesDir);
  const errors: string[] = [];

  for (const id of fixtureIds) {
    if (!Object.prototype.hasOwnProperty.call(EXPECTED, id)) {
      errors.push(`unexpected fixture "${id}": add it to EXPECTED`);
    }
  }
  for (const id of Object.keys(EXPECTED)) {
    if (!fixtureIds.includes(id)) {
      errors.push(`missing fixture "${id}" in tests/fixtures/experiments/`);
    }
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fr-selftest-'));
  const outRel = path.join('artifacts', 'proof', 'selftest.json');
  const outAbs = path.join(SITE_ROOT, outRel);

  try {
    const buildRes = spawnSync(
      'npx',
      ['tsx', 'scripts/proof/build-experiments.ts', '--dir', 'tests/fixtures/experiments', '--out', tmpDir],
      { cwd: SITE_ROOT, stdio: 'inherit' }
    );
    if ((buildRes.status ?? 1) !== 0) {
      console.error('❌ selftest: failed to build fixture experiments');
      process.exit(1);
    }

    const labScript = path.join(SITE_ROOT, 'scripts', 'proof', 'build-lab-site.ts');
    if (fs.existsSync(labScript)) {
      const labRes = spawnSync('npx', ['tsx', 'scripts/proof/build-lab-site.ts', '--dev'], {
        cwd: SITE_ROOT,
        stdio: 'inherit',
      });
      if ((labRes.status ?? 1) !== 0) {
        console.error('❌ selftest: failed to build dev lab site');
        process.exit(1);
      }
    }

    const runRes = spawnSync(
      'npx',
      ['tsx', 'scripts/proof/run-experiments.ts', '--out', outRel],
      {
        cwd: SITE_ROOT,
        stdio: 'inherit',
        env: { ...process.env, FR_PROOF_BUILD_DIR: tmpDir },
      }
    );
    if ((runRes.status ?? 1) !== 0) {
      console.error('❌ selftest: runner exited with error');
      process.exit(1);
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }

  const report = ExperimentRunReportSchema.parse(JSON.parse(fs.readFileSync(outAbs, 'utf-8')));

  const header = `${'Experiment'.padEnd(28)} | ${ENGINE_IDS.map((e) => e.padEnd(18)).join(' | ')}`;
  console.log('\n' + header);
  console.log('-'.repeat(header.length));

  for (const id of Object.keys(EXPECTED).sort()) {
    const rule = EXPECTED[id];
    const expEntry = report.experiments[id];
    if (!expEntry) {
      errors.push(`missing experiment "${id}" in selftest report`);
      continue;
    }
    const cols: string[] = [];
    for (const engine of ENGINE_IDS) {
      const allowed = allowedStatuses(rule, engine);
      const caseEntries = Object.entries(expEntry.cases);
      if (caseEntries.length === 0) {
        cols.push('NO CASES'.padEnd(18));
        errors.push(`${id} [${engine}]: no cases recorded`);
        continue;
      }
      const statuses = caseEntries.map(([, engMap]) => engMap[engine]?.status ?? 'missing');
      const unique = [...new Set(statuses)];
      const allMatch =
        statuses.every((s) => s !== 'error' && allowed.includes(s as Expected));
      const cell = `${allMatch ? 'OK' : 'FAIL'}:${unique.join(',')}`;
      cols.push(cell.padEnd(18));
      if (!allMatch) {
        errors.push(
          `${id} [${engine}]: expected ${allowed.join('|')}, got ${statuses.join(', ')}`
        );
      }
    }
    console.log(`${id.padEnd(28)} | ${cols.join(' | ')}`);
  }
  console.log('');

  if (errors.length > 0) {
    console.error(`❌ proof:selftest failed (${errors.length} issue(s)):`);
    for (const err of errors) console.error(`  - ${err}`);
    process.exit(1);
  }
  console.log('✅ proof:selftest passed on all 3 engines');
}

main();
