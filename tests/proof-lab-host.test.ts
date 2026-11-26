import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ExperimentBundleSchema } from '@/lib/proof/experiment-schema';
import { acceptLabMessage } from '@/lib/proof/runtime/lab-host';
import { buildLabSite } from '../scripts/proof/build-lab-site';

function makeBundle(id = 'idb-versionchange') {
  return ExperimentBundleSchema.parse({
    schemaVersion: 1,
    runtimeVersion: '1',
    sourceHash: 'a'.repeat(64),
    id,
    title: 'IndexedDB lab host test',
    question: 'Does the lab host accept valid messages only?',
    kind: 'trace',
    host: 'origin',
    fixture: { html: '<p>idb</p>', js: 'window.__trace.push(1);' },
    variants: {
      treatment: { label: 'T', js: 'window.__trace.push(2);' },
      control: { label: 'C' },
    },
    mutation: { variant: 'treatment', remove: 'window.__trace.push(2);' },
    observeSource: '(ctx) => ({ t: ctx.trace.slice() })',
    expect: {
      'case-1': { treatment: { t: [1, 2] }, control: { t: [1] } },
    },
    liveInBrowser: true,
  });
}

function makeValidPayload(id = 'idb-versionchange') {
  return {
    channel: 'fr-proof',
    type: 'fr:lab-run',
    runId: 'run-123',
    bundle: makeBundle(id),
    variant: 'treatment',
    params: {},
    mutated: false,
    awaitInput: false,
  };
}

describe('acceptLabMessage', () => {
  const allowed = ['https://frontend.rocks', 'http://127.0.0.1:4175'];

  it('accepts a valid request from an allowed parent matching pathId', () => {
    const res = acceptLabMessage(
      { origin: 'https://frontend.rocks', data: makeValidPayload('idb-versionchange'), fromParent: true },
      allowed,
      'idb-versionchange'
    );
    expect(res).not.toBeNull();
    expect(res?.runId).toBe('run-123');
    expect(res?.bundle.id).toBe('idb-versionchange');
  });

  it('rejects an unlisted origin', () => {
    const res = acceptLabMessage(
      { origin: 'http://localhost:4175', data: makeValidPayload('idb-versionchange'), fromParent: true },
      allowed,
      'idb-versionchange'
    );
    expect(res).toBeNull();
  });

  it('rejects a message not coming from window.parent', () => {
    const res = acceptLabMessage(
      { origin: 'https://frontend.rocks', data: makeValidPayload('idb-versionchange'), fromParent: false },
      allowed,
      'idb-versionchange'
    );
    expect(res).toBeNull();
  });

  it('rejects when bundle.id does not match pathId', () => {
    const res = acceptLabMessage(
      { origin: 'https://frontend.rocks', data: makeValidPayload('other-exp'), fromParent: true },
      allowed,
      'idb-versionchange'
    );
    expect(res).toBeNull();
  });

  it('rejects unknown message types or wrong channel', () => {
    const badType = { ...makeValidPayload(), type: 'fr:observe' };
    expect(
      acceptLabMessage(
        { origin: 'https://frontend.rocks', data: badType, fromParent: true },
        allowed,
        'idb-versionchange'
      )
    ).toBeNull();

    const badChannel = { ...makeValidPayload(), channel: 'other' };
    expect(
      acceptLabMessage(
        { origin: 'https://frontend.rocks', data: badChannel, fromParent: true },
        allowed,
        'idb-versionchange'
      )
    ).toBeNull();
  });
});

describe('buildLabSite', () => {
  const tmpDirs: string[] = [];

  afterEach(() => {
    while (tmpDirs.length > 0) {
      const dir = tmpDirs.pop()!;
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('builds production lab site with only https://frontend.rocks allowed and no 127.0.0.1', async () => {
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fr-lab-prod-'));
    tmpDirs.push(outDir);

    await buildLabSite({ dev: false, outDir });

    const hostJs = fs.readFileSync(path.join(outDir, 'runtime', 'lab-host.js'), 'utf-8');
    expect(hostJs).toContain('https://frontend.rocks');
    expect(hostJs).not.toContain('127.0.0.1');

    const headers = fs.readFileSync(path.join(outDir, '_headers'), 'utf-8');
    expect(headers).toContain('Content-Security-Policy: frame-ancestors *');
    expect(headers).toContain('X-Robots-Tag: noindex, nofollow');

    const robots = fs.readFileSync(path.join(outDir, 'robots.txt'), 'utf-8');
    expect(robots).toContain('Disallow: /');

    const info = JSON.parse(fs.readFileSync(path.join(outDir, 'build-info.json'), 'utf-8')) as Record<string, unknown>;
    expect(typeof info.commit).toBe('string');
    expect(typeof info.runtimeVersion).toBe('string');
    expect(typeof info.generatedAt).toBe('string');
    expect(fs.existsSync(path.join(outDir, '__test'))).toBe(false);
  });

  it('builds dev lab site including fixture origin experiments, sw.js, bundles, and test parent', async () => {
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fr-lab-dev-'));
    tmpDirs.push(outDir);

    await buildLabSite({ dev: true, outDir });

    expect(fs.existsSync(path.join(outDir, 'x', 'idb-versionchange', 'host.html'))).toBe(true);
    expect(fs.existsSync(path.join(outDir, 'x', 'sw-waiting', 'host.html'))).toBe(true);
    expect(fs.existsSync(path.join(outDir, 'x', 'sw-waiting', 'sw.js'))).toBe(true);
    expect(fs.existsSync(path.join(outDir, '__bundles', 'idb-versionchange.json'))).toBe(true);
    expect(fs.existsSync(path.join(outDir, '__test', 'parent.html'))).toBe(true);
    expect(fs.existsSync(path.join(outDir, '__test', 'parent.js'))).toBe(true);
  });
});
