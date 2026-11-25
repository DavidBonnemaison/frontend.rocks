import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { SITE_ROOT } from '../../paths';

const require = createRequire(import.meta.url);

function readPackageJsonIfMatching(filePath: string, name: string): string | null {
  if (!fs.existsSync(filePath)) return null;
  const pkg = JSON.parse(fs.readFileSync(filePath, 'utf8')) as { name?: string; version?: string };
  if (pkg.name === name && pkg.version) return pkg.version;
  return null;
}

/** Reads the installed package version from disk without relying on its `exports` map. */
export function readInstalledPackageVersion(name: string): string {
  try {
    let dir = path.dirname(require.resolve(name));
    for (let i = 0; i < 10; i++) {
      const version = readPackageJsonIfMatching(path.join(dir, 'package.json'), name);
      if (version) return version;
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  } catch {
    // Fallback for bundled server environments where dynamic require.resolve is unavailable.
  }

  let dir = SITE_ROOT;
  for (let i = 0; i < 10; i++) {
    const candidate = path.join(dir, 'node_modules', ...name.split('/'), 'package.json');
    const version = readPackageJsonIfMatching(candidate, name);
    if (version) return version;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  throw new Error(`Cannot find package.json for ${name}`);
}
