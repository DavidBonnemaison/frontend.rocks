import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cheerioPkg from 'cheerio/package.json';
import { parseCliArgs } from '../../src/lib/cli-args';
import { SITE_ROOT } from '../../src/lib/paths';
import { writeProofArtifact } from '../../src/lib/proof/artifact-io';
import type { ClaimCheckResult, PageCheckResult, ProofArtifact } from '../../src/lib/proof/artifact-schema';
import { splitClaimId, type PageProofStatus } from '../../src/lib/proof/claim-schema';
import { getAllClaims } from '../../src/lib/proof/claims-loader';
import { getPageProofStatusMap } from '../../src/lib/proof/page-registry';
import { pruneSpecRecords, type SpecQuoteClaim } from '../../src/lib/proof/spec/record';
import {
  computeExitCode,
  recordObservedQuote,
  verifySpecQuote,
  type SpecVerifyOutcome,
} from '../../src/lib/proof/spec/verify';

export interface UnavailableSpecEntry {
  claimId: string;
  url: string;
  error: string;
}

function sidecarPath(outPath: string, suffix: string): string {
  return outPath.endsWith('.json')
    ? `${outPath.slice(0, -'.json'.length)}.${suffix}.json`
    : `${outPath}.${suffix}.json`;
}

export function buildSpecQuotesArtifact(input: {
  outcomes: Array<{ claim: SpecQuoteClaim; outcome: SpecVerifyOutcome }>;
  pageStatuses: Map<string, PageProofStatus>;
  generatedAt: string;
  cheerioVersion?: string;
}): { artifact: ProofArtifact; unavailable: UnavailableSpecEntry[] } {
  const claims: Record<string, ClaimCheckResult> = {};
  const unavailable: UnavailableSpecEntry[] = [];
  const pageGroups = new Map<string, ClaimCheckResult[]>();

  for (const { claim, outcome } of input.outcomes) {
    const { pageId } = splitClaimId(claim.id);
    if (!pageGroups.has(pageId)) pageGroups.set(pageId, []);
    if (outcome.kind === 'unavailable') {
      unavailable.push({ claimId: claim.id, url: claim.proof.url, error: outcome.error });
      continue;
    }
    claims[claim.id] = outcome.result;
    pageGroups.get(pageId)!.push(outcome.result);
  }

  const pages: Record<string, PageCheckResult> = {};
  for (const [pageId, results] of [...pageGroups.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const failed = results.filter((r) => r.status === 'failed' || r.status === 'stale');
    const proven = results.filter((r) => r.status === 'proven');
    const enforced = input.pageStatuses.get(pageId) === 'proven';
    pages[pageId] = {
      pageId,
      status: failed.length > 0 ? 'fail' : 'pass',
      enforced,
      violations: failed.map((r) => ({
        rule: r.reason ?? 'spec-quote-failed',
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
    kind: 'spec-quotes',
    generatedAt: input.generatedAt,
    mode: 'online',
    tooling: {
      cheerio: input.cheerioVersion ?? cheerioPkg.version,
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
    'max-age-hours': 'string',
    page: 'string',
    claim: 'string',
    'prune-cache': 'boolean',
    strict: 'boolean',
    out: 'string',
  });

  const maxAgeHours = args['max-age-hours'] !== undefined ? Number(args['max-age-hours']) : 24;
  if (!Number.isFinite(maxAgeHours) || maxAgeHours < 0) {
    console.error(`Invalid --max-age-hours value: ${args['max-age-hours']}`);
    process.exit(2);
  }

  const outPath = args.out
    ? path.resolve(args.out)
    : path.join(SITE_ROOT, 'artifacts', 'proof', 'spec-quotes.json');

  const allSpecClaims = getAllClaims().filter(
    (c): c is SpecQuoteClaim => c.proof.kind === 'spec-quote'
  );

  if (args['prune-cache']) {
    const pruned = pruneSpecRecords(allSpecClaims);
    console.log(
      `Pruned spec cache: ${pruned.removedFiles} file(s), ${pruned.removedSections} section(s), ${pruned.removedQuotes} quote(s) removed.`
    );
  }

  let claims = allSpecClaims;
  if (args.page) {
    claims = claims.filter((c) => splitClaimId(c.id).pageId === args.page);
  }
  if (args.claim) {
    claims = claims.filter((c) => c.id === args.claim);
  }

  const pageStatuses = getPageProofStatusMap();
  const now = new Date();
  const todayYmd = now.toISOString().slice(0, 10);

  const outcomes: Array<{ claim: SpecQuoteClaim; outcome: SpecVerifyOutcome }> = [];
  for (const claim of claims) {
    let outcome = await verifySpecQuote({ claim, maxAgeHours });
    if (
      args.record &&
      outcome.kind === 'result' &&
      outcome.observed !== null &&
      (outcome.result.status === 'proven' || outcome.result.reason === 'not-recorded')
    ) {
      recordObservedQuote(claim, outcome.observed, todayYmd);
      outcome = {
        kind: 'result',
        observed: outcome.observed,
        result: {
          ...outcome.result,
          status: 'proven',
          reason: null,
          message: null,
          details: {
            ...outcome.result.details,
            sectionChanged: false,
          },
        },
      };
    }
    outcomes.push({ claim, outcome });
  }

  const { artifact, unavailable } = buildSpecQuotesArtifact({
    outcomes,
    pageStatuses,
    generatedAt: new Date().toISOString(),
  });

  writeProofArtifact(artifact, outPath);
  const unavailablePath = sidecarPath(outPath, 'unavailable');
  fs.mkdirSync(path.dirname(unavailablePath), { recursive: true });
  fs.writeFileSync(unavailablePath, JSON.stringify(unavailable, null, 2) + '\n', 'utf-8');

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
