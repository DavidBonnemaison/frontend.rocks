import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCliArgs } from '../../src/lib/cli-args';
import { SITE_ROOT } from '../../src/lib/paths';
import { writeProofArtifact } from '../../src/lib/proof/artifact-io';
import type { PageCheckResult, ProofArtifact } from '../../src/lib/proof/artifact-schema';
import type { Claim } from '../../src/lib/proof/claim-schema';
import { getAllClaims } from '../../src/lib/proof/claims-loader';
import {
  pruneCoverageLabels,
  readCoverageLabels,
  readCoverageMeta,
} from '../../src/lib/proof/coverage/cache';
import {
  checkPageCoverage,
  collectPageCoverageKeys,
  extractForeignClaimIds,
} from '../../src/lib/proof/coverage/check-page';
import { getAllPageRefs } from '../../src/lib/proof/page-registry';

export interface RunCoverageOptions {
  page?: string;
  all?: boolean;
  pruneCache?: boolean;
  strict?: boolean;
  out?: string;
}

export function runCoverageCheck(options: RunCoverageOptions = {}): {
  artifact: ProofArtifact;
  outPath: string;
  exitCode: 0 | 1;
  prunedTotal: number;
} {
  const outPath = options.out
    ? path.resolve(SITE_ROOT, options.out)
    : path.join(SITE_ROOT, 'artifacts', 'proof', 'coverage.json');

  const { pages: allPages } = getAllPageRefs();
  const mdxPages = allPages.filter((p): p is typeof p & { mdxPath: string } => p.mdxPath !== null);

  const selectedPages = options.page
    ? mdxPages.filter((p) => p.id === options.page)
    : mdxPages;

  if (options.page && selectedPages.length === 0) {
    throw new Error(`No MDX page found with id "${options.page}".`);
  }

  const claimsById = new Map<string, Claim>(getAllClaims().map((c) => [c.id, c]));
  const meta = readCoverageMeta();

  const pagesRecord: Record<string, PageCheckResult> = {};
  let prunedTotal = 0;

  for (const page of selectedPages) {
    const absPath = path.resolve(SITE_ROOT, page.mdxPath);
    const raw = fs.readFileSync(absPath, 'utf-8');
    const shouldCheck =
      Boolean(options.page) || Boolean(options.all) || page.proofStatus === 'proven';
    const enforced = page.proofStatus === 'proven';

    if (!shouldCheck) {
      pagesRecord[page.id] = {
        pageId: page.id,
        status: 'skipped',
        enforced: false,
        violations: [],
        stats: {},
        foreignClaimIds: extractForeignClaimIds(raw, page.id),
      };
      continue;
    }

    if (options.pruneCache && meta !== null) {
      const referencedKeys = collectPageCoverageKeys(raw, page.id, claimsById, meta);
      prunedTotal += pruneCoverageLabels(page.id, referencedKeys);
    }

    const labels = readCoverageLabels(page.id);
    const result = checkPageCoverage({
      pageId: page.id,
      raw,
      claimsById,
      enforced,
      meta,
      labels,
    });
    pagesRecord[page.id] = result;

    const icon = result.status === 'pass' ? '✅' : '❌';
    const totalSentences = result.stats.sentences ?? 0;
    const linked = result.stats.linked ?? 0;
    const issues = result.violations.length;
    console.log(
      `${icon} ${page.id} ${totalSentences} sentences · ${linked} linked · ${issues} issues`
    );
    for (const v of result.violations) {
      const loc = v.line !== null ? `${page.mdxPath}:${v.line}` : page.mdxPath;
      console.log(`   ${loc} [${v.rule}] ${v.message}`);
    }
  }

  const artifact: ProofArtifact = {
    schemaVersion: 1,
    kind: 'coverage',
    generatedAt: new Date().toISOString(),
    mode: 'offline',
    tooling: {},
    claims: {},
    pages: pagesRecord,
  };

  writeProofArtifact(artifact, outPath);

  const hasEnforcedFailure = Object.values(pagesRecord).some(
    (p) => p.enforced && p.status === 'fail'
  );
  const exitCode: 0 | 1 = options.strict && hasEnforcedFailure ? 1 : 0;

  return { artifact, outPath, exitCode, prunedTotal };
}

async function main(): Promise<void> {
  const args = parseCliArgs(process.argv.slice(2), {
    page: 'string',
    all: 'boolean',
    'prune-cache': 'boolean',
    strict: 'boolean',
    out: 'string',
  });

  const { exitCode } = runCoverageCheck({
    page: args.page,
    all: args.all,
    pruneCache: args['prune-cache'],
    strict: args.strict,
    out: args.out,
  });

  process.exit(exitCode);
}

const currentFile = typeof __filename !== 'undefined' ? __filename : fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(currentFile)) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(2);
  });
}
