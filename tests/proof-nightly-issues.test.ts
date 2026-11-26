import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { NightlyDiff } from '@/lib/proof/nightly/diff';
import { buildIssues } from '@/lib/proof/nightly/issues';
import { renderPrBody } from '@/lib/proof/nightly/summary';
import { emptyProofResults, type ProofResults } from '@/lib/proof/results-schema';

const SITE_ROOT = process.cwd();
const SYNC_SCRIPT = path.join(SITE_ROOT, '.github', 'scripts', 'sync-proof-issues.sh');

function makeNextResults(overrides?: Partial<ProofResults>): ProofResults {
  return {
    ...emptyProofResults(),
    generatedAt: '2026-12-08T02:17:00.000Z',
    runner: { playwright: '1.65.1', node: '24.0.0', os: 'linux', react: null },
    engines: { chromium: '143.0.7499.4', firefox: '145.0', webkit: '26.0' },
    claims: {
      'css-container-queries/applies-at-container-width': {
        status: 'diverges',
        proofKind: 'experiment',
        engines: { chromium: 'pass', firefox: 'pass', webkit: 'fail' },
        checkedAt: '2026-12-08T02:17:00.000Z',
        provenSince: null,
        failingSince: '2026-12-01T02:17:00.000Z',
        reason: null,
        detail: 'webkit returned 1 column instead of 2',
      },
      'event-loop-tasks-microtasks/microtasks-drain-before-next-task': {
        status: 'proven',
        proofKind: 'experiment',
        engines: { chromium: 'pass', firefox: 'pass', webkit: 'pass' },
        checkedAt: '2026-12-08T02:17:00.000Z',
        provenSince: '2026-12-08T02:17:00.000Z',
        failingSince: null,
        reason: null,
        detail: null,
      },
    },
    ...overrides,
  };
}

function makeDiff(): NightlyDiff {
  return {
    at: '2026-12-08T02:17:00.000Z',
    statusChanged: [
      {
        claimId: 'css-container-queries/applies-at-container-width',
        pageId: 'css-container-queries',
        from: 'proven',
        to: 'diverges',
      },
      {
        claimId: 'event-loop-tasks-microtasks/microtasks-drain-before-next-task',
        pageId: 'event-loop-tasks-microtasks',
        from: 'diverges',
        to: 'proven',
      },
    ],
    regressions: [
      {
        claimId: 'css-container-queries/applies-at-container-width',
        pageId: 'css-container-queries',
        from: 'proven',
        to: 'diverges',
        engines: { chromium: 'pass', firefox: 'pass', webkit: 'fail' },
        detail: 'webkit returned 1 column instead of 2',
      },
    ],
    recoveries: [
      {
        claimId: 'event-loop-tasks-microtasks/microtasks-drain-before-next-task',
        pageId: 'event-loop-tasks-microtasks',
        from: 'diverges',
        to: 'proven',
      },
    ],
    engineVersionsChanged: {},
    observedChanged: [],
    infraErrors: [],
  };
}

describe('nightly issues and PR body', () => {
  const dirs: string[] = [];

  afterEach(() => {
    for (const d of dirs.splice(0)) {
      fs.rmSync(d, { recursive: true, force: true });
    }
  });

  it('generates open, day-7 comment (once), and close actions matching exact snapshots', () => {
    const next = makeNextResults();
    const diff = makeDiff();
    const statements = new Map([
      [
        'css-container-queries/applies-at-container-width',
        'A container query matches against the inline size of the nearest size container.',
      ],
    ]);

    const day7 = buildIssues(diff, next, new Date('2026-12-08T02:17:00.000Z'), {
      statementsByClaimId: statements,
    });
    expect(day7.open).toHaveLength(1);
    expect(day7.comment).toHaveLength(1);
    expect(day7.close).toHaveLength(1);
    expect(day7).toMatchSnapshot();

    // Day 6 and Day 8 must NOT emit the day-7 comment.
    const day6 = buildIssues(diff, next, new Date('2026-12-07T02:17:00.000Z'), {
      statementsByClaimId: statements,
    });
    expect(day6.comment).toHaveLength(0);

    const day8 = buildIssues(diff, next, new Date('2026-12-09T02:17:00.000Z'), {
      statementsByClaimId: statements,
    });
    expect(day8.comment).toHaveLength(0);

    const prBody = renderPrBody({
      date: '2026-12-08',
      next,
      diff,
      demotions: [
        {
          pageId: 'css-container-queries',
          kind: 'concept',
          file: 'content/concepts/css-container-queries.mdx',
          claimIds: ['css-container-queries/applies-at-container-width'],
        },
      ],
      promotions: [],
    });
    expect(prBody).toMatchSnapshot();
  });

  it('opens a duration alert issue when 30-day median exceeds 12 minutes', () => {
    const next = makeNextResults();
    const emptyDiff: NightlyDiff = {
      at: '2026-12-08T02:17:00.000Z',
      statusChanged: [],
      regressions: [],
      recoveries: [],
      engineVersionsChanged: {},
      observedChanged: [],
      infraErrors: [],
    };
    const res = buildIssues(emptyDiff, next, new Date('2026-12-08T02:17:00.000Z'), {
      medianDurationMs: 13.5 * 60_000,
    });
    expect(res.open).toHaveLength(1);
    expect(res.open[0].title).toBe('[proof] nightly duration above 12 min');
    expect(res.open[0].key).toBe('proof-health:nightly-duration');
  });

  it('sync-proof-issues.sh deduplicates existing issues, handles close/comment, and batches >20 creations (DRY_RUN=1)', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fr-sync-issues-'));
    dirs.push(dir);
    const issuesFile = path.join(dir, 'issues.json');

    // Run 1: deduplication when issue #42 already has the key
    fs.writeFileSync(
      issuesFile,
      JSON.stringify({
        open: [
          {
            key: 'proof-regression:p/existing',
            title: '[proof] p/existing now diverges',
            body: '<!-- key: proof-regression:p/existing -->\nDetail',
            labels: ['proof-regression', 'automated'],
          },
          {
            key: 'proof-regression:p/new-one',
            title: '[proof] p/new-one now failed',
            body: '<!-- key: proof-regression:p/new-one -->\nDetail',
            labels: ['proof-regression', 'automated'],
          },
        ],
        comment: [{ key: 'proof-regression:p/existing', body: 'Day 7: notice' }],
        close: [{ key: 'proof-regression:p/recovered', comment: 'Back to proven.' }],
      })
    );

    const openIssuesFixture = JSON.stringify([
      { number: 42, body: '<!-- key: proof-regression:p/existing -->\nOld body' },
      { number: 43, body: '<!-- key: proof-regression:p/recovered -->\nOld body' },
    ]);

    const res1 = spawnSync('bash', [SYNC_SCRIPT, issuesFile], {
      cwd: SITE_ROOT,
      encoding: 'utf-8',
      env: {
        ...process.env,
        DRY_RUN: '1',
        NIGHTLY_DATE: '2026-12-08',
        DRY_RUN_OPEN_ISSUES: openIssuesFixture,
      },
    });
    expect(res1.status).toBe(0);
    expect(res1.stdout).toContain('gh issue comment 42 --body-file - (key=proof-regression:p/existing)');
    expect(res1.stdout).toContain('gh issue create --title "[proof] p/new-one now failed"');
    expect(res1.stdout).toContain('gh issue comment 42 --body "Day 7: notice"');
    expect(res1.stdout).toContain('gh issue comment 43 --body "Back to proven."');
    expect(res1.stdout).toContain('gh issue close 43');

    // Run 2: >20 new regressions -> single summary issue
    const many = Array.from({ length: 22 }, (_, i) => ({
      key: `proof-regression:p/c-${i}`,
      title: `[proof] p/c-${i} now failed`,
      body: `<!-- key: proof-regression:p/c-${i} -->\nDetail`,
      labels: ['proof-regression', 'automated'],
    }));
    fs.writeFileSync(issuesFile, JSON.stringify({ open: many, comment: [], close: [] }));

    const res2 = spawnSync('bash', [SYNC_SCRIPT, issuesFile], {
      cwd: SITE_ROOT,
      encoding: 'utf-8',
      env: {
        ...process.env,
        DRY_RUN: '1',
        NIGHTLY_DATE: '2026-12-08',
        DRY_RUN_OPEN_ISSUES: '[]',
      },
    });
    expect(res2.status).toBe(0);
    expect(res2.stdout).toContain('[proof] 22 regressions in nightly 2026-12-08');
    expect(res2.stdout.match(/gh issue create/g)?.length).toBe(1);
  });
});
