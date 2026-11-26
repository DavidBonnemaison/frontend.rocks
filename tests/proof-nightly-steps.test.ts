import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ProofResultsSchema } from '@/lib/proof/results-schema';

const SITE_ROOT = process.cwd();
const NIGHTLY_SCRIPT = path.join(SITE_ROOT, 'scripts', 'proof', 'nightly.ts');
const AGGREGATE_SCRIPT = path.join(SITE_ROOT, 'scripts', 'proof', 'aggregate-results.ts');

function createMinimalFixtureSite(root: string): {
  siteDir: string;
  previousPath: string;
} {
  const siteDir = path.join(root, 'site');
  fs.mkdirSync(path.join(siteDir, 'content', 'concepts'), { recursive: true });
  fs.mkdirSync(path.join(siteDir, 'content', 'claims'), { recursive: true });
  fs.mkdirSync(path.join(siteDir, 'content', '.proof-results'), { recursive: true });
  fs.mkdirSync(path.join(siteDir, '.proof-build', 'experiments'), { recursive: true });
  fs.mkdirSync(path.join(siteDir, 'artifacts', 'proof'), { recursive: true });
  fs.mkdirSync(path.join(siteDir, 'scripts', 'proof'), { recursive: true });

  // Symlink repo runtime files so tsx resolves local binary and @/* tsconfig paths inside temp SITE_ROOT.
  fs.symlinkSync(path.join(SITE_ROOT, 'node_modules'), path.join(siteDir, 'node_modules'));
  fs.symlinkSync(path.join(SITE_ROOT, 'src'), path.join(siteDir, 'src'));
  fs.symlinkSync(path.join(SITE_ROOT, 'tsconfig.json'), path.join(siteDir, 'tsconfig.json'));

  // Copy aggregate-results.ts so its direct-invocation guard executes main().
  fs.copyFileSync(
    AGGREGATE_SCRIPT,
    path.join(siteDir, 'scripts', 'proof', 'aggregate-results.ts')
  );

  // Empty experiment index
  fs.writeFileSync(
    path.join(siteDir, '.proof-build', 'experiments', 'index.json'),
    JSON.stringify({ schemaVersion: 1, generatedAt: '2026-12-01T00:00:00.000Z', experiments: [] })
  );

  // One concept with one spec-quote claim
  fs.writeFileSync(
    path.join(siteDir, 'content', 'concepts', 'demo-concept.mdx'),
    [
      '---',
      'id: demo-concept',
      'title: Demo Concept',
      'domain: rendering-pipeline',
      'summary_tldr: A short summary of the demo concept for nightly tests.',
      'relations: []',
      'sources:',
      '  - https://html.spec.whatwg.org/multipage/',
      'last_verified_at: "2026-11-30"',
      'proof_status: unverified',
      '---',
      '',
      'Demo body.',
      '',
    ].join('\n')
  );
  fs.writeFileSync(
    path.join(siteDir, 'content', 'claims', 'demo-concept.claims.json'),
    JSON.stringify({
      pageId: 'demo-concept',
      claims: [
        {
          id: 'demo-concept/spec-rule',
          type: 'normative',
          statement: 'A normative statement long enough to pass claim schema validation.',
          proof: {
            kind: 'spec-quote',
            url: 'https://html.spec.whatwg.org/multipage/',
            anchor: 'event-loops',
            quote: 'A normative quote long enough to satisfy the schema minimum length.',
          },
        },
      ],
    })
  );

  const previousPath = path.join(siteDir, 'content', '.proof-results', 'latest.json');
  fs.writeFileSync(
    previousPath,
    JSON.stringify({
      schemaVersion: 1,
      generatedAt: '2026-11-30T02:17:00.000Z',
      runner: { playwright: '1.65.1', node: '24.0.0', os: 'linux', react: null },
      engines: { chromium: '143.0.0.0', firefox: '145.0', webkit: '26.0' },
      experiments: {},
      experimentMeta: {},
      claims: {
        'demo-concept/spec-rule': {
          status: 'proven',
          proofKind: 'spec-quote',
          engines: null,
          checkedAt: '2026-11-30T02:17:00.000Z',
          provenSince: '2026-11-29T02:17:00.000Z',
          failingSince: null,
          reason: null,
          detail: null,
        },
      },
      pages: {},
      demotedPages: {},
    })
  );

  return { siteDir, previousPath };
}

describe('scripts/proof/nightly.ts orchestrator', () => {
  const dirs: string[] = [];

  function mkTemp(): string {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'fr-nightly-steps-'));
    dirs.push(d);
    return d;
  }

  afterEach(() => {
    for (const d of dirs.splice(0)) {
      fs.rmSync(d, { recursive: true, force: true });
    }
  });

  it('produces the exact artifact layout with --skip-run and matches aggregate-results.ts statuses (also from /tmp)', () => {
    const root = mkTemp();
    const { siteDir, previousPath } = createMinimalFixtureSite(root);

    // Pre-populate spec-quotes artifact
    fs.writeFileSync(
      path.join(siteDir, 'artifacts', 'proof', 'spec-quotes.json'),
      JSON.stringify({
        schemaVersion: 1,
        kind: 'spec-quotes',
        generatedAt: '2026-12-01T02:17:00.000Z',
        mode: 'online',
        tooling: {},
        claims: {
          'demo-concept/spec-rule': {
            claimId: 'demo-concept/spec-rule',
            status: 'proven',
            reason: null,
            message: null,
            details: {},
            checkedAt: '2026-12-01T02:17:00.000Z',
          },
        },
        pages: {},
      })
    );

    const outDir = path.join(root, 'out-nightly');
    const directAggPath = path.join(root, 'direct-agg.json');

    // Run from /tmp with FRONTEND_ROCKS_ROOT to verify CWD independence
    const res = spawnSync(
      'npx',
      [
        'tsx',
        NIGHTLY_SCRIPT,
        '--skip-run',
        '--out',
        outDir,
        '--previous',
        previousPath,
        '--now',
        '2026-12-01T02:17:00Z',
      ],
      {
        cwd: os.tmpdir(),
        encoding: 'utf-8',
        env: {
          ...process.env,
          FRONTEND_ROCKS_ROOT: siteDir,
          FRONTEND_ROCKS_CONTENT_DIR: path.join(siteDir, 'content'),
          FR_PROOF_BUILD_DIR: path.join(siteDir, '.proof-build'),
          FR_PROOF_HISTORY_DIR: path.join(siteDir, 'content', '.proof-results', 'history'),
        },
      }
    );
    expect(res.status, res.stderr).toBe(0);

    const entries = fs.readdirSync(outDir).sort();
    expect(entries).toEqual([
      'cache',
      'demotions.json',
      'diff.json',
      'extra',
      'history-line.jsonl',
      'issues.json',
      'latest.json',
      'pr-body.md',
      'promotions.json',
      'summary.md',
    ]);
    expect(fs.existsSync(path.join(outDir, 'cache', '.keep'))).toBe(true);
    expect(fs.existsSync(path.join(outDir, 'extra', '.keep'))).toBe(true);

    // Compare claim statuses with aggregate-results.ts run directly on the same prepared inputs
    const directRes = spawnSync(
      'npx',
      ['tsx', AGGREGATE_SCRIPT, '--previous', previousPath, '--out', directAggPath],
      {
        cwd: SITE_ROOT,
        encoding: 'utf-8',
        env: {
          ...process.env,
          FRONTEND_ROCKS_ROOT: siteDir,
          FRONTEND_ROCKS_CONTENT_DIR: path.join(siteDir, 'content'),
          FR_PROOF_BUILD_DIR: path.join(siteDir, '.proof-build'),
        },
      }
    );
    expect(directRes.status, directRes.stderr).toBe(0);

    const nightlyLatest = ProofResultsSchema.parse(
      JSON.parse(fs.readFileSync(path.join(outDir, 'latest.json'), 'utf-8'))
    );
    const directLatest = ProofResultsSchema.parse(
      JSON.parse(fs.readFileSync(directAggPath, 'utf-8'))
    );
    expect(nightlyLatest.claims['demo-concept/spec-rule'].status).toBe(
      directLatest.claims['demo-concept/spec-rule'].status
    );
  }, 30_000);

  it('iterates FR_PROOF_STEPS_FILE (runs coverage & checks, skips gate), passes exact --engines args, and respects NIGHTLY_STEPS days', () => {
    const root = mkTemp();
    const { siteDir, previousPath } = createMinimalFixtureSite(root);
    const logFile = path.join(root, 'step-log.jsonl');

    // Fake runner step that logs its CLI args and env
    const runnerStep = path.join(siteDir, 'scripts', 'proof', 'fake-runner.ts');
    fs.writeFileSync(
      runnerStep,
      `
import fs from 'node:fs';
fs.appendFileSync(${JSON.stringify(logFile)}, JSON.stringify({ step: 'run', argv: process.argv.slice(2), hasToken: Boolean(process.env.GITHUB_TOKEN) }) + '\\n');
`
    );

    // Fake coverage verifier step before aggregate
    const coverageStep = path.join(siteDir, 'scripts', 'proof', 'fake-coverage.ts');
    fs.writeFileSync(
      coverageStep,
      `
import fs from 'node:fs';
import path from 'node:path';
fs.appendFileSync(${JSON.stringify(logFile)}, JSON.stringify({ step: 'coverage', hasToken: Boolean(process.env.GITHUB_TOKEN) }) + '\\n');
fs.writeFileSync(path.join(process.cwd(), 'artifacts', 'proof', 'coverage.json'), JSON.stringify({
  schemaVersion: 1,
  kind: 'coverage',
  generatedAt: '2026-11-30T02:17:00.000Z',
  mode: 'offline',
  tooling: {},
  claims: {},
  pages: {
    'demo-concept': {
      pageId: 'demo-concept',
      status: 'pass',
      enforced: false,
      violations: [],
      stats: { sentences: 2 },
      foreignClaimIds: [],
    },
  },
}));
`
    );

    // Fake post-aggregate check step
    const checksStep = path.join(siteDir, 'scripts', 'proof', 'fake-checks.ts');
    fs.writeFileSync(
      checksStep,
      `
import fs from 'node:fs';
fs.appendFileSync(${JSON.stringify(logFile)}, JSON.stringify({ step: 'checks' }) + '\\n');
`
    );

    // Fake gate step (must NEVER be invoked by nightly.ts)
    const gateStep = path.join(siteDir, 'scripts', 'proof', 'fake-gate.ts');
    fs.writeFileSync(
      gateStep,
      `
import fs from 'node:fs';
fs.appendFileSync(${JSON.stringify(logFile)}, JSON.stringify({ step: 'gate' }) + '\\n');
process.exit(1);
`
    );

    // Fake Monday-only nightly step
    const mondayStep = path.join(siteDir, 'scripts', 'proof', 'fake-monday.ts');
    fs.writeFileSync(
      mondayStep,
      `
import fs from 'node:fs';
import path from 'node:path';
const idx = process.argv.indexOf('--extra-dir');
const extraDir = process.argv[idx + 1];
fs.writeFileSync(path.join(extraDir, 'monday.json'), JSON.stringify({ ran: true }));
fs.appendFileSync(${JSON.stringify(logFile)}, JSON.stringify({ step: 'monday-extra' }) + '\\n');
`
    );

    const proofStepsFile = path.join(root, 'proof-steps.cjs');
    fs.writeFileSync(
      proofStepsFile,
      `module.exports = { PROOF_STEPS: [
        { name: 'run', script: 'scripts/proof/fake-runner.ts', passThroughRunnerArgs: true },
        { name: 'coverage', script: 'scripts/proof/fake-coverage.ts', verifier: true, artifact: 'coverage.json' },
        { name: 'aggregate', script: 'scripts/proof/aggregate-results.ts' },
        { name: 'checks', script: 'scripts/proof/fake-checks.ts', check: true },
        { name: 'gate', script: 'scripts/proof/fake-gate.ts' },
      ]};`
    );

    const nightlyStepsFile = path.join(root, 'nightly-steps.cjs');
    fs.writeFileSync(
      nightlyStepsFile,
      `module.exports = { NIGHTLY_STEPS: [
        { name: 'monday-extra', script: 'scripts/proof/fake-monday.ts', env: 'content', days: [1] },
      ]};`
    );

    const baseEnv = {
      ...process.env,
      GITHUB_TOKEN: 'ghs_test_readonly',
      FRONTEND_ROCKS_ROOT: siteDir,
      FRONTEND_ROCKS_CONTENT_DIR: path.join(siteDir, 'content'),
      FR_PROOF_BUILD_DIR: path.join(siteDir, '.proof-build'),
      FR_PROOF_STEPS_FILE: proofStepsFile,
      FR_NIGHTLY_STEPS_FILE: nightlyStepsFile,
      FR_PROOF_HISTORY_DIR: path.join(siteDir, 'content', '.proof-results', 'history'),
    };

    // Monday 2026-11-30 (getUTCDay() === 1)
    const outMonday = path.join(root, 'out-monday');
    const monRes = spawnSync(
      'npx',
      [
        'tsx',
        NIGHTLY_SCRIPT,
        '--out',
        outMonday,
        '--engines',
        'firefox',
        '--previous',
        previousPath,
        '--now',
        '2026-11-30T02:17:00Z',
      ],
      { cwd: SITE_ROOT, encoding: 'utf-8', env: baseEnv }
    );
    expect(monRes.status, monRes.stderr).toBe(0);

    const events = fs
      .readFileSync(logFile, 'utf-8')
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l) as Record<string, unknown>);
    expect(events.map((e) => e.step)).toEqual(['run', 'coverage', 'checks', 'monday-extra']);
    expect(events[0].argv).toEqual([
      '--engines',
      'firefox',
      '--out',
      path.join(siteDir, 'artifacts', 'proof', 'experiments.json'),
    ]);
    expect(events[0].hasToken).toBe(false);
    expect(events[1].hasToken).toBe(true);
    expect(fs.existsSync(path.join(outMonday, 'extra', 'monday.json'))).toBe(true);

    const latest = ProofResultsSchema.parse(
      JSON.parse(fs.readFileSync(path.join(outMonday, 'latest.json'), 'utf-8'))
    );
    expect(latest.pages['demo-concept']?.coverage?.status).toBe('pass');

    // Tuesday 2026-12-01 (getUTCDay() === 2): monday-extra must NOT run
    fs.writeFileSync(logFile, '');
    const outTuesday = path.join(root, 'out-tuesday');
    const tueRes = spawnSync(
      'npx',
      [
        'tsx',
        NIGHTLY_SCRIPT,
        '--out',
        outTuesday,
        '--engines',
        'firefox',
        '--previous',
        previousPath,
        '--now',
        '2026-12-01T02:17:00Z',
      ],
      { cwd: SITE_ROOT, encoding: 'utf-8', env: baseEnv }
    );
    expect(tueRes.status, tueRes.stderr).toBe(0);
    expect(fs.existsSync(path.join(outTuesday, 'extra', 'monday.json'))).toBe(false);

    // Invalid CLI syntax (--engines=firefox) must exit with code 2 before running any step
    fs.writeFileSync(logFile, '');
    const badCli = spawnSync(
      'npx',
      ['tsx', NIGHTLY_SCRIPT, '--engines=firefox', '--out', outTuesday],
      { cwd: SITE_ROOT, encoding: 'utf-8', env: baseEnv }
    );
    expect(badCli.status).toBe(2);
    expect(fs.readFileSync(logFile, 'utf-8')).toBe('');
  }, 30_000);
});
