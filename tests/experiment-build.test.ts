import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  buildExperimentFromSource,
  EXPERIMENTS_DIR,
  listExperimentFolders,
} from '../scripts/proof/build-experiments';
import { loadExperimentBundle, loadExperimentIndex } from '@/lib/proof/experiment-bundles';

const PILOTS = [
  'container-query-inline-size',
  'microtasks-before-timers',
  'stacking-context-traps-z-index',
] as const;

describe('experiment build and bundle loader', () => {
  const originalBuildDir = process.env.FR_PROOF_BUILD_DIR;
  let tempDir: string | null = null;

  afterEach(() => {
    if (originalBuildDir === undefined) delete process.env.FR_PROOF_BUILD_DIR;
    else process.env.FR_PROOF_BUILD_DIR = originalBuildDir;
    if (tempDir) {
      fs.rmSync(tempDir, { recursive: true, force: true });
      tempDir = null;
    }
  });

  it('builds all three pilot experiments cleanly with liveInBrowser: true', () => {
    expect(listExperimentFolders(EXPERIMENTS_DIR)).toEqual(expect.arrayContaining([...PILOTS]));

    for (const id of PILOTS) {
      const source = fs.readFileSync(path.join(EXPERIMENTS_DIR, id, 'experiment.ts'), 'utf-8');
      const outcome = buildExperimentFromSource(source, id);
      expect(outcome.errors).toEqual([]);
      expect(outcome.bundle).not.toBeNull();
      expect(outcome.bundle?.sourceHash).toMatch(/^[0-9a-f]{64}$/);
      expect(outcome.bundle?.observeSource).toMatch(/^(\(ctx\)\s*=>|ctx\s*=>|async)/);
      expect(outcome.bundle?.liveInBrowser).toBe(true);
      expect(outcome.bundle?.observeSource).not.toContain('__name');
    }
  });

  it('produces deterministic sourceHash values that change on any edit', () => {
    const source = fs.readFileSync(
      path.join(EXPERIMENTS_DIR, 'container-query-inline-size', 'experiment.ts'),
      'utf-8'
    );
    const first = buildExperimentFromSource(source, 'container-query-inline-size');
    const second = buildExperimentFromSource(source, 'container-query-inline-size');
    const modified = buildExperimentFromSource(`${source}\n`, 'container-query-inline-size');

    expect(first.bundle?.sourceHash).toBe(second.bundle?.sourceHash);
    expect(modified.bundle?.sourceHash).not.toBe(first.bundle?.sourceHash);
  });

  it('sets liveInBrowser to false for a measured experiment', () => {
    const measuredSource = `import { defineExperiment } from '@/lib/proof/define-experiment';

export default defineExperiment({
  id: 'measured-sample',
  title: 'Forced layout costs more than batched reads',
  question: 'Does interleaved read-write layout take more time than batched reads?',
  kind: 'measured',
  fixture: { html: '<div id="box"></div>' },
  variants: {
    treatment: { label: 'Forced layout', js: 'window.__x = 1;' },
    control: { label: 'Batched reads', js: 'window.__x = 2;' },
  },
  mutation: { variant: 'treatment', remove: 'window.__x = 1;' },
  observe: (ctx) => performance.now() + ctx.doc.body.childElementCount * 0,
  measured: { repeat: 20, metric: 'layout-ms', minRatio: 2 },
  expect: {
    'forced-slower': { treatment: null, control: null },
  },
});
`;
    const outcome = buildExperimentFromSource(measuredSource, 'measured-sample');
    expect(outcome.errors).toEqual([]);
    expect(outcome.bundle?.liveInBrowser).toBe(false);
  });

  it('reads bundles and index from FR_PROOF_BUILD_DIR when set', () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fr-exp-build-'));
    const source = fs.readFileSync(
      path.join(EXPERIMENTS_DIR, 'stacking-context-traps-z-index', 'experiment.ts'),
      'utf-8'
    );
    const outcome = buildExperimentFromSource(source, 'stacking-context-traps-z-index');
    expect(outcome.bundle).not.toBeNull();
    const bundle = outcome.bundle!;
    fs.writeFileSync(path.join(tempDir, `${bundle.id}.json`), JSON.stringify(bundle));
    fs.writeFileSync(
      path.join(tempDir, 'index.json'),
      JSON.stringify([
        {
          id: bundle.id,
          title: bundle.title,
          kind: bundle.kind,
          sourceHash: bundle.sourceHash,
          host: bundle.host,
          liveInBrowser: bundle.liveInBrowser,
        },
      ])
    );

    process.env.FR_PROOF_BUILD_DIR = tempDir;
    const index = loadExperimentIndex();
    expect(index).toHaveLength(1);
    expect(index[0].id).toBe('stacking-context-traps-z-index');
    expect(loadExperimentBundle('stacking-context-traps-z-index').id).toBe(
      'stacking-context-traps-z-index'
    );
  });

  it('returns null bundle and prefixed errors for invalid source', () => {
    const invalidSource = `import { defineExperiment } from '@/lib/proof/define-experiment';

export default defineExperiment({
  id: 'broken-exp',
  title: 'Broken experiment',
  question: 'Does this fail static checks?',
  kind: 'fixture',
  fixture: { html: '<p>x</p>' },
  variants: {
    treatment: { label: 'Treatment', css: '.a { color: red; }' },
    control: { label: 'Control' },
  },
  mutation: { variant: 'treatment', remove: 'color: red;' },
  observe: (ctx) => ({ title: document.title, n: ctx.doc.body.childElementCount }),
  expect: {
    'case-a': { treatment: { title: 'a', n: 1 }, control: { title: 'b', n: 1 } },
  },
});
`;
    const outcome = buildExperimentFromSource(invalidSource, 'broken-exp');
    expect(outcome.bundle).toBeNull();
    expect(outcome.errors.length).toBeGreaterThan(0);
    expect(outcome.errors.every((e) => e.startsWith('[experiments/broken-exp]'))).toBe(true);
    expect(outcome.errors.some((e) => e.includes('S05'))).toBe(true);
  });
});
