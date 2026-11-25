import { CliArgsError, parseCliArgsStrict } from '../../src/lib/cli-args';
import { ENGINE_IDS, type EngineId } from '../../src/lib/proof/claim-schema';

export interface RunnerArgs {
  engines: EngineId[];
  only: string[] | null;
  changedBase: string | null;
  shard: { index: number; total: number } | null;
  out: string;
  timeoutMs: number;
  headed: boolean;
}

const VALID_ENGINES = new Set<string>(ENGINE_IDS);

/**
 * Parses runner CLI arguments strictly (`--key value` only).
 * Throws CliArgsError on unknown options, missing values, `--key=value`, or invalid values.
 */
export function parseRunnerArgs(argv: string[]): RunnerArgs {
  const raw = parseCliArgsStrict(argv, {
    engines: 'string',
    only: 'string',
    changed: 'string',
    shard: 'string',
    out: 'string',
    timeout: 'string',
    headed: 'boolean',
  });

  if (raw._.length > 0) {
    throw new CliArgsError(`unexpected positional argument: ${raw._[0]}`);
  }

  let engines: EngineId[] = [...ENGINE_IDS];
  if (raw.engines !== undefined) {
    const parts = raw.engines
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length === 0) {
      throw new CliArgsError('--engines must list at least one engine');
    }
    const seen = new Set<EngineId>();
    const validated: EngineId[] = [];
    for (const p of parts) {
      if (!VALID_ENGINES.has(p)) {
        throw new CliArgsError(
          `invalid engine "${p}" (expected one of: ${ENGINE_IDS.join(', ')})`
        );
      }
      const id = p as EngineId;
      if (!seen.has(id)) {
        seen.add(id);
        validated.push(id);
      }
    }
    engines = validated;
  }

  let only: string[] | null = null;
  if (raw.only !== undefined) {
    const parts = raw.only
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length === 0) {
      throw new CliArgsError('--only must list at least one experiment id');
    }
    only = parts;
  }

  const changedBase = raw.changed !== undefined ? raw.changed : null;

  let shard: RunnerArgs['shard'] = null;
  if (raw.shard !== undefined) {
    const m = raw.shard.match(/^(\d+)\/(\d+)$/);
    if (!m) {
      throw new CliArgsError(`invalid --shard "${raw.shard}" (expected "<index>/<total>")`);
    }
    const index = Number(m[1]);
    const total = Number(m[2]);
    if (total < 1 || index < 1 || index > total) {
      throw new CliArgsError(
        `invalid --shard "${raw.shard}" (index must be between 1 and total)`
      );
    }
    shard = { index, total };
  }

  let timeoutMs = 15_000;
  if (raw.timeout !== undefined) {
    if (!/^\d+$/.test(raw.timeout)) {
      throw new CliArgsError(`invalid --timeout "${raw.timeout}" (expected a positive integer)`);
    }
    timeoutMs = Number(raw.timeout);
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
      throw new CliArgsError(`invalid --timeout "${raw.timeout}" (expected a positive integer)`);
    }
  }

  const defaultOut = shard
    ? `artifacts/proof/experiments.${shard.index}-of-${shard.total}.json`
    : 'artifacts/proof/experiments.json';
  const out = raw.out ?? defaultOut;

  return {
    engines,
    only,
    changedBase,
    shard,
    out,
    timeoutMs,
    headed: Boolean(raw.headed),
  };
}

/** Deterministic shard assignment: sorted ids, id at index k goes to shard (k % total) + 1. */
export function applyShard(ids: string[], shard: RunnerArgs['shard']): string[] {
  if (!shard) return ids;
  return [...ids].sort().filter((_, k) => (k % shard.total) + 1 === shard.index);
}

export const RUNTIME_PATTERNS = [
  /^src\/lib\/proof\//,
  /^scripts\/proof\//,
  /^package-lock\.json$/,
];

/** MDX pages that can carry claims. */
export const PAGE_MDX_RE =
  /^content\/(concepts|autopsies|symptoms|deep-dives|myths)\/([a-z0-9-]+)\.mdx$/;

/**
 * Selects which Experiments to re-run from the list of changed files:
 * - proof runtime/scripts or package-lock.json -> all
 * - content/experiments/<id>/... -> <id>
 * - content/claims/<page>.claims.json -> Experiments referenced by that claims file
 * - content/<kind>/<page>.mdx -> Experiments referenced by that page's claims
 * - content/.proof-results/** -> none
 */
export function selectChangedExperiments(
  changedFiles: string[],
  allIds: string[],
  claimsExperimentRefs: Map<string, string[]>
): string[] {
  if (changedFiles.some((f) => RUNTIME_PATTERNS.some((re) => re.test(f)))) {
    return [...allIds];
  }
  const allSet = new Set(allIds);
  const selected = new Set<string>();
  for (const f of changedFiles) {
    if (f.startsWith('content/.proof-results/')) continue;
    const exp = f.match(/^content\/experiments\/([a-z0-9-]+)\//);
    if (exp && allSet.has(exp[1])) selected.add(exp[1]);
    const claims = f.match(/^content\/claims\/([a-z0-9-]+)\.claims\.json$/);
    if (claims) {
      for (const id of claimsExperimentRefs.get(claims[1]) ?? []) {
        if (allSet.has(id)) selected.add(id);
      }
    }
    const mdx = f.match(PAGE_MDX_RE);
    if (mdx) {
      for (const id of claimsExperimentRefs.get(mdx[2]) ?? []) {
        if (allSet.has(id)) selected.add(id);
      }
    }
  }
  return [...selected].sort();
}
