import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildDigestDraft,
  computeIsoWeekId,
  detectObsolescenceCandidates,
  extractBrowserSupport,
  formatBaselineRadarMarkdown,
  mapBaselineToMaturity,
  syncBaselineRadar,
  type BaselineChange,
  type PublicationSignal,
} from '@/lib/baseline-radar';
import {
  diffSupportSnapshots,
  type SupportSnapshot,
} from '@/lib/proof/support/snapshot';
import { WeeklyDigestSchema, type ConceptFrontmatter } from '@/lib/schemas';

function makeConcept(overrides: Partial<ConceptFrontmatter>): ConceptFrontmatter {
  return {
    id: 'sample-concept',
    title: 'Sample Concept',
    domain: 'web-apis',
    maturity_status: 'interop-experimental',
    summary_tldr: 'A concise summary of a sample web platform concept for testing purposes.',
    relations: [],
    sources: ['https://developer.mozilla.org/en-US/docs/Web/API'],
    last_verified_at: '2026-11-10',
    proof_status: 'unverified',
    web_feature_id: 'popover',
    ...overrides,
  };
}

function makeSnapshot(overrides: Partial<SupportSnapshot> = {}): SupportSnapshot {
  return {
    generatedAt: '2026-11-25T00:00:00.000Z',
    dataVersions: { bcd: '8.1.8', webFeatures: '3.47.0' },
    features: {
      'container-queries': {
        baseline: 'low',
        lowDate: '2023-02-14',
        highDate: null,
        support: {
          chrome: '105',
          chrome_android: '105',
          edge: '105',
          firefox: '110',
          firefox_android: '110',
          safari: '16',
          safari_ios: '16',
        },
      },
    },
    bcdKeys: {},
    ...overrides,
  };
}

describe('Compatibility data radar', () => {
  describe('mapBaselineToMaturity & extractBrowserSupport', () => {
    it('maps web-features baseline values to MaturityStatus', () => {
      expect(mapBaselineToMaturity('high')).toBe('baseline-widely');
      expect(mapBaselineToMaturity('low')).toBe('baseline-newly');
      expect(mapBaselineToMaturity(false)).toBe('interop-experimental');
      expect(mapBaselineToMaturity(undefined)).toBe('interop-experimental');
    });

    it('normalizes browser versions and baseline notes', () => {
      const support = extractBrowserSupport(
        {
          kind: 'feature',
          status: {
            baseline: 'high',
            baseline_high_date: '2026-10-16',
            support: { chrome: '114', firefox: '≤125', safari: '17' },
          },
        },
        'baseline-widely'
      );

      expect(support).toEqual({
        baseline_status: 'baseline-widely',
        chrome: '114+',
        firefox: '125+',
        safari: '17+',
        notes: 'Baseline Widely Available since 2026-10-16.',
      });
    });

    it('marks missing browser versions as Not supported', () => {
      const support = extractBrowserSupport(
        {
          kind: 'feature',
          status: {
            baseline: false,
            support: { chrome: '129' },
          },
        },
        'interop-experimental'
      );

      expect(support.chrome).toBe('129+');
      expect(support.firefox).toBe('Not supported');
      expect(support.safari).toBe('Not supported');
    });
  });

  describe('diffSupportSnapshots & syncBaselineRadar', () => {
    it('detects Baseline low -> high transition and lists affected pages in report without mutating content', () => {
      const prev = makeSnapshot();
      const next = makeSnapshot({
        features: {
          'container-queries': {
            ...prev.features['container-queries'],
            baseline: 'high',
            highDate: '2025-08-14',
          },
        },
      });

      const diffs = diffSupportSnapshots(prev, next, {
        featureToPages: new Map([['container-queries', ['css-container-queries']]]),
      });
      expect(diffs).toHaveLength(1);
      expect(diffs[0]).toMatchObject({
        kind: 'baseline',
        id: 'container-queries',
        affectedPages: ['css-container-queries'],
      });

      const report = syncBaselineRadar({
        rootDir: process.cwd(),
        dryRun: false,
        previousSnapshot: prev,
        nextSnapshot: next,
      });

      expect(report.updatedFiles).toEqual([]);
      const cqChange = report.changes.find((c) => c.conceptId === 'css-container-queries');
      expect(cqChange).toBeDefined();
      expect(cqChange?.previousMaturity).toBe('baseline-newly');
      expect(cqChange?.nextMaturity).toBe('baseline-widely');
      expect(cqChange?.maturityChanged).toBe(true);

      const md = formatBaselineRadarMarkdown(report);
      expect(md).toContain('css-container-queries');
      expect(md).toContain('`baseline-newly` -> `baseline-widely`');
    });

    it('detects BCD browser support changes in diffSupportSnapshots', () => {
      const prev = makeSnapshot({
        bcdKeys: {
          'css.at-rules.container': {
            chrome: { status: 'supported', since: '105' },
            chrome_android: { status: 'supported', since: '105' },
            edge: { status: 'supported', since: '105' },
            firefox: { status: 'unsupported', since: null },
            firefox_android: { status: 'unsupported', since: null },
            safari: { status: 'supported', since: '16' },
            safari_ios: { status: 'supported', since: '16' },
          },
        },
      });
      const next = makeSnapshot({
        bcdKeys: {
          'css.at-rules.container': {
            ...prev.bcdKeys['css.at-rules.container'],
            firefox: { status: 'supported', since: '110' },
          },
        },
      });

      const diffs = diffSupportSnapshots(prev, next, {
        bcdKeyToPages: new Map([['css.at-rules.container', ['css-container-queries']]]),
      });
      expect(diffs).toHaveLength(1);
      expect(diffs[0]).toMatchObject({
        kind: 'browser',
        id: 'css.at-rules.container',
        affectedPages: ['css-container-queries'],
      });
    });

    it('never modifies content/concepts or content/evidence on a temp corpus', () => {
      const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'radar-nomutate-'));
      try {
        const conceptsDir = path.join(tmpRoot, 'content', 'concepts');
        const evidenceDir = path.join(tmpRoot, 'content', 'evidence');
        fs.mkdirSync(conceptsDir, { recursive: true });
        fs.mkdirSync(evidenceDir, { recursive: true });

        const conceptMdx = [
          '---',
          'id: css-container-queries',
          'title: CSS Container Queries',
          'domain: css-layout',
          'web_feature_id: container-queries',
          'summary_tldr: "Style elements based on query container dimensions."',
          'relations: []',
          'sources:',
          '  - "https://drafts.csswg.org/css-conditional-5/"',
          'last_verified_at: "2026-11-01"',
          '---',
          '',
          'Body',
        ].join('\n');
        const conceptPath = path.join(conceptsDir, 'css-container-queries.mdx');
        fs.writeFileSync(conceptPath, conceptMdx, 'utf-8');

        const evidenceJson = JSON.stringify({ unchanged: true }, null, 2);
        const evidencePath = path.join(evidenceDir, 'css-container-queries.evidence-dossier.json');
        fs.writeFileSync(evidencePath, evidenceJson, 'utf-8');

        const prev = makeSnapshot();
        const next = makeSnapshot({
          features: {
            'container-queries': {
              ...prev.features['container-queries'],
              baseline: 'high',
              highDate: '2025-08-14',
            },
          },
        });

        const report = syncBaselineRadar({
          rootDir: tmpRoot,
          dryRun: false,
          previousSnapshot: prev,
          nextSnapshot: next,
        });

        expect(report.changes).toHaveLength(1);
        expect(fs.readFileSync(conceptPath, 'utf-8')).toBe(conceptMdx);
        expect(fs.readFileSync(evidencePath, 'utf-8')).toBe(evidenceJson);
      } finally {
        fs.rmSync(tmpRoot, { recursive: true, force: true });
      }
    });
  });

  describe('detectObsolescenceCandidates', () => {
    it('flags target concepts on replaces edges when source reaches Baseline', () => {
      const concepts: ConceptFrontmatter[] = [
        makeConcept({
          id: 'css-anchor-positioning',
          title: 'CSS Anchor Positioning',
          maturity_status: 'interop-experimental',
          relations: [
            {
              target_id: 'js-floating-positioning-engines',
              type: 'replaces',
              note: 'Native anchor positioning eliminates JS floating positioning loops.',
            },
          ],
        }),
        makeConcept({
          id: 'js-floating-positioning-engines',
          title: 'JS Floating Positioning Engines',
          pattern_status: 'legacy-pattern',
          superseded_by: ['css-anchor-positioning'],
          maturity_status: 'legacy-pattern',
          web_feature_id: undefined,
        }),
      ];

      const changes: BaselineChange[] = [
        {
          conceptId: 'css-anchor-positioning',
          title: 'CSS Anchor Positioning',
          webFeatureId: 'anchor-positioning',
          previousMaturity: 'interop-experimental',
          nextMaturity: 'baseline-newly',
          maturityChanged: true,
          supportChanged: true,
          nextSupport: {
            baseline_status: 'baseline-newly',
            chrome: '125+',
            firefox: '145+',
            safari: '26+',
          },
        },
      ];

      const candidates = detectObsolescenceCandidates(concepts, changes);
      expect(candidates).toHaveLength(1);
      expect(candidates[0].targetConceptId).toBe('js-floating-positioning-engines');
    });

    it('skips targets whose pattern_status is superseded', () => {
      const concepts: ConceptFrontmatter[] = [
        makeConcept({
          id: 'popover-api-light-dismiss',
          title: 'Popover API',
          maturity_status: 'baseline-newly',
          relations: [
            {
              target_id: 'react-portal-zindex-legacy',
              type: 'replaces',
              note: 'Native top-layer popover replaces portal z-index ladders.',
            },
          ],
        }),
        makeConcept({
          id: 'react-portal-zindex-legacy',
          title: 'React Portal z-index Ladders',
          pattern_status: 'superseded',
          superseded_by: ['popover-api-light-dismiss'],
          maturity_status: 'superseded',
          web_feature_id: undefined,
        }),
      ];

      const changes: BaselineChange[] = [
        {
          conceptId: 'popover-api-light-dismiss',
          title: 'Popover API',
          webFeatureId: 'popover',
          previousMaturity: 'baseline-newly',
          nextMaturity: 'baseline-widely',
          maturityChanged: true,
          supportChanged: true,
          nextSupport: {
            baseline_status: 'baseline-widely',
            chrome: '116+',
            firefox: '125+',
            safari: '17+',
          },
        },
      ];

      expect(detectObsolescenceCandidates(concepts, changes)).toHaveLength(0);
    });
  });

  describe('buildDigestDraft', () => {
    it('returns null when no significant Baseline change or new publication occurred', () => {
      const draft = buildDigestDraft({
        now: new Date('2026-11-24T07:00:00Z'),
        changes: [],
        obsolescenceCandidates: [],
        newPublications: [],
        allConcepts: [makeConcept({ id: 'popover-api-light-dismiss' })],
      });
      expect(draft).toBeNull();
    });

    it('generates a WeeklyDigest conforming to WeeklyDigestSchema', () => {
      const concepts: ConceptFrontmatter[] = [
        makeConcept({ id: 'css-anchor-positioning', title: 'CSS Anchor Positioning' }),
        makeConcept({ id: 'js-floating-positioning-engines', title: 'JS Floating Engines' }),
        makeConcept({ id: 'popover-api-light-dismiss', title: 'Popover API' }),
        makeConcept({ id: 'css-container-queries', title: 'CSS Container Queries' }),
        makeConcept({ id: 'view-transitions-api', title: 'View Transitions API' }),
        makeConcept({ id: 'scroll-driven-animations', title: 'Scroll-Driven Animations' }),
      ];

      const changes: BaselineChange[] = [
        {
          conceptId: 'css-anchor-positioning',
          title: 'CSS Anchor Positioning',
          webFeatureId: 'anchor-positioning',
          previousMaturity: 'interop-experimental',
          nextMaturity: 'baseline-newly',
          maturityChanged: true,
          supportChanged: true,
          nextSupport: {
            baseline_status: 'baseline-newly',
            chrome: '125+',
            firefox: '145+',
            safari: '26+',
          },
          specUrl: 'https://drafts.csswg.org/css-anchor-position-1/',
        },
      ];

      const newPublications: PublicationSignal[] = [
        {
          kind: 'autopsy',
          id: 'autopsy-anchor-overflow',
          title: 'The Floating Menu That Escaped Overflow',
          date: '2026-11-20',
          summary: 'How native CSS Anchor Positioning eliminated 400 lines of scroll listeners.',
          sourceUrl: 'https://frontend.rocks/autopsies/autopsy-anchor-overflow',
          relatedConcepts: ['css-anchor-positioning'],
        },
      ];

      const draft = buildDigestDraft({
        now: new Date('2026-11-24T07:00:00Z'),
        changes,
        obsolescenceCandidates: [
          {
            sourceConceptId: 'css-anchor-positioning',
            sourceTitle: 'CSS Anchor Positioning',
            sourceNextMaturity: 'baseline-newly',
            targetConceptId: 'js-floating-positioning-engines',
            targetTitle: 'JS Floating Engines',
            targetCurrentMaturity: 'legacy-pattern',
            relationNote: 'Native anchor positioning replaces JS floating positioning.',
          },
        ],
        newPublications,
        allConcepts: concepts,
      });

      expect(draft).not.toBeNull();
      const validated = WeeklyDigestSchema.parse(draft);
      expect(validated.id).toBe(computeIsoWeekId(new Date('2026-11-24T07:00:00Z')));
      expect(validated.entries.length).toBeGreaterThanOrEqual(5);
    });
  });

  describe('publish-radar-pr.sh allowlist guard (DRY_RUN=1)', () => {
    const scriptPath = path.join(process.cwd(), '.github', 'scripts', 'publish-radar-pr.sh');

    it('refuses a patch that touches src/', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'radar-patch-bad-'));
      try {
        fs.writeFileSync(
          path.join(tmpDir, 'radar.patch'),
          [
            'diff --git a/src/lib/paths.ts b/src/lib/paths.ts',
            '--- a/src/lib/paths.ts',
            '+++ b/src/lib/paths.ts',
            '@@ -1 +1 @@',
            '-a',
            '+b',
            '',
          ].join('\n')
        );
        fs.writeFileSync(path.join(tmpDir, 'report.md'), '# Report\n');

        let failed = false;
        let stderr = '';
        try {
          execFileSync('bash', [scriptPath, tmpDir], {
            cwd: process.cwd(),
            env: { ...process.env, DRY_RUN: '1' },
            encoding: 'utf-8',
            stdio: ['ignore', 'pipe', 'pipe'],
          });
        } catch (err) {
          failed = true;
          stderr = String((err as { stderr?: unknown }).stderr ?? '');
        }
        expect(failed).toBe(true);
        expect(stderr).toContain('disallowed path');
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it('accepts a valid patch touching only allowed paths in DRY_RUN=1', () => {
      const tmpRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'radar-patch-ok-repo-'));
      const incomingDir = fs.mkdtempSync(path.join(os.tmpdir(), 'radar-patch-ok-in-'));
      try {
        execFileSync('git', ['init'], { cwd: tmpRepo, stdio: 'ignore' });
        execFileSync('git', ['config', 'user.name', 'Test'], { cwd: tmpRepo, stdio: 'ignore' });
        execFileSync('git', ['config', 'user.email', 'test@example.com'], {
          cwd: tmpRepo,
          stdio: 'ignore',
        });

        fs.mkdirSync(path.join(tmpRepo, 'content', '.proof-cache'), { recursive: true });
        const snapFile = path.join(tmpRepo, 'content', '.proof-cache', 'support-snapshot.json');
        fs.writeFileSync(snapFile, '{"v":1}\n');
        execFileSync('git', ['add', '.'], { cwd: tmpRepo, stdio: 'ignore' });
        execFileSync('git', ['commit', '-m', 'init'], { cwd: tmpRepo, stdio: 'ignore' });

        fs.writeFileSync(snapFile, '{"v":2}\n');
        const patch = execFileSync('git', ['diff', '--binary'], {
          cwd: tmpRepo,
          encoding: 'utf-8',
        });
        execFileSync('git', ['checkout', '--', '.'], { cwd: tmpRepo, stdio: 'ignore' });

        fs.writeFileSync(path.join(incomingDir, 'radar.patch'), patch);
        fs.writeFileSync(path.join(incomingDir, 'report.md'), '# Report\n');

        const out = execFileSync('bash', [scriptPath, incomingDir], {
          cwd: tmpRepo,
          env: { ...process.env, DRY_RUN: '1' },
          encoding: 'utf-8',
        });
        expect(out).toContain('DRY_RUN=1: validated 1 file(s)');
      } finally {
        fs.rmSync(tmpRepo, { recursive: true, force: true });
        fs.rmSync(incomingDir, { recursive: true, force: true });
      }
    });
  });
});
