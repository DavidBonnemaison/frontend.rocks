import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  coveragePagePath,
  pruneCoverageLabels,
  readCoverageLabels,
  readCoverageMeta,
  writeCoverageLabels,
  writeCoverageMeta,
  type CoverageLabel,
} from '@/lib/proof/coverage/cache';
import { classifierKey, overreachKey } from '@/lib/proof/coverage/keys';

describe('coverage keys and cache', () => {
  const tempDirs: string[] = [];

  function makeContentDir(): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'coverage-cache-'));
    tempDirs.push(dir);
    vi.stubEnv('FRONTEND_ROCKS_CONTENT_DIR', dir);
    return dir;
  }

  afterEach(() => {
    vi.unstubAllEnvs();
    while (tempDirs.length > 0) {
      fs.rmSync(tempDirs.pop()!, { recursive: true, force: true });
    }
  });

  it('produces stable 40-char hex keys and invalidates on epoch change', () => {
    const k1 = classifierKey('0123456789abcdef', 'Microtasks run before timers.');
    const k2 = classifierKey('0123456789abcdef', 'Microtasks run before timers.');
    const k3 = classifierKey('fedcba9876543210', 'Microtasks run before timers.');

    expect(k1).toMatch(/^[0-9a-f]{40}$/);
    expect(k1).toBe(k2);
    expect(k1).not.toBe(k3);
  });

  it('invalidates overreachKey when non-bcd statement changes, but ignores statement for bcd claims', () => {
    const epoch = 'abcdef0123456789';
    const text = 'An @container rule applies when the slot is wide enough.';

    const expKey1 = overreachKey(epoch, text, [
      {
        id: 'p/a',
        statement: 'Statement v1 for experiment claim.',
        engines: ['chromium', 'firefox', 'webkit'],
        proofKind: 'experiment',
      },
    ]);
    const expKey2 = overreachKey(epoch, text, [
      {
        id: 'p/a',
        statement: 'Statement v2 for experiment claim.',
        engines: ['chromium', 'firefox', 'webkit'],
        proofKind: 'experiment',
      },
    ]);
    expect(expKey1).not.toBe(expKey2);

    // Order of claims does not affect key
    const multi1 = overreachKey(epoch, text, [
      { id: 'p/b', statement: 'Second claim statement here.', engines: null, proofKind: 'spec-quote' },
      { id: 'p/a', statement: 'First claim statement here.', engines: null, proofKind: 'spec-quote' },
    ]);
    const multi2 = overreachKey(epoch, text, [
      { id: 'p/a', statement: 'First claim statement here.', engines: null, proofKind: 'spec-quote' },
      { id: 'p/b', statement: 'Second claim statement here.', engines: null, proofKind: 'spec-quote' },
    ]);
    expect(multi1).toBe(multi2);

    // BCD claim: statement change does NOT change key; bcdKey change DOES
    const bcd1 = overreachKey(epoch, text, [
      {
        id: 'p/support',
        statement: 'Supported in Chrome 105, Firefox 110, Safari 16.',
        engines: null,
        proofKind: 'bcd',
        bcdKey: 'css.at-rules.container',
      },
    ]);
    const bcd2 = overreachKey(epoch, text, [
      {
        id: 'p/support',
        statement: 'Supported in Chrome 105, Firefox 110, Safari 16 (Baseline 2023).',
        engines: null,
        proofKind: 'bcd',
        bcdKey: 'css.at-rules.container',
      },
    ]);
    const bcd3 = overreachKey(epoch, text, [
      {
        id: 'p/support',
        statement: 'Supported in Chrome 105, Firefox 110, Safari 16 (Baseline 2023).',
        engines: null,
        proofKind: 'bcd',
        bcdKey: 'css.properties.container-type',
      },
    ]);
    expect(bcd1).toBe(bcd2);
    expect(bcd1).not.toBe(bcd3);
  });

  it('rejects page cache files with extra fields like reason', () => {
    makeContentDir();
    const filePath = coveragePagePath('bad-page');
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(
      filePath,
      JSON.stringify({
        schemaVersion: 1,
        labels: { ['a'.repeat(40)]: 'factual' },
        reason: 'should never be public',
      }),
      'utf-8'
    );

    expect(() => readCoverageLabels('bad-page')).toThrow();
  });

  it('writes byte-identical sorted label files, supports meta roundtrip, and prunes stale keys', () => {
    makeContentDir();

    expect(readCoverageMeta()).toBeNull();
    writeCoverageMeta({
      schemaVersion: 1,
      epochs: { classifier: '3f9a1c0d7e2b4a61', overreach: 'b0e4d2c9a8f71356' },
    });
    expect(readCoverageMeta()).toEqual({
      schemaVersion: 1,
      epochs: { classifier: '3f9a1c0d7e2b4a61', overreach: 'b0e4d2c9a8f71356' },
    });

    const kA = '1'.repeat(40);
    const kB = '2'.repeat(40);
    const kC = '3'.repeat(40);

    const map1 = new Map<string, CoverageLabel>([
      [kC, 'ok'],
      [kA, 'factual'],
      [kB, 'non-factual'],
    ]);
    const map2 = new Map<string, CoverageLabel>([
      [kA, 'factual'],
      [kB, 'non-factual'],
      [kC, 'ok'],
    ]);

    writeCoverageLabels('demo', map1);
    const bytes1 = fs.readFileSync(coveragePagePath('demo'));
    writeCoverageLabels('demo', map2);
    const bytes2 = fs.readFileSync(coveragePagePath('demo'));
    expect(bytes1.equals(bytes2)).toBe(true);
    expect(bytes1.toString('utf-8').endsWith('\n')).toBe(true);

    const removed = pruneCoverageLabels('demo', new Set([kA, kC]));
    expect(removed).toBe(1);
    const remaining = readCoverageLabels('demo');
    expect([...remaining.keys()]).toEqual([kA, kC]);
  });
});
