import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const SITE_ROOT = process.cwd();
const PUBLISH_SCRIPT = path.join(SITE_ROOT, '.github', 'scripts', 'publish-nightly-pr.sh');
const VALIDATE_SCRIPT = path.join(SITE_ROOT, '.github', 'scripts', 'validate-proof-artifact.sh');

function initTempRepo(root: string): string {
  const repo = path.join(root, 'repo');
  fs.mkdirSync(path.join(repo, 'content', 'concepts'), { recursive: true });
  fs.mkdirSync(path.join(repo, 'content', 'vs'), { recursive: true });
  fs.mkdirSync(path.join(repo, '.github', 'scripts'), { recursive: true });

  fs.writeFileSync(
    path.join(repo, '.github', 'scripts', 'nightly-extra.json'),
    JSON.stringify({ entries: [] }, null, 2) + '\n'
  );
  fs.writeFileSync(
    path.join(repo, 'content', 'concepts', 'concept-a.mdx'),
    '---\nid: concept-a\ntitle: Concept A\nproof_status: proven\n---\n\nBody A.\n'
  );
  fs.writeFileSync(
    path.join(repo, 'content', 'concepts', 'concept-b.mdx'),
    '---\nid: concept-b\ntitle: Concept B\nproof_status: unverified\n---\n\nBody B.\n'
  );
  fs.writeFileSync(
    path.join(repo, 'content', 'concepts', 'untouched.mdx'),
    '---\nid: untouched\ntitle: Untouched\nproof_status: proven\n---\n\nBody U.\n'
  );
  fs.writeFileSync(
    path.join(repo, 'content', 'vs', 'pairs.json'),
    JSON.stringify(
      {
        pairs: [
          { slug: 'debounce-vs-throttle', proof_status: 'proven' },
          { slug: 'grid-vs-flex', proof_status: 'unverified' },
          { slug: 'rem-vs-em', proof_status: 'proven' },
        ],
      },
      null,
      2
    ) + '\n'
  );

  const git = (args: string[]) =>
    execFileSync('git', args, { cwd: repo, encoding: 'utf-8', stdio: 'pipe' });
  git(['init', '-b', 'main']);
  git(['config', 'user.name', 'Test']);
  git(['config', 'user.email', 'test@example.com']);
  git(['add', '.']);
  git(['commit', '-m', 'init']);
  return repo;
}

function makeIncoming(
  root: string,
  demotions: unknown[],
  promotions: unknown[]
): string {
  const dir = path.join(root, 'incoming');
  fs.mkdirSync(path.join(dir, 'cache'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'extra'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'cache', '.keep'), '');
  fs.writeFileSync(path.join(dir, 'extra', '.keep'), '');
  fs.writeFileSync(
    path.join(dir, 'latest.json'),
    JSON.stringify({
      schemaVersion: 1,
      generatedAt: '2026-12-08T02:17:00.000Z',
      runner: { playwright: '1.65.1', node: '24.0.0', os: 'linux', react: null },
      engines: { chromium: '143.0.0.0', firefox: '145.0', webkit: '26.0' },
      experiments: {},
      experimentMeta: {},
      claims: {},
      pages: {},
      demotedPages: {},
    }) + '\n'
  );
  fs.writeFileSync(path.join(dir, 'demotions.json'), JSON.stringify(demotions, null, 2) + '\n');
  fs.writeFileSync(path.join(dir, 'promotions.json'), JSON.stringify(promotions, null, 2) + '\n');
  fs.writeFileSync(
    path.join(dir, 'diff.json'),
    JSON.stringify({
      at: '2026-12-08T02:17:00.000Z',
      statusChanged: [],
      regressions: [],
      recoveries: [],
      engineVersionsChanged: {},
      observedChanged: [],
      infraErrors: [],
    })
  );
  fs.writeFileSync(
    path.join(dir, 'issues.json'),
    JSON.stringify({ open: [], comment: [], close: [] })
  );
  fs.writeFileSync(
    path.join(dir, 'history-line.jsonl'),
    JSON.stringify({ kind: 'run', at: '2026-12-08T02:17:00.000Z', durationMs: 1000, infraErrors: 0 }) +
      '\n'
  );
  fs.writeFileSync(path.join(dir, 'pr-body.md'), '## Nightly\n');
  fs.writeFileSync(path.join(dir, 'summary.md'), '## Summary\n');
  return dir;
}

describe('nightly demotions and promotions via publish-nightly-pr.sh', () => {
  const dirs: string[] = [];

  afterEach(() => {
    for (const d of dirs.splice(0)) {
      fs.rmSync(d, { recursive: true, force: true });
    }
  });

  it('updates only proof_status on listed MDX and /vs pairs and leaves unlisted pages untouched', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fr-nightly-demote-'));
    dirs.push(root);
    const repo = initTempRepo(root);
    const incoming = makeIncoming(
      root,
      [
        {
          pageId: 'concept-a',
          kind: 'concept',
          file: 'content/concepts/concept-a.mdx',
          claimIds: ['concept-a/c1'],
        },
        {
          pageId: 'vs-debounce-vs-throttle',
          kind: 'vs',
          file: 'content/vs/pairs.json',
          claimIds: ['vs-debounce-vs-throttle/c1'],
        },
      ],
      [
        {
          pageId: 'concept-b',
          kind: 'concept',
          file: 'content/concepts/concept-b.mdx',
          claimIds: ['concept-b/c1'],
        },
        {
          pageId: 'vs-grid-vs-flex',
          kind: 'vs',
          file: 'content/vs/pairs.json',
          claimIds: ['vs-grid-vs-flex/c1'],
        },
      ]
    );

    const val = spawnSync('bash', [VALIDATE_SCRIPT, incoming], {
      cwd: repo,
      encoding: 'utf-8',
    });
    expect(val.status).toBe(0);

    const pub = spawnSync('bash', [PUBLISH_SCRIPT, incoming], {
      cwd: repo,
      encoding: 'utf-8',
      env: {
        ...process.env,
        DRY_RUN: '1',
        NIGHTLY_DATE: '2026-12-08',
        DRY_RUN_OPEN_PRS: JSON.stringify([{ number: 77, headRefName: 'proof/nightly-2026-12-07' }]),
      },
    });
    expect(pub.status).toBe(0);
    expect(pub.stdout).toContain('gh pr close 77');
    expect(pub.stdout).toContain('git push origin proof/nightly-2026-12-08');
    expect(pub.stdout).toContain('gh pr merge <PR_URL> --auto --squash --delete-branch');

    // Verify exact file updates
    expect(fs.readFileSync(path.join(repo, 'content/concepts/concept-a.mdx'), 'utf-8')).toContain(
      'proof_status: unverified'
    );
    expect(fs.readFileSync(path.join(repo, 'content/concepts/concept-b.mdx'), 'utf-8')).toContain(
      'proof_status: proven'
    );
    expect(fs.readFileSync(path.join(repo, 'content/concepts/untouched.mdx'), 'utf-8')).toContain(
      'proof_status: proven'
    );

    const pairs = JSON.parse(
      fs.readFileSync(path.join(repo, 'content/vs/pairs.json'), 'utf-8')
    ) as { pairs: Array<{ slug: string; proof_status: string }> };
    expect(pairs.pairs).toEqual([
      { slug: 'debounce-vs-throttle', proof_status: 'unverified' },
      { slug: 'grid-vs-flex', proof_status: 'proven' },
      { slug: 'rem-vs-em', proof_status: 'proven' },
    ]);

    // Verify commit only touched allowed files
    const changed = execFileSync('git', ['show', '--name-only', '--pretty=format:', 'HEAD'], {
      cwd: repo,
      encoding: 'utf-8',
    })
      .trim()
      .split('\n')
      .sort();
    expect(changed).toEqual([
      'content/.proof-results/history/2026-12.jsonl',
      'content/.proof-results/latest.json',
      'content/concepts/concept-a.mdx',
      'content/concepts/concept-b.mdx',
      'content/vs/pairs.json',
    ]);
  });

  it('rejects a demotion pointing to a file outside the allowed regex', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fr-nightly-bad-file-'));
    dirs.push(root);
    const repo = initTempRepo(root);
    const incoming = makeIncoming(
      root,
      [
        {
          pageId: 'evil-page',
          kind: 'concept',
          file: 'package.json',
          claimIds: ['evil-page/c1'],
        },
      ],
      []
    );
    const val = spawnSync('bash', [VALIDATE_SCRIPT, incoming], {
      cwd: repo,
      encoding: 'utf-8',
    });
    expect(val.status).not.toBe(0);
  });
});
