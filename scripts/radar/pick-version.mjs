import { execFileSync } from 'node:child_process';
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

/**
 * Picks the highest stable semver version from an `npm view <pkg> time --json` map
 * published at least `minAgeDays` days before `nowMs`.
 * Ignores prereleases (any version containing `-`) and metadata keys (`created`, `modified`).
 */
export function pickVersionFromTimeMap(timeMap, minAgeDays, nowMs = Date.now()) {
  if (!timeMap || typeof timeMap !== 'object') {
    throw new Error('Invalid time map');
  }
  if (!Number.isFinite(minAgeDays) || minAgeDays < 0) {
    throw new Error(`Invalid minimum age in days: ${minAgeDays}`);
  }

  const cutoffMs = nowMs - minAgeDays * 86_400_000;
  const eligible = [];

  for (const [version, publishedAt] of Object.entries(timeMap)) {
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

  if (eligible.length === 0) {
    throw new Error(`No stable version published at least ${minAgeDays} day(s) ago`);
  }

  eligible.sort(compareSemver);
  return eligible[eligible.length - 1];
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
  const picked = pickVersionFromTimeMap(timeMap, minAgeDays);
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
