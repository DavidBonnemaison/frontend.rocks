import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { SITE_ROOT } from '@/lib/paths';
import { parseTokensFile } from '../scripts/design/tokens-schema';
import { generateTokensCss, generateTokensTs } from '../scripts/design/build-tokens';

function readRawTokens(): Record<string, unknown> {
  const file = path.join(SITE_ROOT, 'design', 'tokens.json');
  return JSON.parse(fs.readFileSync(file, 'utf-8')) as Record<string, unknown>;
}

describe('design tokens generation', () => {
  it('committed generated files are in sync with design/tokens.json', () => {
    const tokens = parseTokensFile(readRawTokens());
    const expectedCss = generateTokensCss(tokens);
    const expectedTs = generateTokensTs(tokens);

    const actualCss = fs.readFileSync(path.join(SITE_ROOT, 'src', 'styles', 'tokens.css'), 'utf-8');
    const actualTs = fs.readFileSync(
      path.join(SITE_ROOT, 'src', 'lib', 'design', 'tokens.generated.ts'),
      'utf-8'
    );

    expect(actualCss).toBe(expectedCss);
    expect(actualTs).toBe(expectedTs);
  });

  it('rejects a missing color key with the key name in the error', () => {
    const raw = readRawTokens();
    const color = { ...(raw.color as Record<string, unknown>) };
    delete color.accent;
    expect(() => parseTokensFile({ ...raw, color })).toThrow(/accent/);
  });

  it('rejects an extra unknown key', () => {
    const raw = readRawTokens();
    expect(() => parseTokensFile({ ...raw, unexpectedKey: true })).toThrow(/unexpectedKey|Unrecognized/);
  });

  it('rejects a non-oklch color value', () => {
    const raw = readRawTokens();
    const color = {
      ...(raw.color as Record<string, unknown>),
      accent: { light: '#ff0000', dark: 'oklch(0.74 0.15 40)' },
    };
    expect(() => parseTokensFile({ ...raw, color })).toThrow(/oklch/);
  });

  it('falls back --font-display to var(--font-text) when font.display is absent', () => {
    const tokens = parseTokensFile(readRawTokens());
    expect(tokens.font.display).toBeUndefined();
    const css = generateTokensCss(tokens);
    expect(css).toContain('--font-display: var(--font-text);');
  });
});
