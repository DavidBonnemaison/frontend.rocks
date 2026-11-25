import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ProofArtifactSchema } from '@/lib/proof/artifact-schema';
import type { Claim } from '@/lib/proof/claim-schema';
import {
  writeCoverageLabels,
  writeCoverageMeta,
  type CoverageLabel,
  type CoverageMeta,
} from '@/lib/proof/coverage/cache';
import { checkPageCoverage, extractForeignClaimIds } from '@/lib/proof/coverage/check-page';
import { classifierKey, overreachKey } from '@/lib/proof/coverage/keys';

const META: CoverageMeta = {
  schemaVersion: 1,
  epochs: {
    classifier: '3f9a1c0d7e2b4a61',
    overreach: 'b0e4d2c9a8f71356',
  },
};

const LOCAL_CLAIM: Claim = {
  id: 'demo-page/drains',
  type: 'observable',
  statement: 'Every queued microtask runs before the event loop picks the next task.',
  scope: { engines: ['chromium', 'firefox', 'webkit'] },
  proof: {
    kind: 'experiment',
    experimentId: 'microtask-order',
    expectKeys: ['before-timer'],
  },
};

const ORPHAN_CLAIM: Claim = {
  id: 'demo-page/unused',
  type: 'normative',
  statement: 'A microtask checkpoint runs after each script evaluation finishes.',
  proof: {
    kind: 'spec-quote',
    url: 'https://html.spec.whatwg.org/multipage/webappapis.html',
    anchor: 'perform-a-microtask-checkpoint',
    quote: 'When a user agent is to perform a microtask checkpoint, run the oldest microtask.',
  },
};

const FOREIGN_CLAIM: Claim = {
  id: 'other-page/x',
  type: 'observable',
  statement: 'An @container rule applies when the container is wide enough regardless of viewport.',
  proof: {
    kind: 'experiment',
    experimentId: 'container-query-inline-size',
    expectKeys: ['applies-at-480'],
  },
};

const CLAIMS_BY_ID = new Map<string, Claim>([
  [LOCAL_CLAIM.id, LOCAL_CLAIM],
  [ORPHAN_CLAIM.id, ORPHAN_CLAIM],
  [FOREIGN_CLAIM.id, FOREIGN_CLAIM],
]);

describe('checkPageCoverage', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    while (tempDirs.length > 0) {
      fs.rmSync(tempDirs.pop()!, { recursive: true, force: true });
    }
  });

  it('passes when all unlinked sentences are non-factual and linked units are ok, while counting orphanClaims', () => {
    const raw = [
      '---',
      'id: demo-page',
      '---',
      '',
      '<C id="drains">Every queued microtask runs before the next task.</C> Use a microtask when order matters.',
      '',
      'See <C id="other-page/x">an @container rule applies at container width</C> for layout.',
      '',
    ].join('\n');

    const labels = new Map<string, CoverageLabel>([
      [classifierKey(META.epochs.classifier, 'Use a microtask when order matters.'), 'non-factual'],
      [
        overreachKey(META.epochs.overreach, 'Every queued microtask runs before the next task.', [
          {
            id: LOCAL_CLAIM.id,
            statement: LOCAL_CLAIM.statement,
            engines: LOCAL_CLAIM.scope?.engines ?? null,
            proofKind: LOCAL_CLAIM.proof.kind,
            bcdKey: null,
          },
        ]),
        'ok',
      ],
      [
        overreachKey(
          META.epochs.overreach,
          'See an @container rule applies at container width for layout.',
          [
            {
              id: FOREIGN_CLAIM.id,
              statement: FOREIGN_CLAIM.statement,
              engines: null,
              proofKind: FOREIGN_CLAIM.proof.kind,
              bcdKey: null,
            },
          ]
        ),
        'ok',
      ],
    ]);

    const res = checkPageCoverage({
      pageId: 'demo-page',
      raw,
      claimsById: CLAIMS_BY_ID,
      enforced: true,
      meta: META,
      labels,
    });

    expect(res.status).toBe('pass');
    expect(res.violations).toEqual([]);
    expect(res.stats.orphanClaims).toBe(1);
    expect(res.foreignClaimIds).toEqual(['other-page/x']);
  });

  it('reports coverage/uncovered-factual, coverage/advice-factual, and coverage/overreach', () => {
    const raw = [
      '---',
      'id: demo-page',
      '---',
      '',
      'Unlinked browser engines always flush microtasks immediately.',
      '',
      '<Advice>Prefer promises because they run ten times faster than timers.</Advice>',
      '',
      '<C id="drains">Every queued microtask runs before the next task and makes rendering twice as fast.</C>',
      '',
    ].join('\n');

    const labels = new Map<string, CoverageLabel>([
      [
        classifierKey(
          META.epochs.classifier,
          'Unlinked browser engines always flush microtasks immediately.'
        ),
        'factual',
      ],
      [
        classifierKey(
          META.epochs.classifier,
          'Prefer promises because they run ten times faster than timers.'
        ),
        'factual',
      ],
      [
        overreachKey(
          META.epochs.overreach,
          'Every queued microtask runs before the next task and makes rendering twice as fast.',
          [
            {
              id: LOCAL_CLAIM.id,
              statement: LOCAL_CLAIM.statement,
              engines: LOCAL_CLAIM.scope?.engines ?? null,
              proofKind: LOCAL_CLAIM.proof.kind,
              bcdKey: null,
            },
          ]
        ),
        'overreach',
      ],
    ]);

    const res = checkPageCoverage({
      pageId: 'demo-page',
      raw,
      claimsById: CLAIMS_BY_ID,
      enforced: true,
      meta: META,
      labels,
    });

    expect(res.status).toBe('fail');
    expect(res.violations.map((v) => ({ rule: v.rule, line: v.line }))).toEqual([
      { rule: 'coverage/uncovered-factual', line: 5 },
      { rule: 'coverage/advice-factual', line: 7 },
      { rule: 'coverage/overreach', line: 9 },
    ]);
    expect(res.stats.factualUnlinked).toBe(2);
    expect(res.stats.overreach).toBe(1);
  });

  it('reports unknown-claim, claim-block, claim-too-long, nested-claim, cache-miss, and mdx-parse-error', () => {
    // unknown-claim + cache-miss
    const rawUnknown = `---\nid: demo-page\n---\n\n<C id="missing">Some unknown claim text here.</C> Another unchecked sentence here.\n`;
    const resUnknown = checkPageCoverage({
      pageId: 'demo-page',
      raw: rawUnknown,
      claimsById: CLAIMS_BY_ID,
      enforced: true,
      meta: META,
      labels: new Map(),
    });
    expect(resUnknown.violations.map((v) => v.rule)).toContain('coverage/unknown-claim');
    expect(resUnknown.violations.map((v) => v.rule)).toContain('coverage/cache-miss');

    // meta === null -> single cache-miss summary with count
    const rawMetaNull = `---\nid: demo-page\n---\n\nFirst unchecked sentence in prose. Second unchecked sentence in prose.\n`;
    const resMetaNull = checkPageCoverage({
      pageId: 'demo-page',
      raw: rawMetaNull,
      claimsById: CLAIMS_BY_ID,
      enforced: true,
      meta: null,
      labels: new Map(),
    });
    expect(resMetaNull.violations).toHaveLength(1);
    expect(resMetaNull.violations[0].rule).toBe('coverage/cache-miss');
    expect(resMetaNull.violations[0].message).toContain('2 items unchecked');
    expect(resMetaNull.stats.cacheMisses).toBe(2);

    // claim-block, claim-too-long, nested-claim
    const rawStruct = [
      '---',
      'id: demo-page',
      '---',
      '',
      '<C id="drains">',
      '',
      'Block wrapped paragraph here.',
      '',
      '</C>',
      '',
      '<C id="drains">One sentence here. Two sentences here. Three sentences here.</C>',
      '',
      '<C id="drains">Outer <C id="unused">inner</C> text here.</C>',
      '',
    ].join('\n');
    const resStruct = checkPageCoverage({
      pageId: 'demo-page',
      raw: rawStruct,
      claimsById: CLAIMS_BY_ID,
      enforced: true,
      meta: META,
      labels: new Map(),
    });
    const rules = new Set(resStruct.violations.map((v) => v.rule));
    expect(rules.has('coverage/claim-block')).toBe(true);
    expect(rules.has('coverage/claim-too-long')).toBe(true);
    expect(rules.has('coverage/nested-claim')).toBe(true);

    // mdx-parse-error
    const resBroken = checkPageCoverage({
      pageId: 'demo-page',
      raw: `---\nid: demo-page\n---\n\n<C id="drains">Unclosed\n`,
      claimsById: CLAIMS_BY_ID,
      enforced: true,
      meta: META,
      labels: new Map(),
    });
    expect(resBroken.status).toBe('fail');
    expect(resBroken.violations[0].rule).toBe('coverage/mdx-parse-error');
  });

  it('extracts foreignClaimIds cleanly for skipped pages', () => {
    const raw = `---\nid: demo-page\n---\n\n<C id="other-page/x">Cross-page fact.</C> <SpecQuote claim="alpha/spec" />\n`;
    expect(extractForeignClaimIds(raw, 'demo-page')).toEqual(['alpha/spec', 'other-page/x']);
  });

  it('CLI proof:coverage writes valid artifact, handles skipped/foreignClaimIds, and honors exit codes (0 vs 1 with --strict)', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'coverage-cli-'));
    tempDirs.push(tmpDir);
    const contentDir = path.join(tmpDir, 'content');
    const conceptsDir = path.join(contentDir, 'concepts');
    const claimsDir = path.join(contentDir, 'claims');
    const cacheDir = path.join(contentDir, '.proof-cache', 'coverage');
    fs.mkdirSync(conceptsDir, { recursive: true });
    fs.mkdirSync(claimsDir, { recursive: true });
    fs.mkdirSync(cacheDir, { recursive: true });

    const provenMdx = [
      '---',
      'id: proven-demo',
      'title: Proven Demo',
      'domain: js-runtime',
      'proof_status: proven',
      'summary_tldr: Demo page for coverage CLI testing.',
      'relations: []',
      'sources: ["https://html.spec.whatwg.org/multipage/webappapis.html"]',
      'keywords: [demo]',
      'last_verified_at: "2026-11-25"',
      '---',
      '',
      'Unlinked factual sentence about microtasks running first.',
      '',
    ].join('\n');

    const unverifiedMdx = [
      '---',
      'id: draft-demo',
      'title: Draft Demo',
      'domain: js-runtime',
      'proof_status: unverified',
      'summary_tldr: Unverified page citing a foreign claim.',
      'relations: []',
      'sources: ["https://html.spec.whatwg.org/multipage/webappapis.html"]',
      'keywords: [draft]',
      'last_verified_at: "2026-11-25"',
      '---',
      '',
      '<C id="other-page/x">Cited from another page.</C>',
      '',
    ].join('\n');

    fs.writeFileSync(path.join(conceptsDir, 'proven-demo.mdx'), provenMdx, 'utf-8');
    fs.writeFileSync(path.join(conceptsDir, 'draft-demo.mdx'), unverifiedMdx, 'utf-8');

    writeCoverageMeta(META, cacheDir);
    writeCoverageLabels(
      'proven-demo',
      new Map([
        [
          classifierKey(
            META.epochs.classifier,
            'Unlinked factual sentence about microtasks running first.'
          ),
          'factual',
        ],
      ]),
      cacheDir
    );

    const outPath = path.join(tmpDir, 'coverage.json');
    const scriptPath = path.resolve(__dirname, '../scripts/proof/check-coverage.ts');
    const siteRoot = path.resolve(__dirname, '..');
    const tsxBin = path.join(siteRoot, 'node_modules', '.bin', 'tsx');

    // Run without --strict: exit 0 even with violations
    const runNormal = spawnSync(tsxBin, [scriptPath, '--out', outPath], {
      cwd: siteRoot,
      env: { ...process.env, FRONTEND_ROCKS_CONTENT_DIR: contentDir },
      encoding: 'utf-8',
    });
    expect(runNormal.status).toBe(0);

    const artifact = ProofArtifactSchema.parse(JSON.parse(fs.readFileSync(outPath, 'utf-8')));
    expect(artifact.kind).toBe('coverage');
    expect(artifact.mode).toBe('offline');
    expect(artifact.tooling).toEqual({});
    expect(artifact.claims).toEqual({});

    expect(artifact.pages['proven-demo'].status).toBe('fail');
    expect(artifact.pages['proven-demo'].enforced).toBe(true);
    expect(artifact.pages['proven-demo'].violations[0]).toMatchObject({
      rule: 'coverage/uncovered-factual',
      line: 13,
    });

    expect(artifact.pages['draft-demo']).toMatchObject({
      pageId: 'draft-demo',
      status: 'skipped',
      enforced: false,
      violations: [],
      foreignClaimIds: ['other-page/x'],
    });

    // Run with --strict: exit 1 because proven-demo is enforced and failing
    const runStrict = spawnSync(tsxBin, [scriptPath, '--strict', '--out', outPath], {
      cwd: siteRoot,
      env: { ...process.env, FRONTEND_ROCKS_CONTENT_DIR: contentDir },
      encoding: 'utf-8',
    });
    expect(runStrict.status).toBe(1);
  }, 15_000);
});
