import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const STABLE_SEMVER_RE = /^(\d+)\.(\d+)\.(\d+)$/;

/** Compares two strict major.minor.patch semver strings ascending. */
export function compareSemver(a, b) {
  const ma = STABLE_SEMVER_RE.exec(a);
  const mb = STABLE_SEMVER_RE.exec(b);
  if (!ma || !mb) return a.localeCompare(b);
  for (let i = 1; i <= 3; i++) {
    const diff = Number(ma[i]) - Number(mb[i]);
    if (diff !== 0) return diff;
  }
  return 0;
}

/** Reads the currently installed stable semver version from node_modules, or null if absent. */
export function readInstalledVersion(pkg, rootDir = process.cwd()) {
  const candidate = path.join(rootDir, 'node_modules', ...pkg.split('/'), 'package.json');
  if (!fs.existsSync(candidate)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(candidate, 'utf-8'));
    if (typeof parsed?.version === 'string' && STABLE_SEMVER_RE.test(parsed.version)) {
      return parsed.version;
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Picks the highest stable semver version from an `npm view <pkg> time --json` payload
 * published at least `minAgeDays` days before `nowMs`.
 * Accepts both the object form (npm <= 11) and the single-element array form (npm 12+).
 * Ignores prereleases (any version containing `-`) and metadata keys (`created`, `modified`).
 * When `installedVersion` is provided, never downgrades below it.
 *
 * @param {Record<string, string> | Array<Record<string, string>>} timeMap
 * @param {number} minAgeDays
 * @param {number} [nowMs]
 * @param {string | null} [installedVersion]
 * @returns {string}
 */
export function pickVersionFromTimeMap(
  timeMap,
  minAgeDays,
  nowMs = Date.now(),
  installedVersion = null,
) {
  const unwrapped = Array.isArray(timeMap) ? timeMap[timeMap.length - 1] : timeMap;
  if (!unwrapped || typeof unwrapped !== 'object' || Array.isArray(unwrapped)) {
    throw new Error('Invalid time map');
  }
  if (!Number.isFinite(minAgeDays) || minAgeDays < 0) {
    throw new Error(`Invalid minimum age in days: ${minAgeDays}`);
  }

  const cutoffMs = nowMs - minAgeDays * 86_400_000;
  const eligible = [];

  for (const [version, publishedAt] of Object.entries(unwrapped)) {
    if (version === 'created' || version === 'modified') continue;
    if (version.includes('-')) continue;
    if (!STABLE_SEMVER_RE.test(version)) continue;
    if (typeof publishedAt !== 'string') continue;

    const ts = Date.parse(publishedAt);
    if (!Number.isFinite(ts)) continue;
    if (ts <= cutoffMs) {
      eligible.push(version);
    }
  }

  const validInstalled =
    typeof installedVersion === 'string' && STABLE_SEMVER_RE.test(installedVersion)
      ? installedVersion
      : null;

  if (eligible.length === 0) {
    if (validInstalled) return validInstalled;
    throw new Error(`No stable version published at least ${minAgeDays} day(s) ago`);
  }

  eligible.sort(compareSemver);
  const picked = eligible[eligible.length - 1];
  if (validInstalled && compareSemver(validInstalled, picked) > 0) {
    return validInstalled;
  }
  return picked;
}

function main() {
  const [pkg, daysRaw] = process.argv.slice(2);
  if (!pkg || !daysRaw) {
    console.error('Usage: node scripts/radar/pick-version.mjs <package> <min-age-days>');
    process.exit(2);
  }
  const minAgeDays = Number(daysRaw);
  if (!Number.isFinite(minAgeDays) || minAgeDays < 0) {
    console.error(`Invalid days argument "${daysRaw}"`);
    process.exit(2);
  }

  const raw = execFileSync('npm', ['view', pkg, 'time', '--json'], {
    encoding: 'utf-8',
  });
  const timeMap = JSON.parse(raw);
  const installed = readInstalledVersion(pkg);
  const picked = pickVersionFromTimeMap(timeMap, minAgeDays, Date.now(), installed);
  process.stdout.write(`${picked}\n`);
}

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(currentFile)) {
  try {
    main();
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}
