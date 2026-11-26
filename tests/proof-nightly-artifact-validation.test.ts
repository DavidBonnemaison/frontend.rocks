import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const SITE_ROOT = process.cwd();
const VALIDATE_SCRIPT = path.join(SITE_ROOT, '.github', 'scripts', 'validate-proof-artifact.sh');

function createValidArtifactDir(parent: string, name: string): string {
  const dir = path.join(parent, name);
  fs.mkdirSync(path.join(dir, 'cache'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'extra'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'cache', '.keep'), '');
  fs.writeFileSync(path.join(dir, 'extra', '.keep'), '');
  fs.writeFileSync(
    path.join(dir, 'latest.json'),
    JSON.stringify({
      schemaVersion: 1,
      generatedAt: '2026-12-01T02:17:00.000Z',
      runner: { playwright: '1.65.1', node: '24.0.0', os: 'linux', react: null },
      engines: { chromium: '143.0.0.0', firefox: '145.0', webkit: '26.0' },
      experiments: {},
      experimentMeta: {},
      claims: {},
      pages: {},
      demotedPages: {},
    })
  );
  fs.writeFileSync(path.join(dir, 'demotions.json'), '[]\n');
  fs.writeFileSync(path.join(dir, 'promotions.json'), '[]\n');
  fs.writeFileSync(
    path.join(dir, 'diff.json'),
    JSON.stringify({
      at: '2026-12-01T02:17:00.000Z',
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
    JSON.stringify({ kind: 'run', at: '2026-12-01T02:17:00.000Z', durationMs: 1000, infraErrors: 0 }) +
      '\n'
  );
  fs.writeFileSync(path.join(dir, 'pr-body.md'), '## Nightly\n');
  fs.writeFileSync(path.join(dir, 'summary.md'), '## Summary\n');
  return dir;
}

function runValidate(dir: string, registry?: string) {
  return spawnSync('bash', [VALIDATE_SCRIPT, dir], {
    cwd: SITE_ROOT,
    encoding: 'utf-8',
    env: {
      ...process.env,
      ...(registry ? { NIGHTLY_EXTRA_REGISTRY: registry } : {}),
    },
  });
}

describe('validate-proof-artifact.sh (12 fixtures)', () => {
  const dirs: string[] = [];

  function mkTemp(): string {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'fr-artifact-val-'));
    dirs.push(d);
    return d;
  }

  afterEach(() => {
    for (const d of dirs.splice(0)) {
      fs.rmSync(d, { recursive: true, force: true });
    }
  });

  it('1. accepts a valid artifact without drift (only .keep files)', () => {
    const dir = createValidArtifactDir(mkTemp(), 'valid-minimal');
    const res = runValidate(dir);
    expect(res.status).toBe(0);
    expect(res.stdout).toContain('Artifact OK');
  });

  it('2. accepts a valid artifact with a concept demotion and a /vs pair promotion', () => {
    const dir = createValidArtifactDir(mkTemp(), 'valid-demote-promote');
    fs.writeFileSync(
      path.join(dir, 'demotions.json'),
      JSON.stringify([
        {
          pageId: 'css-container-queries',
          kind: 'concept',
          file: 'content/concepts/css-container-queries.mdx',
          claimIds: ['css-container-queries/applies-at-container-width'],
        },
      ])
    );
    fs.writeFileSync(
      path.join(dir, 'promotions.json'),
      JSON.stringify([
        {
          pageId: 'vs-debounce-vs-throttle',
          kind: 'vs',
          file: 'content/vs/pairs.json',
          claimIds: ['vs-debounce-vs-throttle/throttle-runs-during-burst'],
        },
      ])
    );
    const res = runValidate(dir);
    expect(res.status).toBe(0);
  });

  it('3. rejects an artifact missing promotions.json', () => {
    const dir = createValidArtifactDir(mkTemp(), 'missing-promotions');
    fs.rmSync(path.join(dir, 'promotions.json'));
    const res = runValidate(dir);
    expect(res.status).not.toBe(0);
  });

  it('4. rejects an artifact with the same page in both demotions.json and promotions.json', () => {
    const dir = createValidArtifactDir(mkTemp(), 'overlap-demote-promote');
    const entry = [
      {
        pageId: 'css-container-queries',
        kind: 'concept',
        file: 'content/concepts/css-container-queries.mdx',
        claimIds: ['css-container-queries/c1'],
      },
    ];
    fs.writeFileSync(path.join(dir, 'demotions.json'), JSON.stringify(entry));
    fs.writeFileSync(path.join(dir, 'promotions.json'), JSON.stringify(entry));
    const res = runValidate(dir);
    expect(res.status).not.toBe(0);
  });

  it('5. accepts a valid artifact with cache/specs, cache/sources, and registered extra/ files', () => {
    const root = mkTemp();
    const dir = createValidArtifactDir(root, 'valid-cache-extra');
    fs.mkdirSync(path.join(dir, 'cache', 'specs'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'cache', 'sources'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'cache', 'specs', 'abc.json'), '{"ok":true}\n');
    fs.writeFileSync(path.join(dir, 'cache', 'sources', 'def.json'), '{"ok":true}\n');

    fs.mkdirSync(path.join(dir, 'extra', 'changelog'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'extra', 'beliefs.json'), '{"items":[]}\n');
    fs.writeFileSync(path.join(dir, 'extra', 'changelog', 'candidates.json'), '[]\n');

    const registry = path.join(root, 'registry.json');
    fs.writeFileSync(
      registry,
      JSON.stringify({
        entries: [
          { path: 'beliefs.json', dest: 'content/.proof-results/beliefs.json' },
          { prefix: 'changelog/', dest: 'content/.proof-results/changelog/' },
        ],
      })
    );

    const res = runValidate(dir, registry);
    expect(res.status).toBe(0);
  });

  it('6. rejects an extra unexpected file at top level', () => {
    const dir = createValidArtifactDir(mkTemp(), 'extra-top-file');
    fs.writeFileSync(path.join(dir, 'unexpected.txt'), 'nope');
    const res = runValidate(dir);
    expect(res.status).not.toBe(0);
  });

  it('7. rejects an artifact missing cache/.keep', () => {
    const dir = createValidArtifactDir(mkTemp(), 'missing-keep');
    fs.rmSync(path.join(dir, 'cache', '.keep'));
    const res = runValidate(dir);
    expect(res.status).not.toBe(0);
  });

  it('8. rejects an artifact with invalid JSON', () => {
    const dir = createValidArtifactDir(mkTemp(), 'invalid-json');
    fs.writeFileSync(path.join(dir, 'diff.json'), '{not valid json');
    const res = runValidate(dir);
    expect(res.status).not.toBe(0);
  });

  it('9. rejects an artifact with an invalid history line', () => {
    const dir = createValidArtifactDir(mkTemp(), 'invalid-history');
    fs.writeFileSync(path.join(dir, 'history-line.jsonl'), '{"kind":"bogus"}\n');
    const res = runValidate(dir);
    expect(res.status).not.toBe(0);
  });

  it('10. rejects a cache file outside specs/ and sources/', () => {
    const dir = createValidArtifactDir(mkTemp(), 'bad-cache-path');
    fs.mkdirSync(path.join(dir, 'cache', 'coverage'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'cache', 'coverage', 'x.json'), '{}');
    const res = runValidate(dir);
    expect(res.status).not.toBe(0);
  });

  it('11. rejects an unregistered file under extra/', () => {
    const dir = createValidArtifactDir(mkTemp(), 'unregistered-extra');
    fs.writeFileSync(path.join(dir, 'extra', 'rogue.json'), '{}');
    const res = runValidate(dir);
    expect(res.status).not.toBe(0);
  });

  it('12. rejects a registry whose dest escapes content/.proof-results/', () => {
    const root = mkTemp();
    const dir = createValidArtifactDir(root, 'bad-registry-dest');
    fs.writeFileSync(path.join(dir, 'extra', 'evil.json'), '{}');
    const registry = path.join(root, 'bad-registry.json');
    fs.writeFileSync(
      registry,
      JSON.stringify({
        entries: [{ path: 'evil.json', dest: 'src/lib/evil.json' }],
      })
    );
    const res = runValidate(dir, registry);
    expect(res.status).not.toBe(0);
  });
});
