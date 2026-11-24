import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

type Step = { name?: string; uses?: string; run?: string; env?: Record<string, string> };
type Job = { needs?: string | string[]; if?: string; steps: Step[] };
type Workflow = { on: Record<string, unknown>; jobs: Record<string, Job> };

const workflowsDir = path.join(process.cwd(), '.github', 'workflows');

function load(name: string): { raw: string; wf: Workflow } {
  const raw = fs.readFileSync(path.join(workflowsDir, name), 'utf8');
  return { raw, wf: parse(raw) as Workflow };
}

function runLines(job: Job): string[] {
  return job.steps.flatMap((s) => (s.run ? s.run.split('\n').map((l) => l.trim()) : []));
}

describe('ci-main-daily.yml', () => {
  const { raw, wf } = load('ci-main-daily.yml');

  it('has no push trigger', () => {
    expect(Object.keys(wf.on)).toEqual(['schedule', 'workflow_dispatch']);
    expect(wf.on).not.toHaveProperty('push');
    expect(wf.on).not.toHaveProperty('pull_request');
    expect(wf.on).not.toHaveProperty('pull_request_target');
  });

  it('keeps secrets out of build-and-test', () => {
    expect(JSON.stringify(wf.jobs['build-and-test'])).not.toContain('secrets.');
    expect(JSON.stringify(wf.jobs['check-changes'])).not.toContain('secrets.');
  });

  it('gives the deploy job the Netlify token and no repository code execution', () => {
    const deploy = wf.jobs.deploy;
    const jobText = JSON.stringify(deploy);
    expect(jobText).toContain('secrets.NETLIFY_AUTH_TOKEN');
    expect(jobText).toContain('secrets.NETLIFY_SITE_ID');

    const lines = runLines(deploy).filter(Boolean);
    for (const line of lines) {
      expect(line, line).not.toMatch(/\bnpm run\b/);
      expect(line, line).not.toMatch(/\bnpx tsx\b/);
      expect(line, line).not.toMatch(/(^|[\s;&|])node\s/);
    }
    const installs = lines.filter((l) => /\bnpm (ci|install|i)\b/.test(l));
    expect(installs.length).toBeGreaterThan(0);
    for (const line of installs) {
      expect(line).toMatch(/^npm ci --ignore-scripts$/);
    }
  });

  it('deploys with an exact netlify-cli version, prod, no build, from dist', () => {
    const lines = runLines(wf.jobs.deploy).filter((l) => l.includes('netlify-cli'));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/netlify-cli@\d+\.\d+\.\d+ deploy /);
    expect(lines[0]).toContain('--prod');
    expect(lines[0]).toContain('--no-build');
    expect(lines[0]).toContain('--dir dist');
  });

  it('runs the full gate: lint, full E2E suite and Lighthouse, before the artifact upload', () => {
    const lines = runLines(wf.jobs['build-and-test']);
    expect(lines).toContain('npm run lint');
    expect(lines).toContain('npm run build-prod');
    expect(lines.filter((l) => l.startsWith('npx playwright test'))).toEqual([
      'npx playwright test --project=chromium',
    ]);
    expect(lines.some((l) => l.includes('@lhci/cli') && l.includes('autorun'))).toBe(true);
    const text = JSON.stringify(wf.jobs['build-and-test'].steps);
    expect(text).not.toContain('EXPORTS_SKIP_OG');
    expect(text.indexOf('@lhci/cli')).toBeLessThan(text.indexOf('site-dist'));
  });

  it('only deploys what build-and-test produced', () => {
    expect(wf.jobs.deploy.needs).toBe('build-and-test');
    expect(raw).toContain('name: site-dist');
  });
});

describe('ci-pr.yml', () => {
  const { raw, wf } = load('ci-pr.yml');

  it('has no path filter at the trigger level', () => {
    expect(raw).not.toMatch(/paths(-ignore)?:/);
    expect(wf.on).not.toHaveProperty('push');
    expect(wf.on).not.toHaveProperty('pull_request_target');
  });

  it('aggregates every job in ci-result and uses no secret', () => {
    const others = Object.keys(wf.jobs).filter((j) => j !== 'ci-result');
    expect(others).toEqual(expect.arrayContaining(['changes', 'gate']));
    expect([...(wf.jobs['ci-result'].needs as string[])].sort()).toEqual([...others].sort());
    expect(wf.jobs['ci-result'].if).toBe('always()');
    expect(raw).not.toContain('secrets.');
  });
});

describe('ci-pr.yml gate', () => {
  const { wf } = load('ci-pr.yml');
  const lines = runLines(wf.jobs.gate);

  it('runs typecheck, lint, tests and content validation', () => {
    for (const command of ['npm run typecheck', 'npm run lint', 'npm test', 'npm run validate:content']) {
      expect(lines).toContain(command);
    }
  });

  it('builds without OG images and only runs the smoke E2E tests on chromium', () => {
    const build = wf.jobs.gate.steps.find((s) => s.run === 'npm run build-prod');
    expect(build?.env?.EXPORTS_SKIP_OG).toBe('1');
    expect(lines).toContain('npx playwright test --grep @smoke --project=chromium');
    expect(lines.some((l) => l.includes('generate:lab-previews'))).toBe(false);
  });
});

describe('workflows', () => {
  it('pin the Node 24 majors of the official actions', () => {
    for (const name of fs.readdirSync(workflowsDir)) {
      const { raw } = load(name);
      expect(raw, name).not.toMatch(/uses: actions\/(checkout|setup-node|upload-artifact|download-artifact|cache)@v[1-4]\b/);
    }
  });
});

describe('post-deploy-seo.yml', () => {
  it('only runs on workflow_dispatch', () => {
    const { wf } = load('post-deploy-seo.yml');
    expect(Object.keys(wf.on)).toEqual(['workflow_dispatch']);
  });
});

describe('leak-scan.yml', () => {
  it('has no secret, no path filter, and passes PR metadata through env', () => {
    const { raw, wf } = load('leak-scan.yml');
    expect(raw).not.toContain('secrets.');
    expect(raw).not.toMatch(/paths(-ignore)?:/);
    expect(wf.on).not.toHaveProperty('pull_request_target');
    const run = runLines(wf.jobs['leak-scan']).join('\n');
    expect(run).not.toContain('github.event');
  });
});
