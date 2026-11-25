import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCliArgs } from '../../src/lib/cli-args';
import { SITE_ROOT } from '../../src/lib/paths';
import { writeProofArtifact } from '../../src/lib/proof/artifact-io';
import type {
  ClaimCheckResult,
  PageCheckResult,
  ProofArtifact,
} from '../../src/lib/proof/artifact-schema';
import { splitClaimId, type PageProofStatus } from '../../src/lib/proof/claim-schema';
import { getAllClaims } from '../../src/lib/proof/claims-loader';
import { getPageProofStatusMap } from '../../src/lib/proof/page-registry';
import {
  pruneSourceRecords,
  recordSourceExcerpt,
  type SourceQuoteClaim,
} from '../../src/lib/proof/source/record';
import { isSourceRepo } from '../../src/lib/proof/source/repos';
import { resolveSourceQuote } from '../../src/lib/proof/source/resolve';
import {
  computeExitCode,
  verifySourceQuote,
  type SourceVerifyOutcome,
} from '../../src/lib/proof/source/verify';

export interface UnavailableSourceEntry {
  claimId: string;
  repo: string;
  commit: string;
  path: string;
  error: string;
}

function sidecarPath(outPath: string, suffix: string): string {
  return outPath.endsWith('.json')
    ? `${outPath.slice(0, -'.json'.length)}.${suffix}.json`
    : `${outPath}.${suffix}.json`;
}

export function buildSourceQuotesArtifact(input: {
  outcomes: Array<{ claim: SourceQuoteClaim; outcome: SourceVerifyOutcome }>;
  pageStatuses: Map<string, PageProofStatus>;
  generatedAt: string;
}): { artifact: ProofArtifact; unavailable: UnavailableSourceEntry[] } {
  const claims: Record<string, ClaimCheckResult> = {};
  const unavailable: UnavailableSourceEntry[] = [];
  const pageGroups = new Map<string, ClaimCheckResult[]>();

  for (const { claim, outcome } of input.outcomes) {
    const { pageId } = splitClaimId(claim.id);
    if (!pageGroups.has(pageId)) pageGroups.set(pageId, []);
    if (outcome.kind === 'unavailable') {
      unavailable.push({
        claimId: claim.id,
        repo: claim.proof.repo,
        commit: claim.proof.commit,
        path: claim.proof.path,
        error: outcome.error,
      });
      continue;
    }
    claims[claim.id] = outcome.result;
    pageGroups.get(pageId)!.push(outcome.result);
  }

  const pages: Record<string, PageCheckResult> = {};
  for (const [pageId, results] of [...pageGroups.entries()].sort(([a], [b]) =>
    a.localeCompare(b)
  )) {
    const failed = results.filter((r) => r.status === 'failed' || r.status === 'stale');
    const proven = results.filter((r) => r.status === 'proven');
    const enforced = input.pageStatuses.get(pageId) === 'proven';
    pages[pageId] = {
      pageId,
      status: failed.length > 0 ? 'fail' : 'pass',
      enforced,
      violations: failed.map((r) => ({
        rule: r.reason ?? 'source-quote-failed',
        line: null,
        column: null,
        message: `${r.claimId}: ${r.message ?? r.status}`,
        excerpt: null,
      })),
      stats: {
        total: results.length,
        proven: proven.length,
        failed: results.filter((r) => r.status === 'failed').length,
        stale: results.filter((r) => r.status === 'stale').length,
      },
      foreignClaimIds: [],
    };
  }

  const artifact: ProofArtifact = {
    schemaVersion: 1,
    kind: 'source-quotes',
    generatedAt: input.generatedAt,
    mode: 'online',
    tooling: {
      'unavailable-claims': String(unavailable.length),
    },
    claims,
    pages,
  };

  return { artifact, unavailable };
}

async function main(): Promise<void> {
  const args = parseCliArgs(process.argv.slice(2), {
    record: 'boolean',
    resolve: 'boolean',
    repo: 'string',
    path: 'string',
    'snippet-file': 'string',
    commit: 'string',
    page: 'string',
    claim: 'string',
    'prune-cache': 'boolean',
    'max-age-hours': 'string',
    strict: 'boolean',
    out: 'string',
  });

  if (args['max-age-hours'] !== undefined) {
    const maxAgeHours = Number(args['max-age-hours']);
    if (!Number.isFinite(maxAgeHours) || maxAgeHours < 0) {
      console.error(`Invalid --max-age-hours value: ${args['max-age-hours']}`);
      process.exit(2);
    }
  }

  if (args.resolve) {
    if (!args.repo || !args.path || !args['snippet-file']) {
      console.error('--resolve requires --repo, --path, and --snippet-file.');
      process.exit(2);
    }
    if (!isSourceRepo(args.repo)) {
      const result = {
        ok: false,
        reason: 'repo-not-allowed',
        message: `Repository "${args.repo}" is not in the allowed list.`,
      };
      console.log(JSON.stringify(result, null, 2));
      process.exit(2);
    }
    const snippet = fs.readFileSync(path.resolve(args['snippet-file']), 'utf8');
    const result = await resolveSourceQuote({
      repo: args.repo,
      path: args.path,
      snippet,
      commit: args.commit,
    });
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.ok ? 0 : 2);
  }

  const outPath = args.out
    ? path.resolve(args.out)
    : path.join(SITE_ROOT, 'artifacts', 'proof', 'source-quotes.json');

  const allSourceClaims = getAllClaims().filter(
    (c): c is SourceQuoteClaim => c.proof.kind === 'source-quote'
  );

  if (args['prune-cache']) {
    const pruned = pruneSourceRecords(allSourceClaims);
    console.log(
      `Pruned source cache: ${pruned.removedFiles} file(s), ${pruned.removedExcerpts} excerpt(s) removed.`
    );
  }

  let claims = allSourceClaims;
  if (args.page) {
    claims = claims.filter((c) => splitClaimId(c.id).pageId === args.page);
  }
  if (args.claim) {
    claims = claims.filter((c) => c.id === args.claim);
  }

  const pageStatuses = getPageProofStatusMap();
  const todayYmd = new Date().toISOString().slice(0, 10);

  const outcomes: Array<{ claim: SourceQuoteClaim; outcome: SourceVerifyOutcome }> = [];
  for (const claim of claims) {
    let outcome = await verifySourceQuote({ claim });
    if (
      args.record &&
      outcome.kind === 'result' &&
      (outcome.result.status === 'proven' || outcome.result.reason === 'not-recorded')
    ) {
      recordSourceExcerpt(claim, todayYmd);
      outcome = {
        kind: 'result',
        head: outcome.head,
        result: {
          ...outcome.result,
          status: 'proven',
          reason: null,
          message: null,
        },
      };
    }
    outcomes.push({ claim, outcome });
  }

  const { artifact, unavailable } = buildSourceQuotesArtifact({
    outcomes,
    pageStatuses,
    generatedAt: new Date().toISOString(),
  });

  writeProofArtifact(artifact, outPath);
  const unavailablePath = sidecarPath(outPath, 'unavailable');
  fs.mkdirSync(path.dirname(unavailablePath), { recursive: true });
  fs.writeFileSync(unavailablePath, JSON.stringify(unavailable, null, 2) + '\n', 'utf8');

  const results = Object.values(artifact.claims);
  const provenCount = results.filter((r) => r.status === 'proven').length;
  const failedResults = results.filter((r) => r.status === 'failed');
  const staleResults = results.filter((r) => r.status === 'stale');

  console.log(
    `✅ ${provenCount} proven · ❌ ${failedResults.length} failed · ⚠️ ${staleResults.length} stale · … ${unavailable.length} unavailable`
  );
  for (const r of [...failedResults, ...staleResults]) {
    console.log(`❌ ${r.claimId} [${r.reason ?? r.status}] ${r.message ?? ''}`);
  }

  process.exit(computeExitCode(artifact, args.strict === true));
}

const isMain =
  typeof __filename !== 'undefined'
    ? path.resolve(process.argv[1] ?? '') === path.resolve(__filename)
    : path.resolve(process.argv[1] ?? '') === path.resolve(fileURLToPath(import.meta.url));

if (isMain) {
  main().catch((err) => {
    console.error(err);
    process.exit(2);
  });
}
