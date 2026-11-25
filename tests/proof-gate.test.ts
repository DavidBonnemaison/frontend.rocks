import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { Claim, EngineId } from '../src/lib/proof/claim-schema';
import {
  claimTouches,
  evaluateGate,
  type GateInput,
  type GatePageRef,
} from '../src/lib/proof/gate';
import {
  emptyProofResults,
  type CaseResult,
  type ClaimResult,
  type ExperimentRunReport,
  type ProofResults,
} from '../src/lib/proof/results-schema';

const NOW = '2026-12-10T02:17:00.000Z';

function makeExpClaim(id: string, opts?: { engines?: EngineId[]; experimentId?: string }): Claim {
  return {
    id,
    type: 'observable',
    statement: 'Observable claim statement long enough to validate.',
    scope: opts?.engines ? { engines: opts.engines } : undefined,
    proof: {
      kind: 'experiment',
      experimentId: opts?.experimentId ?? 'exp-a',
      expectKeys: ['k1'],
    },
  };
}

function makeNormClaim(id: string): Claim {
  return {
    id,
    type: 'normative',
    statement: 'Normative spec claim statement long enough.',
    proof: {
      kind: 'spec-quote',
      url: 'https://html.spec.whatwg.org/multipage/',
      anchor: 'sec',
      quote: 'Normative quote text long enough for validation.',
    },
  };
}

function makeClaimRes(status: ClaimResult['status'], proofKind: ClaimResult['proofKind'] = 'experiment'): ClaimResult {
  return {
    status,
    proofKind,
    engines: proofKind === 'experiment' ? { chromium: status === 'proven' ? 'pass' : 'fail' } : null,
    checkedAt: NOW,
    provenSince: status === 'proven' ? NOW : null,
    failingSince: status === 'failed' || status === 'diverges' ? NOW : null,
    reason: null,
    detail: status === 'proven' ? null : `${status} detail`,
  };
}

function makeResults(claims: ProofResults['claims'], pages: ProofResults['pages'] = {}): ProofResults {
  return { ...emptyProofResults(), claims, pages };
}

function makeReport(expId: string, key: string, engine: EngineId, status: CaseResult['status']): ExperimentRunReport {
  return {
    schemaVersion: 1,
    kind: 'experiments',
    generatedAt: NOW,
    runner: { playwright: '1.65.1', node: 'v24.0.0', os: 'linux', react: null },
    engines: { [engine]: '143.0' },
    shard: null,
    experiments: {
      [expId]: {
        sourceHash: 'a'.repeat(64),
        runtimeVersion: '1',
        durationMs: 10,
        vacuity: {},
        cases: {
          [key]: {
            [engine]: {
              status,
              observed: { treatment: 1, control: 0 },
              presented: null,
              error: status === 'vacuous' ? 'vacuous check failed' : status === 'error' ? 'FR_TIMEOUT' : null,
            },
          },
        },
      },
    },
  };
}

function baseGateInput(overrides?: Partial<GateInput>): GateInput {
  const page: GatePageRef = {
    id: 'p',
    kind: 'concept',
    proofStatus: 'proven',
    mdxPath: 'content/concepts/p.mdx',
  };
  const c1 = makeExpClaim('p/c1');
  return {
    pages: [page],
    claimsByPage: new Map([['p', [c1]]]),
    preview: makeResults({ 'p/c1': makeClaimRes('proven') }),
    baseline: makeResults({ 'p/c1': makeClaimRes('proven') }),
    baselineClaimsByPage: new Map([['p', [c1]]]),
    baselineProofStatus: new Map([['p', 'proven']]),
    runReports: [],
    changedFiles: new Set(),
    ...overrides,
  };
}

describe('evaluateGate and claimTouches', () => {
  it('1. passes when all claims of a proven page are proven in preview', () => {
    const out = evaluateGate(baseGateInput());
    expect(out.ok).toBe(true);
    expect(out.errors).toEqual([]);
    expect(out.warnings).toEqual([]);
  });

  it('2. errors when a claim modified by the PR (condition a) diverges in preview', () => {
    const oldClaim = makeExpClaim('p/c1');
    const newClaim: Claim = { ...oldClaim, statement: 'Updated observable claim statement long enough.' };
    const out = evaluateGate(
      baseGateInput({
        claimsByPage: new Map([['p', [newClaim]]]),
        baselineClaimsByPage: new Map([['p', [oldClaim]]]),
        preview: makeResults({ 'p/c1': makeClaimRes('diverges') }),
        changedFiles: new Set(['content/claims/p.claims.json']),
      })
    );
    expect(out.ok).toBe(false);
    expect(out.errors).toHaveLength(1);
    expect(out.errors[0]).toContain('[concept p] claim p/c1 is diverges');
  });

  it('3. warns only when an untouched proven page has a nightly regression (failed in both)', () => {
    const out = evaluateGate(
      baseGateInput({
        preview: makeResults({ 'p/c1': makeClaimRes('failed') }),
        baseline: makeResults({ 'p/c1': makeClaimRes('failed') }),
        changedFiles: new Set(['README.md']),
      })
    );
    expect(out.ok).toBe(true);
    expect(out.errors).toEqual([]);
    expect(out.warnings).toHaveLength(1);
    expect(out.warnings[0]).toMatch(/^WARN /);
  });

  it('4. warns only when an untouched normative claim drifts between baseline and preview', () => {
    const norm = makeNormClaim('p/n1');
    const out = evaluateGate(
      baseGateInput({
        claimsByPage: new Map([['p', [norm]]]),
        baselineClaimsByPage: new Map([['p', [norm]]]),
        baseline: makeResults({ 'p/n1': makeClaimRes('proven', 'spec-quote') }),
        preview: makeResults({ 'p/n1': makeClaimRes('failed', 'spec-quote') }),
        changedFiles: new Set(['README.md']),
      })
    );
    expect(out.ok).toBe(true);
    expect(out.warnings).toHaveLength(1);
  });

  it('5. warns only when only package-lock.json changed', () => {
    const out = evaluateGate(
      baseGateInput({
        baseline: makeResults({ 'p/c1': makeClaimRes('proven') }),
        preview: makeResults({ 'p/c1': makeClaimRes('failed') }),
        changedFiles: new Set(['package-lock.json']),
      })
    );
    expect(out.ok).toBe(true);
    expect(out.warnings).toHaveLength(1);
  });

  it('6. handles proof runtime changes: errors on baseline-proven experiment, warns on normative and inherited failures', () => {
    const expProven = makeExpClaim('p/exp-proven');
    const expInherited = makeExpClaim('p/exp-inherited');
    const norm = makeNormClaim('p/norm');

    const out = evaluateGate(
      baseGateInput({
        claimsByPage: new Map([['p', [expProven, expInherited, norm]]]),
        baselineClaimsByPage: new Map([['p', [expProven, expInherited, norm]]]),
        baseline: makeResults({
          'p/exp-proven': makeClaimRes('proven'),
          'p/exp-inherited': makeClaimRes('failed'),
          'p/norm': makeClaimRes('proven', 'spec-quote'),
        }),
        preview: makeResults({
          'p/exp-proven': makeClaimRes('failed'),
          'p/exp-inherited': makeClaimRes('failed'),
          'p/norm': makeClaimRes('failed', 'spec-quote'),
        }),
        changedFiles: new Set(['src/lib/proof/runtime/evaluate.ts']),
      })
    );

    expect(out.ok).toBe(false);
    expect(out.errors).toHaveLength(1);
    expect(out.errors[0]).toContain('p/exp-proven');
    expect(out.warnings).toHaveLength(2);
  });

  it('7. MDX modified alone errors on baseline-proven regression, warns on inherited failure', () => {
    const cProven = makeExpClaim('p/c1');
    const cInherited = makeExpClaim('p/c2');
    const out = evaluateGate(
      baseGateInput({
        claimsByPage: new Map([['p', [cProven, cInherited]]]),
        baselineClaimsByPage: new Map([['p', [cProven, cInherited]]]),
        baseline: makeResults({
          'p/c1': makeClaimRes('proven'),
          'p/c2': makeClaimRes('failed'),
        }),
        preview: makeResults({
          'p/c1': makeClaimRes('failed'),
          'p/c2': makeClaimRes('failed'),
        }),
        changedFiles: new Set(['content/concepts/p.mdx']),
      })
    );
    expect(out.ok).toBe(false);
    expect(out.errors).toHaveLength(1);
    expect(out.errors[0]).toContain('p/c1');
    expect(out.warnings).toHaveLength(1);
    expect(out.warnings[0]).toContain('p/c2');
  });

  it('8. vacuous on modified experiment warns outside scope and errors inside scope', () => {
    const scoped = makeExpClaim('p/c1', { engines: ['chromium'] });
    const base = baseGateInput({
      claimsByPage: new Map([['p', [scoped]]]),
      baselineClaimsByPage: new Map([['p', [scoped]]]),
      changedFiles: new Set(['content/experiments/exp-a/experiment.ts']),
    });

    const webkitVac = evaluateGate({
      ...base,
      runReports: [makeReport('exp-a', 'k1', 'webkit', 'vacuous')],
    });
    expect(webkitVac.ok).toBe(true);
    expect(webkitVac.warnings).toHaveLength(1);

    const chromiumVac = evaluateGate({
      ...base,
      runReports: [makeReport('exp-a', 'k1', 'chromium', 'vacuous')],
    });
    expect(chromiumVac.ok).toBe(false);
    expect(chromiumVac.errors).toHaveLength(1);
    expect(chromiumVac.errors[0]).toContain('[experiment exp-a] chromium k1 is vacuous');
  });

  it('9. vacuous on unmodified experiment is a warning only', () => {
    const out = evaluateGate(
      baseGateInput({
        runReports: [makeReport('exp-a', 'k1', 'chromium', 'vacuous')],
        changedFiles: new Set(),
      })
    );
    expect(out.ok).toBe(true);
    expect(out.warnings).toHaveLength(1);
  });

  it('10. error on experiment unused by any proven page is a warning only', () => {
    const out = evaluateGate(
      baseGateInput({
        runReports: [makeReport('unused-exp', 'k1', 'chromium', 'error')],
        changedFiles: new Set(['content/experiments/unused-exp/experiment.ts']),
      })
    );
    expect(out.ok).toBe(true);
    expect(out.warnings).toHaveLength(1);
  });

  it('11. unverified page with failed claims passes the gate', () => {
    const out = evaluateGate(
      baseGateInput({
        pages: [{ id: 'p', kind: 'concept', proofStatus: 'unverified', mdxPath: 'content/concepts/p.mdx' }],
        preview: makeResults({ 'p/c1': makeClaimRes('failed') }),
        changedFiles: 'all',
      })
    );
    expect(out.ok).toBe(true);
    expect(out.errors).toEqual([]);
  });

  it('12. changedFiles "all" turns inherited/untouched failures into errors', () => {
    const out = evaluateGate(
      baseGateInput({
        preview: makeResults({ 'p/c1': makeClaimRes('failed') }),
        baseline: makeResults({ 'p/c1': makeClaimRes('failed') }),
        changedFiles: 'all',
      })
    );
    expect(out.ok).toBe(false);
    expect(out.errors).toHaveLength(1);
  });

  it('13. enforced coverage failure errors when page changed, warns otherwise', () => {
    const coveragePages: ProofResults['pages'] = {
      p: {
        coverage: {
          pageId: 'p',
          status: 'fail',
          enforced: true,
          violations: [{ rule: 'unlinked', line: 10, column: 1, message: 'unlinked fact', excerpt: null }],
          stats: {},
          foreignClaimIds: [],
        },
      },
    };

    const touched = evaluateGate(
      baseGateInput({
        preview: makeResults({ 'p/c1': makeClaimRes('proven') }, coveragePages),
        changedFiles: new Set(['content/concepts/p.mdx']),
      })
    );
    expect(touched.ok).toBe(false);
    expect(touched.errors[0]).toBe('[concept p] coverage: 1 violation(s)');

    const untouched = evaluateGate(
      baseGateInput({
        preview: makeResults({ 'p/c1': makeClaimRes('proven') }, coveragePages),
        changedFiles: new Set(),
      })
    );
    expect(untouched.ok).toBe(true);
    expect(untouched.warnings[0]).toBe('WARN [concept p] coverage: 1 violation(s)');
  });

  it('14. claimTouches identifies definition, page, experiment, and ignores unrelated files', () => {
    const c1 = makeExpClaim('p/c1');
    const c2 = makeExpClaim('p/c2');
    const c2Changed: Claim = { ...c2, statement: 'Changed statement for c2 long enough.' };
    const norm = makeNormClaim('p/n1');

    const inputModifiedClaims = baseGateInput({
      claimsByPage: new Map([['p', [c1, c2Changed, norm]]]),
      baselineClaimsByPage: new Map([['p', [c1, c2, norm]]]),
      changedFiles: new Set(['content/claims/p.claims.json']),
    });
    expect(claimTouches('p', c2Changed, inputModifiedClaims)).toEqual(['definition']);
    expect(claimTouches('p', c1, inputModifiedClaims)).toEqual([]);

    const inputMdx = baseGateInput({ changedFiles: new Set(['content/concepts/p.mdx']) });
    expect(claimTouches('p', c1, inputMdx)).toEqual(['page']);

    const inputExp = baseGateInput({
      changedFiles: new Set(['content/experiments/exp-a/experiment.ts']),
    });
    expect(claimTouches('p', c1, inputExp)).toEqual(['experiment']);

    const inputRuntime = baseGateInput({
      baseline: makeResults({
        'p/c1': makeClaimRes('proven'),
        'p/c2': makeClaimRes('failed'),
      }),
      changedFiles: new Set(['src/lib/proof/x.ts']),
    });
    expect(claimTouches('p', c1, inputRuntime)).toEqual(['experiment']);
    expect(claimTouches('p', c2, inputRuntime)).toEqual([]);
    expect(claimTouches('p', norm, inputRuntime)).toEqual([]);

    const inputUnrelated = baseGateInput({
      changedFiles: new Set(['README.md', 'package-lock.json']),
    });
    expect(claimTouches('p', c1, inputUnrelated)).toEqual([]);
  });

  it('15. condition (d) promotion catches unverified->proven, new proven pages, and vs pairs', () => {
    const c1 = makeExpClaim('p/c1');
    const promotedPending = evaluateGate(
      baseGateInput({
        baseline: makeResults({ 'p/c1': makeClaimRes('pending') }),
        preview: makeResults({ 'p/c1': makeClaimRes('pending') }),
        baselineProofStatus: new Map([['p', 'unverified']]),
        changedFiles: new Set(['content/concepts/p.mdx']),
      })
    );
    expect(promotedPending.ok).toBe(false);
    expect(promotedPending.errors).toHaveLength(1);

    const promotedProven = evaluateGate(
      baseGateInput({
        baseline: makeResults({ 'p/c1': makeClaimRes('proven') }),
        preview: makeResults({ 'p/c1': makeClaimRes('proven') }),
        baselineProofStatus: new Map([['p', 'unverified']]),
        changedFiles: new Set(['content/concepts/p.mdx']),
      })
    );
    expect(promotedProven.ok).toBe(true);

    const newProven = evaluateGate(
      baseGateInput({
        baseline: makeResults({}),
        preview: makeResults({ 'p/c1': makeClaimRes('pending') }),
        baselineProofStatus: new Map([['p', null]]),
        changedFiles: new Set(['content/concepts/p.mdx']),
      })
    );
    expect(newProven.ok).toBe(false);

    const vsClaim = makeExpClaim('vs-a-vs-b/c1');
    const vsPromoted = evaluateGate(
      baseGateInput({
        pages: [{ id: 'vs-a-vs-b', kind: 'vs', proofStatus: 'proven', mdxPath: null }],
        claimsByPage: new Map([['vs-a-vs-b', [vsClaim]]]),
        baselineClaimsByPage: new Map([['vs-a-vs-b', [vsClaim]]]),
        baselineProofStatus: new Map([['vs-a-vs-b', 'unverified']]),
        baseline: makeResults({ 'vs-a-vs-b/c1': makeClaimRes('failed') }),
        preview: makeResults({ 'vs-a-vs-b/c1': makeClaimRes('failed') }),
        changedFiles: new Set(['content/vs/pairs.json']),
      })
    );
    expect(vsPromoted.ok).toBe(false);

    // Already proven on base and HEAD -> condition (d) does not apply.
    expect(claimTouches('p', c1, baseGateInput())).toEqual([]);
  });
});

describe('scripts/proof/all.ts orchestrator', () => {
  const tmpDirs: string[] = [];

  afterEach(() => {
    while (tmpDirs.length > 0) {
      fs.rmSync(tmpDirs.pop()!, { recursive: true, force: true });
    }
  });

  it('rejects glued --engines=firefox with exit code 2 before running any step', () => {
    const res = spawnSync('npx', ['tsx', 'scripts/proof/all.ts', '--engines=firefox'], {
      cwd: process.cwd(),
      encoding: 'utf-8',
    });
    expect(res.status).toBe(2);
    expect(res.stderr).toContain('--key value');
  });

  it('continues past a verifier exiting 1 with its artifact and fails after gate on a check:true step exiting 1', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fr-proof-steps-'));
    tmpDirs.push(dir);

    const logFile = path.join(dir, 'log.txt');
    const verifierScript = path.join(dir, 'fake-verifier.ts');
    const checkScript = path.join(dir, 'fake-check.ts');
    const gateScript = path.join(dir, 'fake-gate.ts');
    const stepsFile = path.join(dir, 'steps.cjs');

    fs.writeFileSync(
      verifierScript,
      `import fs from 'node:fs';
import path from 'node:path';
fs.mkdirSync(path.join(process.cwd(), 'artifacts', 'proof'), { recursive: true });
fs.writeFileSync(path.join(process.cwd(), 'artifacts', 'proof', 'fake.json'), '{}');
fs.appendFileSync(${JSON.stringify(logFile)}, 'verifier\\n');
process.exit(1);
`
    );
    fs.writeFileSync(
      checkScript,
      `import fs from 'node:fs';
fs.appendFileSync(${JSON.stringify(logFile)}, 'check\\n');
process.exit(1);
`
    );
    fs.writeFileSync(
      gateScript,
      `import fs from 'node:fs';
fs.appendFileSync(${JSON.stringify(logFile)}, 'gate\\n');
process.exit(0);
`
    );

    // Note: all.ts resolves step.script relative to SITE_ROOT.
    const relVerifier = path.relative(process.cwd(), verifierScript);
    const relCheck = path.relative(process.cwd(), checkScript);
    const relGate = path.relative(process.cwd(), gateScript);

    fs.writeFileSync(
      stepsFile,
      `exports.PROOF_STEPS = [
  { name: 'fake-verifier', script: ${JSON.stringify(relVerifier)}, artifact: 'fake.json' },
  { name: 'fake-check', script: ${JSON.stringify(relCheck)}, check: true },
  { name: 'gate', script: ${JSON.stringify(relGate)} },
];
`
    );

    const res = spawnSync('npx', ['tsx', 'scripts/proof/all.ts'], {
      cwd: process.cwd(),
      encoding: 'utf-8',
      env: { ...process.env, FR_PROOF_STEPS_FILE: stepsFile },
    });

    expect(res.status).toBe(1);
    expect(fs.readFileSync(logFile, 'utf-8').trim().split('\n')).toEqual([
      'verifier',
      'check',
      'gate',
    ]);
  });
});
