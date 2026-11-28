import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONTENT_DIR, PUBLIC_DIR } from '../src/lib/paths';
import { parseCliArgs } from '../src/lib/cli-args';
import { RedirectsFileSchema } from '../src/lib/redirects/schema';
import { buildRedirectsFile, type NamedRedirectsFile } from '../src/lib/redirects/build';

export function loadRedirectFiles(
  redirectsDir = path.join(CONTENT_DIR, 'redirects'),
): NamedRedirectsFile[] {
  if (!fs.existsSync(redirectsDir)) return [];
  const files = fs
    .readdirSync(redirectsDir)
    .filter((f) => f.endsWith('.json'))
    .sort();

  return files.map((fileName) => {
    const raw = JSON.parse(fs.readFileSync(path.join(redirectsDir, fileName), 'utf-8'));
    const data = RedirectsFileSchema.parse(raw);
    return { fileName, data };
  });
}

export function generateRedirectsFile(opts?: {
  redirectsDir?: string;
  outFile?: string;
}): { ruleCount: number; fileCount: number; outFile: string } {
  const redirectsDir = opts?.redirectsDir ?? path.join(CONTENT_DIR, 'redirects');
  const outFile = opts?.outFile ?? path.join(PUBLIC_DIR, '_redirects');
  const named = loadRedirectFiles(redirectsDir);
  const content = buildRedirectsFile(named);

  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, content, 'utf-8');

  const ruleCount = named.reduce((sum, f) => sum + f.data.rules.length, 0);
  return { ruleCount, fileCount: named.length, outFile };
}

async function main(): Promise<void> {
  parseCliArgs(process.argv.slice(2), {});
  const { ruleCount, fileCount, outFile } = generateRedirectsFile();
  console.log(
    `✅ Built ${path.relative(process.cwd(), outFile)} (${ruleCount} rule(s) from ${fileCount} file(s)).`,
  );
}

const isDirect =
  (typeof __filename !== 'undefined' && process.argv[1] === __filename) ||
  (typeof import.meta?.url === 'string' && process.argv[1] === fileURLToPath(import.meta.url));

if (isDirect) {
  main().catch((err) => {
    console.error('Failed to build redirects:', err);
    process.exit(1);
  });
}
