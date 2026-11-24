import path from 'path';
import { buildPublicSkillBundle } from '../src/lib/public-skill-bundle';

function parseArgs(argv: string[]): { outDir?: string; sourceDir?: string } {
  let outDir: string | undefined;
  let sourceDir: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if ((arg === '--out' || arg === '-o') && argv[i + 1]) {
      outDir = path.resolve(argv[i + 1]);
      i++;
    } else if ((arg === '--source' || arg === '-s') && argv[i + 1]) {
      sourceDir = path.resolve(argv[i + 1]);
      i++;
    }
  }

  return { outDir, sourceDir };
}

function main(): void {
  const { outDir, sourceDir } = parseArgs(process.argv.slice(2));
  const result = buildPublicSkillBundle({ sourceDir, outputDir: outDir });
  console.log(
    `✅ Built public skill bundle at ${result.outputDir} (${result.files.length} whitelisted files: ${result.files.join(', ')})`
  );
}

main();
