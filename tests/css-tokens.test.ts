import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { SITE_ROOT } from '@/lib/paths';

const FORBIDDEN_PATTERNS: Array<{ label: string; regex: RegExp }> = [
  { label: 'hex color literal', regex: /#[0-9a-fA-F]{3,8}\b/ },
  { label: 'rgb/rgba color literal', regex: /\brgba?\s*\(/i },
  { label: 'hsl/hsla color literal', regex: /\bhsla?\s*\(/i },
  { label: 'raw oklch() color literal', regex: /\boklch\s*\(/i },
  { label: 'hardcoded ms duration', regex: /(?<![0-9a-zA-Z_-])(?!0ms\b)\d+(?:\.\d+)?ms\b/i },
  { label: 'text color using ink-faint', regex: /\bcolor\s*:\s*var\(--color-ink-faint\)/i },
  {
    label: 'abandoned artistic term',
    regex: /var\(--d\)|--d-tint|--domain-|strata|specimen|\bgrain\b/i,
  },
];

function listCssFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
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

export function validateUiCssTokens(css: string, fileLabel: string): string[] {
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const violations: string[] = [];
  for (const { label, regex } of FORBIDDEN_PATTERNS) {
    if (regex.test(stripped)) {
      violations.push(`${fileLabel}: forbidden ${label}`);
    }
  }
  return violations;
}

describe('UI CSS token discipline guardrail', () => {
  it('forbids raw colors, hardcoded ms durations, ink-faint text, and abandoned terms in src/components/ui/**/*.css', () => {
    const uiDir = path.join(SITE_ROOT, 'src', 'components', 'ui');
    const files = listCssFiles(uiDir);
    expect(files.length).toBeGreaterThan(0);

    const allViolations: string[] = [];
    for (const file of files) {
      const rel = path.relative(SITE_ROOT, file);
      const css = fs.readFileSync(file, 'utf-8');
      allViolations.push(...validateUiCssTokens(css, rel));
    }
    expect(allViolations).toEqual([]);
  });

  it('rejects faulty UI CSS strings (negative cases)', () => {
    expect(validateUiCssTokens('.a { color: #ff0000; }', 'bad.css').length).toBeGreaterThan(0);
    expect(validateUiCssTokens('.a { transition: opacity 150ms; }', 'bad.css').length).toBeGreaterThan(0);
    expect(validateUiCssTokens('.a { color: var(--color-ink-faint); }', 'bad.css').length).toBeGreaterThan(0);
    expect(validateUiCssTokens('.a { color: var(--d); }', 'bad.css').length).toBeGreaterThan(0);
    expect(validateUiCssTokens('.a { transition: opacity 0ms; }', 'ok.css')).toEqual([]);
  });
});
