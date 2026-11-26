import fs from 'node:fs';
import path from 'node:path';
import { clampChroma, converter, parse } from 'culori';
import { z } from 'zod';
import { parseCliArgs } from '../../src/lib/cli-args';
import { SITE_ROOT } from '../../src/lib/paths';
import { COLOR_KEYS, PIECE_KEYS, parseTokensFile, type ColorKey, type TokensFile } from './tokens-schema';

const toRgb = converter('rgb');

const ContrastPairsSchema = z
  .object({
    text: z.array(z.tuple([z.enum(COLOR_KEYS), z.enum(COLOR_KEYS)])),
    ui: z.array(z.tuple([z.enum(COLOR_KEYS), z.enum(COLOR_KEYS)])),
    pieces: z.boolean(),
  })
  .strict();

export type ContrastPairs = z.infer<typeof ContrastPairsSchema>;

function linearizeChannel(c: number): number {
  const clamped = Math.max(0, Math.min(1, c));
  return clamped <= 0.03928 ? clamped / 12.92 : Math.pow((clamped + 0.055) / 1.055, 2.4);
}

export function relativeLuminance(colorStr: string): number {
  const parsed = parse(colorStr);
  if (!parsed) {
    throw new Error(`Unable to parse color "${colorStr}"`);
  }
  const clamped = parsed.mode === 'oklch' ? clampChroma(parsed, 'oklch') : parsed;
  const rgb = toRgb(clamped);
  if (!rgb) {
    throw new Error(`Unable to convert color "${colorStr}" to sRGB`);
  }
  const r = linearizeChannel(rgb.r);
  const g = linearizeChannel(rgb.g);
  const b = linearizeChannel(rgb.b);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(fg: string, bg: string): number {
  const l1 = relativeLuminance(fg);
  const l2 = relativeLuminance(bg);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

export interface ContrastCheckRow {
  category: 'text' | 'ui' | 'piece';
  theme: 'light' | 'dark' | 'fixed';
  pair: string;
  ratio: number;
  minRatio: number;
  pass: boolean;
}

export function evaluateContrast(tokens: TokensFile, pairs: ContrastPairs): ContrastCheckRow[] {
  const rows: ContrastCheckRow[] = [];

  const checkPairList = (
    category: 'text' | 'ui',
    list: Array<[ColorKey, ColorKey]>,
    minRatio: number
  ) => {
    for (const theme of ['light', 'dark'] as const) {
      for (const [fgKey, bgKey] of list) {
        const ratio = contrastRatio(tokens.color[fgKey][theme], tokens.color[bgKey][theme]);
        rows.push({
          category,
          theme,
          pair: `${fgKey} / ${bgKey}`,
          ratio,
          minRatio,
          pass: ratio >= minRatio,
        });
      }
    }
  };

  checkPairList('text', pairs.text, 4.5);
  checkPairList('ui', pairs.ui, 3.0);

  if (pairs.pieces) {
    for (const key of PIECE_KEYS) {
      const piece = tokens.piece[key];
      const onColor = tokens.fixed[piece.on];
      const ratio = contrastRatio(onColor, piece.fill);
      rows.push({
        category: 'piece',
        theme: 'fixed',
        pair: `piece.${key} (${piece.on})`,
        ratio,
        minRatio: 4.5,
        pass: ratio >= 4.5,
      });
    }
  }

  return rows;
}

async function main(): Promise<void> {
  parseCliArgs(process.argv.slice(2), {});
  const tokensPath = path.join(SITE_ROOT, 'design', 'tokens.json');
  const pairsPath = path.join(SITE_ROOT, 'design', 'contrast-pairs.json');

  const tokens = parseTokensFile(JSON.parse(fs.readFileSync(tokensPath, 'utf-8')) as unknown);
  const pairs = ContrastPairsSchema.parse(JSON.parse(fs.readFileSync(pairsPath, 'utf-8')) as unknown);

  const rows = evaluateContrast(tokens, pairs);
  const failures = rows.filter((r) => !r.pass);

  console.log('| Category | Theme | Pair | Ratio | Min | Status |');
  console.log('| :--- | :--- | :--- | ---: | ---: | :--- |');
  for (const r of rows) {
    console.log(
      `| ${r.category} | ${r.theme} | ${r.pair} | ${r.ratio.toFixed(2)}:1 | ${r.minRatio.toFixed(1)}:1 | ${r.pass ? 'PASS' : 'FAIL'} |`
    );
  }

  if (failures.length > 0) {
    console.error(`\nContrast check failed: ${failures.length} pair(s) below WCAG AA threshold.`);
    process.exit(1);
  }
  console.log(`\nContrast check passed (${rows.length} pairs verified).`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
