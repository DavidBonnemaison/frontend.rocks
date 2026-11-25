import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';
import { CONTENT_DIR } from '../../src/lib/paths';
import { parseCliArgs } from '../../src/lib/cli-args';
import { ConceptFrontmatterFileSchema, type MaturityStatus } from '../../src/lib/schemas';
import { computeConceptMaturity } from '../../src/lib/proof/support/maturity';

export interface MaturityMigrationRow {
  conceptId: string;
  previous: string | null;
  computed: MaturityStatus | null;
  changed: boolean;
}

const MATURITY_LINE_RE = /^maturity_status:\s*(.+?)\s*$/;
const PATTERN_STATUS_VALUES = new Set(['legacy-pattern', 'superseded']);

function unquote(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

/**
 * Line-by-line frontmatter migration: replaces `maturity_status: superseded|legacy-pattern`
 * with `pattern_status: <value>`, and removes all other `maturity_status:` lines without
 * re-serializing YAML.
 */
export function migrateConceptRaw(raw: string): {
  updated: string;
  previous: string | null;
  changed: boolean;
} {
  const eol = raw.includes('\r\n') ? '\r\n' : '\n';
  const lines = raw.split(/\r?\n/);
  if (lines[0] !== '---') {
    return { updated: raw, previous: null, changed: false };
  }

  let endIdx = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === '---') {
      endIdx = i;
      break;
    }
  }
  if (endIdx === -1) {
    return { updated: raw, previous: null, changed: false };
  }

  let previous: string | null = null;
  let changed = false;
  const outFrontmatter: string[] = [];

  for (let i = 1; i < endIdx; i++) {
    const line = lines[i];
    const match = MATURITY_LINE_RE.exec(line);
    if (!match) {
      outFrontmatter.push(line);
      continue;
    }
    previous = unquote(match[1]);
    changed = true;
    if (PATTERN_STATUS_VALUES.has(previous)) {
      outFrontmatter.push(`pattern_status: ${previous}`);
    }
  }

  if (!changed) {
    return { updated: raw, previous: null, changed: false };
  }

  const rebuilt = [lines[0], ...outFrontmatter, ...lines.slice(endIdx)].join(eol);
  return { updated: rebuilt, previous, changed: true };
}

export function migrateConceptsDirectory(
  conceptsDir: string,
  options: { dryRun?: boolean } = {}
): MaturityMigrationRow[] {
  const files = fs
    .readdirSync(conceptsDir)
    .filter((f) => f.endsWith('.mdx') || f.endsWith('.md'))
    .sort();

  const rows: MaturityMigrationRow[] = [];

  for (const file of files) {
    const filePath = path.join(conceptsDir, file);
    const raw = fs.readFileSync(filePath, 'utf-8');
    const { updated, previous, changed } = migrateConceptRaw(raw);

    const parsed = matter(updated);
    const fm = ConceptFrontmatterFileSchema.parse(parsed.data);
    const computed = computeConceptMaturity(fm);

    if (changed && !options.dryRun) {
      fs.writeFileSync(filePath, updated, 'utf-8');
    }

    rows.push({
      conceptId: fm.id,
      previous,
      computed,
      changed,
    });
  }

  return rows;
}

export function formatMigrationTable(rows: MaturityMigrationRow[]): string {
  const lines = [
    '| Concept | Previous `maturity_status` | Computed `maturity_status` |',
    '| :--- | :--- | :--- |',
  ];
  for (const row of rows) {
    lines.push(
      `| \`${row.conceptId}\` | ${row.previous ?? '_(none)_'} | ${row.computed ?? '`null` (pattern)'} |`
    );
  }
  return lines.join('\n');
}

async function main(): Promise<void> {
  const args = parseCliArgs(process.argv.slice(2), {
    'dry-run': 'boolean',
    'report-out': 'string',
  });

  const conceptsDir = path.join(CONTENT_DIR, 'concepts');
  const rows = migrateConceptsDirectory(conceptsDir, { dryRun: Boolean(args['dry-run']) });
  const table = formatMigrationTable(rows);
  const changedCount = rows.filter((r) => r.changed).length;

  if (args['report-out']) {
    fs.mkdirSync(path.dirname(args['report-out']), { recursive: true });
    fs.writeFileSync(args['report-out'], `${table}\n`, 'utf-8');
  }

  console.log(table);
  console.log(
    `\nProcessed ${rows.length} concept(s): ${changedCount} file(s) ${args['dry-run'] ? 'would be updated' : 'updated'}.`
  );
}

const currentFile = typeof __filename !== 'undefined' ? __filename : fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(currentFile)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
