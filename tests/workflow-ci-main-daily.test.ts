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
