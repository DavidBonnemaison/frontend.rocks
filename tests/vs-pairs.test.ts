import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  VsPairsFileSchema,
  isCanonicalVsPairsFile,
  serializeVsPairsFile,
} from '@/lib/vs/schema';
import { validateVsPairReferences } from '@/lib/validators/debug-content-validator';

const pair = {
  slug: 'alpha-vs-beta',
  primary: 'alpha',
  secondary: 'beta',
  question: 'Which approach keeps the layout stable?',
  experimentId: 'alpha-vs-beta-sandbox',
  claim_ids: ['vs-alpha-vs-beta/differs', 'vs-alpha-vs-beta/agrees'],
  proof_status: 'unverified',
};

describe('VsPairSchema', () => {
  it('accepts a valid pair and rejects fewer than 2 claims', () => {
    expect(VsPairsFileSchema.safeParse({ pairs: [pair] }).success).toBe(true);
    expect(
      VsPairsFileSchema.safeParse({ pairs: [{ ...pair, claim_ids: ['vs-alpha-vs-beta/x'] }] }).success
    ).toBe(false);
  });

  it('requires the <a>-vs-<b> slug form', () => {
    expect(VsPairsFileSchema.safeParse({ pairs: [{ ...pair, slug: 'alpha' }] }).success).toBe(false);
  });
});

describe('pairs.json format', () => {
  it('serialises sorted by slug in the canonical format', () => {
    const out = serializeVsPairsFile({
      pairs: [
        { ...pair, slug: 'zeta-vs-beta' },
        { ...pair, slug: 'alpha-vs-beta' },
      ] as never,
    });
    expect(out.endsWith('\n')).toBe(true);
    expect(out.indexOf('alpha-vs-beta')).toBeLessThan(out.indexOf('zeta-vs-beta'));
    expect(isCanonicalVsPairsFile(out)).toBe(true);
    expect(isCanonicalVsPairsFile(out.trimEnd())).toBe(false);
    expect(isCanonicalVsPairsFile(JSON.stringify(JSON.parse(out)))).toBe(false);
  });
});

describe('vs pair references', () => {
  const ctx = {
    claimIds: new Set(pair.claim_ids),
    experimentIds: new Set([pair.experimentId]),
  };

  it('passes for existing claims and experiment', () => {
    expect(validateVsPairReferences(pair as never, ctx)).toEqual([]);
  });

  it('flags missing claims, missing experiment and foreign claim ids', () => {
    const errors = validateVsPairReferences(
      { ...pair, claim_ids: ['other/x', 'vs-alpha-vs-beta/gone'] } as never,
      ctx
    );
    expect(errors.some((e) => e.includes('unknown claim "other/x"'))).toBe(true);
    expect(errors.some((e) => e.includes('must belong to page "vs-alpha-vs-beta"'))).toBe(true);
    expect(validateVsPairReferences(pair as never, { ...ctx, experimentIds: new Set() })[0]).toContain(
      'experimentId'
    );
  });
});

describe('vs-pairs loader', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-'));
    vi.stubEnv('FRONTEND_ROCKS_CONTENT_DIR', dir);
    vi.resetModules();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('returns no entries while pairs.json does not exist', async () => {
    const m = await import('@/lib/vs-pairs');
    expect(m.loadVsPairEntries()).toEqual([]);
  });

  it('reads and sorts entries from pairs.json', async () => {
    fs.mkdirSync(path.join(dir, 'vs'));
    fs.writeFileSync(
      path.join(dir, 'vs', 'pairs.json'),
      JSON.stringify({ pairs: [{ ...pair, slug: 'zeta-vs-beta' }, pair] }, null, 2) + '\n'
    );
    const m = await import('@/lib/vs-pairs');
    expect(m.loadVsPairEntries().map((p) => p.slug)).toEqual(['alpha-vs-beta', 'zeta-vs-beta']);
  });

  it('rejects an invalid file with its path', async () => {
    fs.mkdirSync(path.join(dir, 'vs'));
    fs.writeFileSync(path.join(dir, 'vs', 'pairs.json'), JSON.stringify({ pairs: [{ slug: 'x' }] }));
    const m = await import('@/lib/vs-pairs');
    expect(() => m.loadVsPairEntries()).toThrow(/content\/vs\/pairs\.json/);
  });
});
