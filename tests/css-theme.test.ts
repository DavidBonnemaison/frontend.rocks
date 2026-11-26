import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { SITE_ROOT } from '@/lib/paths';

function listCssFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...listCssFiles(full));
    } else if (entry.name.endsWith('.css')) {
      results.push(full);
    }
  }
  return results.sort();
}

export function validateNoPrefersColorScheme(css: string, fileLabel: string): string[] {
  if (/prefers-color-scheme/i.test(css)) {
    return [`${fileLabel}: forbidden prefers-color-scheme media query`];
  }
  return [];
}

describe('CSS theme guardrail', () => {
  it('contains no prefers-color-scheme in any src/**/*.css file', () => {
    const files = listCssFiles(path.join(SITE_ROOT, 'src'));
    expect(files.length).toBeGreaterThan(0);

    const violations: string[] = [];
    for (const file of files) {
      const rel = path.relative(SITE_ROOT, file);
      violations.push(...validateNoPrefersColorScheme(fs.readFileSync(file, 'utf-8'), rel));
    }
    expect(violations).toEqual([]);
  });

  it('rejects prefers-color-scheme in CSS (negative case)', () => {
    const bad = '@media (prefers-color-scheme: dark) { :root { color: white; } }';
    expect(validateNoPrefersColorScheme(bad, 'bad.css').length).toBe(1);
  });
});
