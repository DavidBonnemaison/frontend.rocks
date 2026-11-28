import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SymptomFrontmatterSchema, SYMPTOM_SECTIONS } from '@/lib/symptoms/schema';

let dir: string;

function symptomFile(id: string, extra = ''): string {
  return `---
id: ${id}
title: A symptom title long enough
featured: false
summary: A summary that is comfortably above twenty characters.
concept_ids:
  - css-stacking-context
autopsy_ids: []
proof_status: unverified
${extra}---

## What you see
`;
}

async function loader() {
  vi.resetModules();
  return import('@/lib/symptoms/loader');
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'symptoms-'));
  fs.mkdirSync(path.join(dir, 'symptoms'));
  vi.stubEnv('FRONTEND_ROCKS_CONTENT_DIR', dir);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('symptoms loader', () => {
  it('returns an empty list when the folder is missing', async () => {
    fs.rmSync(path.join(dir, 'symptoms'), { recursive: true });
    const m = await loader();
    expect(m.getAllSymptoms()).toEqual([]);
  });

  it('loads symptoms sorted by file name and finds them by id', async () => {
    fs.writeFileSync(path.join(dir, 'symptoms', 'b-symptom.mdx'), symptomFile('b-symptom', 'featured: true\n').replace('featured: false\n', ''));
    fs.writeFileSync(path.join(dir, 'symptoms', 'a-symptom.mdx'), symptomFile('a-symptom'));
    const m = await loader();
    expect(m.getAllSymptoms().map((s) => s.frontmatter.id)).toEqual(['a-symptom', 'b-symptom']);
    expect(m.getSymptomById('a-symptom')?.frontmatter.title).toContain('symptom');
    expect(m.getSymptomById('missing')).toBeNull();
    expect(m.getFeaturedSymptoms().map((s) => s.frontmatter.id)).toEqual(['b-symptom']);
  });

  it('throws with the file name on an invalid frontmatter', async () => {
    fs.writeFileSync(path.join(dir, 'symptoms', 'bad.mdx'), '---\nid: bad\n---\nbody');
    const m = await loader();
    expect(() => m.getAllSymptoms()).toThrow(/content\/symptoms\/bad\.mdx/);
  });
});

describe('SymptomFrontmatterSchema', () => {
  const base = {
    id: 'a-symptom',
    title: 'A symptom title long enough',
    summary: 'A summary that is comfortably above twenty characters.',
    concept_ids: ['css-stacking-context'],
    proof_status: 'unverified',
  };

  it('lets an unverified symptom omit claims and signatures', () => {
    expect(SymptomFrontmatterSchema.safeParse(base).success).toBe(true);
  });

  it('requires summary claims and a signature when proven', () => {
    const res = SymptomFrontmatterSchema.safeParse({ ...base, proof_status: 'proven' });
    expect(res.success).toBe(false);
    if (!res.success) {
      const paths = res.error.issues.map((i) => i.path.join('.'));
      expect(paths).toContain('summary_claims');
      expect(paths).toContain('signatures');
    }
  });

  it('accepts a proven symptom with a signature', () => {
    const res = SymptomFrontmatterSchema.safeParse({
      ...base,
      proof_status: 'proven',
      summary_claims: ['a-symptom/summary'],
      signatures: [{ kind: 'console', text: 'Uncaught TypeError: x', claim: 'sig', engines: ['chromium'] }],
    });
    expect(res.success).toBe(true);
  });

  it('declares the five fixed sections', () => {
    expect(SYMPTOM_SECTIONS).toEqual(['What you see', 'Likely causes', 'Confirm it', 'Fix', 'Reproduce it']);
  });
});
