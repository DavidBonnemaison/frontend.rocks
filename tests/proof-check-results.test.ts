import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { claimStatusOrNull, readCheckResults } from '../src/lib/proof/check-results';
import { emptyProofResults, type ProofResults } from '../src/lib/proof/results-schema';

const tmpDirs: string[] = [];

function makeTmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fr-check-results-'));
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tmpDirs.length > 0) {
    fs.rmSync(tmpDirs.pop()!, { recursive: true, force: true });
  }
});

describe('readCheckResults', () => {
  it('returns valid empty results when neither preview nor latest exists', () => {
    const dir = makeTmpDir();
    const res = readCheckResults({
      previewPath: path.join(dir, 'preview.json'),
      latestPath: path.join(dir, 'latest.json'),
    });
    expect(res).toEqual(emptyProofResults());
    expect(claimStatusOrNull(res, 'p/c1')).toBeNull();
  });

  it('merges preview over latest entry-by-entry and preserves latest-only claims', () => {
    const dir = makeTmpDir();
    const latestPath = path.join(dir, 'latest.json');
    const previewPath = path.join(dir, 'preview.json');

    const baseClaim = {
      proofKind: 'experiment' as const,
      engines: { chromium: 'pass' as const },
      checkedAt: '2026-12-01T00:00:00.000Z',
      provenSince: '2026-12-01T00:00:00.000Z',
      failingSince: null,
      reason: null,
      detail: null,
    };

    const latest: ProofResults = {
      ...emptyProofResults(),
      claims: {
        'p/shared': { ...baseClaim, status: 'failed', provenSince: null },
        'p/latest-only': { ...baseClaim, status: 'proven' },
      },
    };
    const preview: ProofResults = {
      ...emptyProofResults(),
      claims: {
        'p/shared': { ...baseClaim, status: 'proven' },
      },
    };

    fs.writeFileSync(latestPath, JSON.stringify(latest));
    fs.writeFileSync(previewPath, JSON.stringify(preview));

    const merged = readCheckResults({ previewPath, latestPath });
    expect(claimStatusOrNull(merged, 'p/shared')).toBe('proven');
    expect(claimStatusOrNull(merged, 'p/latest-only')).toBe('proven');
    expect(claimStatusOrNull(merged, 'p/absent')).toBeNull();
  });
});
