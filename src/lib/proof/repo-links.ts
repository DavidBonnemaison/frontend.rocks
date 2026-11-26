import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { SITE_ROOT } from '../paths';

export const PUBLIC_REPO = 'https://github.com/DavidBonnemaison/frontend.rocks';

export interface RepoLinkItem {
  label: string;
  repoPath: string;
  href: string;
  kind: 'verifier' | 'workflow' | 'results' | 'actions';
}

const VERIFIER_PATHS: ReadonlyArray<{ label: string; repoPath: string }> = [
  { label: 'Experiment runner', repoPath: 'scripts/proof/run-experiments.ts' },
  { label: 'Spec quote verifier', repoPath: 'scripts/proof/verify-spec-quotes.ts' },
  { label: 'Engine source verifier', repoPath: 'scripts/proof/verify-source-quotes.ts' },
  { label: 'Browser support verifier', repoPath: 'scripts/proof/check-support.ts' },
  { label: 'Coverage verifier', repoPath: 'scripts/proof/check-coverage.ts' },
  { label: 'Nightly orchestrator', repoPath: 'scripts/proof/nightly.ts' },
  { label: 'Claim status rules', repoPath: 'src/lib/proof/claim-status.ts' },
];

const WORKFLOW_PATHS: ReadonlyArray<{ label: string; repoPath: string }> = [
  { label: 'Nightly proof workflow', repoPath: '.github/workflows/proof-nightly.yml' },
  { label: 'Pull request CI workflow', repoPath: '.github/workflows/ci-pr.yml' },
];

const RESULT_PATHS: ReadonlyArray<{ label: string; repoPath: string }> = [
  { label: 'Latest machine results', repoPath: 'content/.proof-results/latest.json' },
  { label: 'Nightly run history', repoPath: 'content/.proof-results/history' },
];

export function getBuildCommit(rootDir: string = SITE_ROOT): string {
  try {
    const sha = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: rootDir,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return /^[0-9a-f]{40}$/.test(sha) ? sha : 'main';
  } catch {
    return 'main';
  }
}

export function buildRepoBlobUrl(repoPath: string, commit: string, isDir = false): string {
  const segment = isDir ? 'tree' : 'blob';
  return `${PUBLIC_REPO}/${segment}/${commit}/${repoPath}`;
}

export function getVerifierRepoLinks(
  commit: string = getBuildCommit(),
  rootDir: string = SITE_ROOT
): RepoLinkItem[] {
  const out: RepoLinkItem[] = [];

  const pushIfExists = (
    entries: ReadonlyArray<{ label: string; repoPath: string }>,
    kind: RepoLinkItem['kind']
  ) => {
    for (const entry of entries) {
      const fullPath = path.join(rootDir, entry.repoPath);
      if (!fs.existsSync(fullPath)) continue;
      const isDir = fs.statSync(fullPath).isDirectory();
      out.push({
        label: entry.label,
        repoPath: entry.repoPath,
        href: buildRepoBlobUrl(entry.repoPath, commit, isDir),
        kind,
      });
    }
  };

  pushIfExists(VERIFIER_PATHS, 'verifier');
  pushIfExists(WORKFLOW_PATHS, 'workflow');

  if (fs.existsSync(path.join(rootDir, '.github/workflows/proof-nightly.yml'))) {
    out.push({
      label: 'Nightly workflow runs',
      repoPath: '.github/workflows/proof-nightly.yml',
      href: `${PUBLIC_REPO}/actions/workflows/proof-nightly.yml`,
      kind: 'actions',
    });
  }

  pushIfExists(RESULT_PATHS, 'results');

  return out;
}
