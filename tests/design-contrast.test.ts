import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { SITE_ROOT } from '@/lib/paths';
import { contrastRatio, evaluateContrast } from '../scripts/design/check-contrast';
import { parseTokensFile } from '../scripts/design/tokens-schema';

describe('WCAG contrast calculation', () => {
  it('computes 21:1 for black on white', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 2);
  });

  it('computes ~4.54:1 for #767676 on white', () => {
    expect(contrastRatio('#767676', '#ffffff')).toBeCloseTo(4.54, 2);
  });

  it('passes all configured pairs in design/tokens.json', () => {
    const tokens = parseTokensFile(
      JSON.parse(fs.readFileSync(path.join(SITE_ROOT, 'design', 'tokens.json'), 'utf-8'))
    );
    const pairs = JSON.parse(
      fs.readFileSync(path.join(SITE_ROOT, 'design', 'contrast-pairs.json'), 'utf-8')
    );
    const rows = evaluateContrast(tokens, pairs);
    const failures = rows.filter((r) => !r.pass);
    expect(failures).toEqual([]);
  });
});
