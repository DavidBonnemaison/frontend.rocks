import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { SITE_ROOT } from '@/lib/paths';

interface WorkflowStep {
  uses?: string;
  run?: string;
  env?: Record<string, string>;
}

interface WorkflowJob {
  steps?: WorkflowStep[];
  env?: Record<string, string>;
}

interface WorkflowDoc {
  jobs: Record<string, WorkflowJob>;
}

describe('lab-deploy.yml security separation', () => {
  const workflowPath = path.join(SITE_ROOT, '.github', 'workflows', 'lab-deploy.yml');
  const raw = fs.readFileSync(workflowPath, 'utf-8');
  const doc = parse(raw) as WorkflowDoc;

  it('keeps the build job free of any secrets', () => {
    const buildJob = doc.jobs.build;
    expect(buildJob).toBeDefined();
    expect(JSON.stringify(buildJob)).not.toContain('secrets.');
  });

  it('isolates the deploy job holding NETLIFY_AUTH_TOKEN from checkout, npm, and unpinned npx', () => {
    const secretJobs = Object.entries(doc.jobs).filter(([, job]) =>
      JSON.stringify(job).includes('secrets.NETLIFY_AUTH_TOKEN')
    );
    expect(secretJobs.length).toBe(1);

    const [, deployJob] = secretJobs[0];
    const steps = deployJob.steps ?? [];
    for (const step of steps) {
      expect(step.uses ?? '').not.toMatch(/^actions\/checkout@/);
      if (step.run) {
        expect(step.run).not.toMatch(/\bnpm\b/);
        const npxMatches = step.run.match(/\bnpx\b[^\n]*/g) ?? [];
        for (const line of npxMatches) {
          expect(line).toMatch(/npx\s+--yes\s+netlify-cli@\d+\.\d+\.\d+\b/);
        }
      }
    }
  });
});
