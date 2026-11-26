import fs from 'node:fs';
import path from 'node:path';
import postcss from 'postcss';
import { describe, expect, it } from 'vitest';
import { SITE_ROOT } from '@/lib/paths';

const EXPECTED_ORDER = 'reset, tokens, base, legacy, layout, components, utilities';

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

export function validateCssLayers(css: string, fileLabel: string, isLayersFile = false): string[] {
  const errors: string[] = [];
  const root = postcss.parse(css, { from: fileLabel });
  const nonComments = root.nodes.filter((n) => n.type !== 'comment');

  if (nonComments.length === 0) {
    return [`${fileLabel}: empty CSS file`];
  }

  const first = nonComments[0];
  if (
    first.type !== 'atrule' ||
    first.name !== 'layer' ||
    first.nodes !== undefined ||
    first.params.replace(/\s+/g, ' ').trim() !== EXPECTED_ORDER
  ) {
    errors.push(`${fileLabel}: must start with "@layer ${EXPECTED_ORDER};"`);
  }

  if (isLayersFile) {
    if (nonComments.length > 1) {
      errors.push(`${fileLabel}: layers.css must contain only the @layer order declaration`);
    }
    return errors;
  }

  for (let i = 1; i < nonComments.length; i++) {
    const node = nonComments[i];
    if (node.type === 'atrule') {
      if (node.name === 'layer' && node.nodes !== undefined) continue;
      if (node.name === 'import' || node.name === 'font-face') continue;
      if (node.name === 'layer' && node.params.replace(/\s+/g, ' ').trim() === EXPECTED_ORDER) {
        continue;
      }
      errors.push(`${fileLabel}: top-level @${node.name} outside @layer`);
    } else {
      errors.push(`${fileLabel}: top-level ${node.type} outside @layer`);
    }
  }

  return errors;
}

describe('CSS layers guardrail', () => {
  it('every CSS file under src/ starts with the layer order and wraps all rules in @layer', () => {
    const srcDir = path.join(SITE_ROOT, 'src');
    const files = listCssFiles(srcDir);
    expect(files.length).toBeGreaterThan(0);

    const allErrors: string[] = [];
    for (const file of files) {
      const rel = path.relative(SITE_ROOT, file);
      const css = fs.readFileSync(file, 'utf-8');
      allErrors.push(...validateCssLayers(css, rel, rel === 'src/styles/layers.css'));
    }
    expect(allErrors).toEqual([]);
  });

  it('rejects a rule declared outside @layer (negative case)', () => {
    const badCss = `@layer ${EXPECTED_ORDER};\n.unlayered { color: var(--color-ink); }\n`;
    const errs = validateCssLayers(badCss, 'inline-negative.css');
    expect(errs.length).toBeGreaterThan(0);
    expect(errs[0]).toContain('outside @layer');
  });
});
