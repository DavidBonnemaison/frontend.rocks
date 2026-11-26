import { z } from 'zod';

const Oklch = z
  .string()
  .regex(/^oklch\(\s*[\d.]+\s+[\d.]+\s+[\d.]+\s*\)$/, 'expected oklch(L C H)');
const ThemePair = z.object({ light: Oklch, dark: Oklch }).strict();

export const COLOR_KEYS = [
  'paper',
  'paper-sunk',
  'ink',
  'ink-muted',
  'ink-faint',
  'rule',
  'rule-soft',
  'accent',
  'focus',
  'device',
  'device-inset',
  'led',
  'led-ok',
  'ok',
  'warn',
  'fail',
] as const;

export type ColorKey = (typeof COLOR_KEYS)[number];

export const PIECE_KEYS = [
  'saffron',
  'tangerine',
  'vermilion',
  'rose',
  'magenta',
  'violet',
  'cobalt',
  'sky',
  'aqua',
  'green',
  'lime',
  'sand',
] as const;

export type PieceKey = (typeof PIECE_KEYS)[number];

const PieceEntry = z.object({ fill: Oklch, on: z.enum(['ink', 'paper']) }).strict();

const Font = z
  .object({
    family: z.string().min(1),
    fallback: z.string().min(1),
    usage: z.string().optional(),
  })
  .strict();

export const TokensFileSchema = z
  .object({
    $schemaVersion: z.literal(2),
    direction: z.enum(['revue', 'instrument']),
    color: z
      .object(
        Object.fromEntries(COLOR_KEYS.map((k) => [k, ThemePair])) as Record<
          ColorKey,
          typeof ThemePair
        >
      )
      .strict(),
    fixed: z.object({ ink: Oklch, paper: Oklch }).strict(),
    piece: z
      .object(
        Object.fromEntries(PIECE_KEYS.map((k) => [k, PieceEntry])) as Record<
          PieceKey,
          typeof PieceEntry
        >
      )
      .strict(),
    font: z
      .object({
        text: Font,
        meta: Font,
        readout: Font,
        display: Font.optional(),
      })
      .strict(),
    schematic: z
      .object({
        stroke: z.number(),
        strokeFine: z.number(),
        dash: z.string(),
        labelSize: z.number(),
        arrow: z.number(),
      })
      .strict(),
  })
  .strict();

export type TokensFile = z.infer<typeof TokensFileSchema>;

export function parseTokensFile(raw: unknown): TokensFile {
  const result = TokensFileSchema.safeParse(raw);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid design/tokens.json: ${details}`);
  }
  return result.data;
}
