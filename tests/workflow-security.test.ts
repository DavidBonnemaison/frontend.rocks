import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import YAML from 'yaml';
import { detectRunnerOutage } from '@/lib/proof/gate';
import type { ExperimentRunReport } from '@/lib/proof/results-schema';

const SITE_ROOT = process.cwd();
const WORKFLOWS_DIR = path.join(SITE_ROOT, '.github', 'workflows');

const AUDITED_WORKFLOWS = [
  'proof-nightly.yml',
  'proof-deps.yml',
  'proof-deps-report.yml',
  'ci-pr.yml',
  'ci-main-daily.yml',
  'baseline-radar.yml',
  'lab-deploy.yml',
  'leak-scan.yml',
] as const;

interface WorkflowStep {
  name?: string;
  uses?: string;
  run?: string;
  with?: Record<string, unknown>;
  env?: Record<string, unknown>;
}

interface WorkflowJob {
  permissions?: Record<string, string> | string;
  steps?: WorkflowStep[];
  env?: Record<string, unknown>;
  [k: string]: unknown;
}

interface ParsedWorkflow {
  name?: string;
  on?: Record<string, unknown> | string | string[];
  permissions?: Record<string, string> | string;
  jobs?: Record<string, WorkflowJob>;
}

const NODE_TOOL_RE = /\b(npm|npx|node|tsx)\b/;
const ALLOWED_NETLIFY_DEPLOY_RE =
  /^npx --yes netlify-cli@[0-9]+\.[0-9]+\.[0-9]+ deploy\b/;

function readWorkflow(filename: string): ParsedWorkflow {
  const raw = fs.readFileSync(path.join(WORKFLOWS_DIR, filename), 'utf-8');
  return YAML.parse(raw) as ParsedWorkflow;
}

function hasWritePermission(perms: WorkflowJob['permissions']): boolean {
  if (!perms) return false;
  if (typeof perms === 'string') return perms === 'write-all';
  return Object.values(perms).some((v) => v === 'write');
}

function jobReferencesSecrets(job: WorkflowJob): boolean {
  return JSON.stringify(job).includes('secrets.');
}

function getDisallowedNodeCommands(
  filename: string,
  jobName: string,
  job: WorkflowJob
): string[] {
  const found: string[] = [];
  for (const step of job.steps ?? []) {
    if (!step.run) continue;
    for (const rawLine of step.run.split('\n')) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      if (!NODE_TOOL_RE.test(line)) continue;

      // Two exact documented exceptions: deploy jobs in ci-main-daily.yml and lab-deploy.yml.
      if (
        filename === 'ci-main-daily.yml' &&
        jobName === 'deploy' &&
        (line === 'npm ci --ignore-scripts' || ALLOWED_NETLIFY_DEPLOY_RE.test(line))
      ) {
        continue;
      }
      if (
        filename === 'lab-deploy.yml' &&
        jobName === 'deploy' &&
        ALLOWED_NETLIFY_DEPLOY_RE.test(line)
      ) {
        continue;
      }
      found.push(line);
    }
  }
  return found;
}

function jobRunsNodeToolchain(job: WorkflowJob): boolean {
  return (job.steps ?? []).some((s) => typeof s.run === 'string' && NODE_TOOL_RE.test(s.run));
}

describe('workflow security invariants', () => {
  it('enforces strict privilege separation between Node/repo-code jobs and secret/write jobs', () => {
    for (const filename of AUDITED_WORKFLOWS) {
      const wf = readWorkflow(filename);
      const topPerms = wf.permissions;

      for (const [jobName, job] of Object.entries(wf.jobs ?? {})) {
        const effectivePerms = job.permissions ?? topPerms;
        const usesSecrets = jobReferencesSecrets(job);
        const canWrite = hasWritePermission(effectivePerms);
        const disallowedNodeCmds = getDisallowedNodeCommands(filename, jobName, job);

        if (usesSecrets || canWrite) {
          expect(
            disallowedNodeCmds,
            `${filename} job "${jobName}" has secrets/write permission and runs Node/repo commands: ${disallowedNodeCmds.join('; ')}`
          ).toEqual([]);
        }

        if (jobRunsNodeToolchain(job) && !(filename === 'ci-main-daily.yml' && jobName === 'deploy') && !(filename === 'lab-deploy.yml' && jobName === 'deploy')) {
          expect(
            usesSecrets,
            `${filename} job "${jobName}" executes Node toolchain and must not reference secrets.*`
          ).toBe(false);
          expect(
            canWrite,
            `${filename} job "${jobName}" executes Node toolchain and must only have read permissions`
          ).toBe(false);
        }
      }
    }
  });

  it('forbids pull_request_target in all audited workflows', () => {
    for (const filename of AUDITED_WORKFLOWS) {
      const wf = readWorkflow(filename);
      const on = wf.on;
      if (typeof on === 'string') {
        expect(on, filename).not.toBe('pull_request_target');
      } else if (Array.isArray(on)) {
        expect(on, filename).not.toContain('pull_request_target');
      } else if (on && typeof on === 'object') {
        expect('pull_request_target' in on, filename).toBe(false);
      }
    }
  });

  it('forbids checking out PR head refs in proof-deps-report.yml', () => {
    const wf = readWorkflow('proof-deps-report.yml');
    for (const job of Object.values(wf.jobs ?? {})) {
      for (const step of job.steps ?? []) {
        if (typeof step.uses === 'string' && step.uses.startsWith('actions/checkout')) {
          const ref = step.with?.ref;
          const refStr = typeof ref === 'string' ? ref : '';
          expect(refStr).not.toMatch(/head_sha|head_branch/);
        }
      }
    }
  });

  it('forbids paths and paths-ignore on pull_request in required-check workflows (ci-pr.yml, leak-scan.yml)', () => {
    for (const filename of ['ci-pr.yml', 'leak-scan.yml'] as const) {
      const wf = readWorkflow(filename);
      const on = wf.on as Record<string, unknown>;
      const pr = on.pull_request as Record<string, unknown> | undefined;
      expect(pr, `${filename} must trigger on pull_request`).toBeDefined();
      expect('paths' in (pr ?? {}), `${filename} must not use paths`).toBe(false);
      expect('paths-ignore' in (pr ?? {}), `${filename} must not use paths-ignore`).toBe(false);
    }
  });

  it('forbids push-to-main triggers on all public workflows except lab-deploy.yml', () => {
    const allWorkflowFiles = fs
      .readdirSync(WORKFLOWS_DIR)
      .filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'))
      .sort();

    for (const filename of allWorkflowFiles) {
      if (filename === 'lab-deploy.yml') continue;
      const wf = readWorkflow(filename);
      const on = wf.on;
      if (typeof on === 'string') {
        expect(on, filename).not.toBe('push');
      } else if (Array.isArray(on)) {
        expect(on, filename).not.toContain('push');
      } else if (on && typeof on === 'object') {
        expect('push' in on, `${filename} must not trigger on push to main`).toBe(false);
      }
    }
  });

  it('verifies ci-main-daily.yml deploys via netlify deploy --prod --no-build and has an independent nightly-health job', () => {
    const wf = readWorkflow('ci-main-daily.yml');
    const deployRun = (wf.jobs?.deploy?.steps ?? []).map((s) => s.run ?? '').join('\n');
    expect(deployRun).toMatch(/netlify-cli@[0-9]+\.[0-9]+\.[0-9]+ deploy --prod --no-build/);

    const healthJob = wf.jobs?.['nightly-health'];
    expect(healthJob).toBeDefined();
    expect(healthJob?.['continue-on-error']).toBe(true);
    expect(healthJob?.needs).toEqual([]);
  });

  it('verifies dependabot.yml targets only Playwright and ignores compatibility data packages', () => {
    const raw = fs.readFileSync(path.join(SITE_ROOT, '.github', 'dependabot.yml'), 'utf-8');
    const cfg = YAML.parse(raw) as {
      version: number;
      updates: Array<{
        'package-ecosystem': string;
        allow?: Array<{ 'dependency-name': string }>;
        ignore?: Array<{ 'dependency-name': string }>;
      }>;
    };
    expect(cfg.version).toBe(2);
    expect(cfg.updates).toHaveLength(1);
    const allowed = (cfg.updates[0].allow ?? []).map((a) => a['dependency-name']).sort();
    expect(allowed).toEqual(['@playwright/test', 'playwright']);
    const ignored = (cfg.updates[0].ignore ?? []).map((i) => i['dependency-name']).sort();
    expect(ignored).toEqual(['@mdn/browser-compat-data', 'web-features']);
  });
});

describe('gate --report-only runner outage detection', () => {
  const baseReport = (overrides?: Partial<ExperimentRunReport>): ExperimentRunReport => ({
    schemaVersion: 1,
    kind: 'experiments',
    generatedAt: '2026-12-01T02:17:00.000Z',
    runner: { playwright: '1.65.1', node: '24.0.0', os: 'linux', react: null },
    engines: { chromium: '143.0.0.0', firefox: '145.0', webkit: '26.0' },
    shard: null,
    experiments: {
      'exp-1': {
        sourceHash: 'a'.repeat(64),
        runtimeVersion: '1',
        durationMs: 100,
        vacuity: {},
        cases: {
          k1: {
            chromium: { status: 'pass', observed: { treatment: 1, control: 0 }, presented: null, error: null },
            firefox: { status: 'fail', observed: { treatment: 0, control: 0 }, presented: null, error: null },
            webkit: { status: 'pass', observed: { treatment: 1, control: 0 }, presented: null, error: null },
          },
        },
      },
    },
    ...overrides,
  });

  it('returns null when all 3 engines started and error rate is <= 20%', () => {
    expect(detectRunnerOutage([baseReport()])).toBeNull();
  });

  it('flags missing engine as a runner outage', () => {
    const missingWebkit = baseReport({
      engines: { chromium: '143.0.0.0', firefox: '145.0' },
    });
    expect(detectRunnerOutage([missingWebkit])).toContain('missing engine(s): webkit');
  });

  it('flags > 20% error cases as a runner outage', () => {
    const highErrors = baseReport({
      experiments: {
        'exp-1': {
          sourceHash: 'a'.repeat(64),
          runtimeVersion: '1',
          durationMs: 100,
          vacuity: {},
          cases: {
            k1: {
              chromium: { status: 'error', observed: { treatment: null, control: null }, presented: null, error: 'boom' },
              firefox: { status: 'pass', observed: { treatment: 1, control: 0 }, presented: null, error: null },
              webkit: { status: 'pass', observed: { treatment: 1, control: 0 }, presented: null, error: null },
            },
          },
        },
      },
    });
    expect(detectRunnerOutage([highErrors])).toContain('1/3 cases in error (> 20%)');
  });
});
