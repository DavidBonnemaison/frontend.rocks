import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import { parseCliArgs } from '../../src/lib/cli-args';
import { CONTENT_DIR } from '../../src/lib/paths';
import {
  nextPieceColor,
  PieceColorSchema,
  type PieceColor,
} from '../../src/lib/design/piece-colors';

type PieceKind = 'autopsy' | 'deep-dive' | 'myth';

const KIND_CONFIG: Record<
  PieceKind,
  { dir: string; numberField: string }
> = {
  autopsy: { dir: 'autopsies', numberField: 'case_number' },
  'deep-dive': { dir: 'deep-dives', numberField: 'issue_number' },
  myth: { dir: 'myths', numberField: 'myth_number' },
};

interface PieceFileInfo {
  kind: PieceKind;
  filePath: string;
  fileName: string;
  orderNumber: number;
  existingColor: PieceColor | null;
}

function readPiecesForKind(kind: PieceKind): PieceFileInfo[] {
  const { dir, numberField } = KIND_CONFIG[kind];
  const fullDir = path.join(CONTENT_DIR, dir);
  if (!fs.existsSync(fullDir)) return [];

  const files = fs
    .readdirSync(fullDir)
    .filter((f) => f.endsWith('.mdx') || f.endsWith('.md'))
    .sort();

  const items: PieceFileInfo[] = [];
  for (const fileName of files) {
    const filePath = path.join(fullDir, fileName);
    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = matter(raw);
    const numRaw = parsed.data[numberField];
    const orderNumber = typeof numRaw === 'number' ? numRaw : Number.MAX_SAFE_INTEGER;
    const colorRaw = parsed.data.piece_color;
    const colorRes = PieceColorSchema.safeParse(colorRaw);
    items.push({
      kind,
      filePath,
      fileName,
      orderNumber,
      existingColor: colorRes.success ? colorRes.data : null,
    });
  }

  return items.sort(
    (a, b) => a.orderNumber - b.orderNumber || a.fileName.localeCompare(b.fileName)
  );
}

export function insertPieceColorLine(
  rawMdx: string,
  color: PieceColor,
  anchorField: string
): string {
  const lines = rawMdx.split('\n');
  if (lines[0]?.trim() !== '---') {
    throw new Error('Missing YAML frontmatter opening delimiter');
  }
  const endIdx = lines.findIndex((line, i) => i > 0 && line.trim() === '---');
  if (endIdx === -1) {
    throw new Error('Missing YAML frontmatter closing delimiter');
  }

  // Never overwrite an existing piece_color line
  for (let i = 1; i < endIdx; i++) {
    if (/^\s*piece_color\s*:/.test(lines[i])) {
      return rawMdx;
    }
  }

  const anchorRe = new RegExp(`^${anchorField}\\s*:`);
  let insertAt = -1;
  for (let i = 1; i < endIdx; i++) {
    if (anchorRe.test(lines[i])) {
      insertAt = i + 1;
      break;
    }
  }
  if (insertAt === -1) {
    insertAt = endIdx;
  }

  lines.splice(insertAt, 0, `piece_color: ${color}`);
  return lines.join('\n');
}

async function main(): Promise<void> {
  const args = parseCliArgs(process.argv.slice(2), {
    kind: 'string',
    'dry-run': 'boolean',
  });

  const kindArg = (args.kind ?? 'autopsy') as string;
  if (kindArg !== 'autopsy' && kindArg !== 'deep-dive' && kindArg !== 'myth') {
    console.error(`Invalid --kind "${kindArg}". Expected: autopsy | deep-dive | myth`);
    process.exit(2);
  }
  const kind: PieceKind = kindArg;
  const dryRun = Boolean(args['dry-run']);

  // Gather already-colored pieces from all other kinds so cross-category history is respected
  const otherColors: PieceColor[] = [];
  for (const otherKind of Object.keys(KIND_CONFIG) as PieceKind[]) {
    if (otherKind === kind) continue;
    for (const item of readPiecesForKind(otherKind)) {
      if (item.existingColor) otherColors.push(item.existingColor);
    }
  }

  const targetPieces = readPiecesForKind(kind);
  const history: PieceColor[] = [...otherColors];
  const anchorField = KIND_CONFIG[kind].numberField;

  let changed = 0;
  for (const piece of targetPieces) {
    if (piece.existingColor) {
      history.push(piece.existingColor);
      continue;
    }
    const chosen = nextPieceColor(history);
    history.push(chosen);
    changed++;

    if (dryRun) {
      console.log(`[dry-run] ${piece.fileName} -> piece_color: ${chosen}`);
    } else {
      const raw = fs.readFileSync(piece.filePath, 'utf-8');
      const updated = insertPieceColorLine(raw, chosen, anchorField);
      fs.writeFileSync(piece.filePath, updated, 'utf-8');
      console.log(`Assigned ${piece.fileName} -> piece_color: ${chosen}`);
    }
  }

  if (changed === 0) {
    console.log(`No ${kind} files needed piece_color assignment.`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
