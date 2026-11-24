import fs from 'fs';
import path from 'path';

export const PUBLIC_SKILL_WHITELIST = [
  'LICENSE',
  'README.md',
  'SKILL.md',
  'references/audit-catalog.md',
] as const;

export type PublicSkillWhitelistPath = (typeof PUBLIC_SKILL_WHITELIST)[number];

export const FORBIDDEN_PRIVATE_PREFIXES = [
  'content/',
  'scripts/',
  '.agents/',
  '.github/',
  'src/',
  'tests/',
  'netlify/',
  'public/',
] as const;

export interface BuildPublicSkillBundleOptions {
  sourceDir?: string;
  outputDir?: string;
}

export interface PublicSkillBundleResult {
  sourceDir: string;
  outputDir: string;
  files: string[];
}

function walkRelativeFiles(rootDir: string, currentDir = rootDir): string[] {
  if (!fs.existsSync(currentDir)) return [];
  const entries = fs.readdirSync(currentDir, { withFileTypes: true });
  const results: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(currentDir, entry.name);
    const relPath = path.relative(rootDir, fullPath).split(path.sep).join('/');

    if (entry.isSymbolicLink()) {
      throw new Error(`Public skill bundle forbids symbolic links: "${relPath}"`);
    }

    if (entry.isDirectory()) {
      results.push(...walkRelativeFiles(rootDir, fullPath));
    } else if (entry.isFile()) {
      results.push(relPath);
    }
  }

  return results.sort();
}

export function assertPublicSkillWhitelist(relativeFiles: string[]): void {
  const whitelistSet = new Set<string>(PUBLIC_SKILL_WHITELIST);

  for (const rel of relativeFiles) {
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
      throw new Error(`Invalid path traversal in public skill bundle: "${rel}"`);
    }
    for (const prefix of FORBIDDEN_PRIVATE_PREFIXES) {
      if (rel.startsWith(prefix)) {
        throw new Error(`Forbidden private path detected in public skill bundle: "${rel}"`);
      }
    }
    if (!whitelistSet.has(rel)) {
      throw new Error(
        `Non-whitelisted file detected in public skill bundle: "${rel}". Allowed files: ${PUBLIC_SKILL_WHITELIST.join(', ')}`
      );
    }
  }

  for (const required of PUBLIC_SKILL_WHITELIST) {
    if (!relativeFiles.includes(required)) {
      throw new Error(`Missing required public skill file: "${required}"`);
    }
  }
}

export function buildPublicSkillBundle(
  options: BuildPublicSkillBundleOptions = {}
): PublicSkillBundleResult {
  const sourceDir = path.resolve(
    options.sourceDir ?? path.join(process.cwd(), 'packages', 'public-skill')
  );
  const outputDir = path.resolve(
    options.outputDir ?? path.join(process.cwd(), 'dist-public-skill')
  );

  if (!fs.existsSync(sourceDir)) {
    throw new Error(`Public skill source directory does not exist: ${sourceDir}`);
  }

  const sourceFiles = walkRelativeFiles(sourceDir);
  assertPublicSkillWhitelist(sourceFiles);

  fs.rmSync(outputDir, { recursive: true, force: true });
  fs.mkdirSync(outputDir, { recursive: true });

  for (const rel of PUBLIC_SKILL_WHITELIST) {
    const srcPath = path.join(sourceDir, rel);
    const dstPath = path.join(outputDir, rel);
    fs.mkdirSync(path.dirname(dstPath), { recursive: true });
    fs.copyFileSync(srcPath, dstPath);
  }

  const exportedFiles = walkRelativeFiles(outputDir);
  assertPublicSkillWhitelist(exportedFiles);

  return {
    sourceDir,
    outputDir,
    files: exportedFiles,
  };
}
