import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as cheerio from 'cheerio';
import cheerioPkg from 'cheerio/package.json';
import { parseCliArgs } from '../../src/lib/cli-args';
import { CONTENT_DIR, SITE_ROOT } from '../../src/lib/paths';
import { writeProofArtifact } from '../../src/lib/proof/artifact-io';
import type { ClaimCheckResult, PageCheckResult, ProofArtifact } from '../../src/lib/proof/artifact-schema';
import {
  ClaimsFileSchema,
  UNANCHORED,
  splitClaimId,
  type PageProofStatus,
} from '../../src/lib/proof/claim-schema';
import { CLAIMS_FILE_SUFFIX, getAllClaims } from '../../src/lib/proof/claims-loader';
import { getPageProofStatusMap } from '../../src/lib/proof/page-registry';
import { classifySpecUrl, isRejection } from '../../src/lib/proof/spec/domains';
import { buildSpecDriftReport } from '../../src/lib/proof/spec/drift';
import {
  extractPageTextOriginal,
  findAnchorForQuote,
} from '../../src/lib/proof/spec/extract-section';
import { fetchSpecPage, type FetchSpecOptions } from '../../src/lib/proof/spec/fetch-spec';
import { normalizeSpecText } from '../../src/lib/proof/spec/normalize';
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

export interface AnchorSuggestion {
  claimId: string;
  suggestedAnchors: string[];
}

export interface LegacyReportCounts {
  verbatimAtAnchor: number;
  verbatimElsewhere: number;
  nonNormativeOnly: number;
  notFound: number;
  sourceRejected: number;
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

export async function suggestAnchorsForOutcomes(
  outcomes: Array<{ claim: SpecQuoteClaim; outcome: SpecVerifyOutcome }>,
  options: { maxAgeHours: number; fetchOptions?: FetchSpecOptions }
): Promise<AnchorSuggestion[]> {
  const suggestions: AnchorSuggestion[] = [];
  for (const { claim, outcome } of outcomes) {
    const needsSuggestion =
      claim.proof.anchor === UNANCHORED ||
      (outcome.kind === 'result' &&
        (outcome.result.reason === 'anchor-not-found' || outcome.result.reason === 'quote-not-found'));
    if (!needsSuggestion) continue;

    const source = classifySpecUrl(claim.proof.url);
    if (isRejection(source)) continue;

    const fetched = await fetchSpecPage(source.canonicalUrl, {
      ...options.fetchOptions,
      maxAgeHours: options.maxAgeHours,
    });
    if ('error' in fetched) continue;

    const anchors = findAnchorForQuote(fetched.html, claim.proof.quote, { family: source.family });
    if (anchors.length > 0) {
      suggestions.push({ claimId: claim.id, suggestedAnchors: anchors });
    }
  }
  return suggestions;
}

/**
 * Replaces ONLY the `anchor` field of suggested spec-quote claims in `content/claims/<pageId>.claims.json`.
 * Never modifies `quote` or claim ordering, and validates with ClaimsFileSchema before writing.
 */
export function applyAnchorSuggestions(
  suggestions: AnchorSuggestion[],
  claimsDir: string
): { updatedFiles: number; updatedClaims: number } {
  const byPage = new Map<string, Map<string, string>>();
  for (const s of suggestions) {
    if (s.suggestedAnchors.length === 0) continue;
    const { pageId } = splitClaimId(s.claimId);
    let pageMap = byPage.get(pageId);
    if (!pageMap) {
      pageMap = new Map();
      byPage.set(pageId, pageMap);
    }
    pageMap.set(s.claimId, s.suggestedAnchors[0]);
  }

  let updatedFiles = 0;
  let updatedClaims = 0;

  for (const [pageId, replacements] of byPage.entries()) {
    const filePath = path.join(claimsDir, `${pageId}${CLAIMS_FILE_SUFFIX}`);
    if (!fs.existsSync(filePath)) continue;
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    const parsed = ClaimsFileSchema.parse(raw);

    let fileChanged = false;
    const nextClaims = parsed.claims.map((c) => {
      const nextAnchor = replacements.get(c.id);
      if (nextAnchor && c.proof.kind === 'spec-quote' && c.proof.anchor !== nextAnchor) {
        fileChanged = true;
        updatedClaims++;
        return {
          ...c,
          proof: {
            ...c.proof,
            anchor: nextAnchor,
          },
        };
      }
      return c;
    });

    if (fileChanged) {
      const validated = ClaimsFileSchema.parse({ ...parsed, claims: nextClaims });
      fs.writeFileSync(filePath, JSON.stringify(validated, null, 2) + '\n', 'utf-8');
      updatedFiles++;
    }
  }

  return { updatedFiles, updatedClaims };
}

function formatShare(count: number, total: number): string {
  if (total === 0) return '0%';
  return `${Math.round((count / total) * 100)}%`;
}

function truncateQuote(q: string, maxLen = 60): string {
  const clean = q.replace(/\s+/g, ' ').trim();
  if (clean.length <= maxLen) return clean;
  return `${clean.slice(0, maxLen - 3)}...`;
}

export async function buildLegacyReportMarkdown(input: {
  outcomes: Array<{ claim: SpecQuoteClaim; outcome: SpecVerifyOutcome }>;
  dateYmd: string;
  maxAgeHours: number;
  fetchOptions?: FetchSpecOptions;
}): Promise<{ markdown: string; counts: LegacyReportCounts }> {
  const counts: LegacyReportCounts = {
    verbatimAtAnchor: 0,
    verbatimElsewhere: 0,
    nonNormativeOnly: 0,
    notFound: 0,
    sourceRejected: 0,
  };
  const notFoundEntries: Array<{ claimId: string; quote: string; url: string }> = [];

  for (const { claim, outcome } of input.outcomes) {
    if (outcome.kind === 'unavailable') {
      counts.sourceRejected++;
      continue;
    }

    const { status, reason } = outcome.result;
    if (status === 'proven' || reason === 'not-recorded') {
      counts.verbatimAtAnchor++;
      continue;
    }

    if (reason === 'quote-in-non-normative-block' || reason === 'non-normative-section') {
      counts.nonNormativeOnly++;
      continue;
    }

    if (
      reason === 'domain-not-allowed' ||
      reason === 'single-page-spec' ||
      reason === 'fetch-error' ||
      reason === 'unrendered-respec'
    ) {
      counts.sourceRejected++;
      continue;
    }

    // unanchored, anchor-not-found, or quote-not-found: inspect the full page
    const source = classifySpecUrl(claim.proof.url);
    if (isRejection(source)) {
      counts.sourceRejected++;
      continue;
    }

    const fetched = await fetchSpecPage(source.canonicalUrl, {
      ...input.fetchOptions,
      maxAgeHours: input.maxAgeHours,
    });
    if ('error' in fetched) {
      counts.sourceRejected++;
      continue;
    }

    const suggested = findAnchorForQuote(fetched.html, claim.proof.quote, { family: source.family });
    if (suggested.length > 0) {
      counts.verbatimElsewhere++;
      continue;
    }

    const $ = cheerio.load(fetched.html);
    const fullPageNormalized = normalizeSpecText(extractPageTextOriginal($, source.family));
    if (fullPageNormalized.includes(normalizeSpecText(claim.proof.quote))) {
      counts.nonNormativeOnly++;
      continue;
    }

    counts.notFound++;
    notFoundEntries.push({
      claimId: claim.id,
      quote: claim.proof.quote,
      url: claim.proof.url,
    });
  }

  const total = input.outcomes.length;
  const lines = [
    `# Legacy spec quotes report (${input.dateYmd})`,
    '',
    '| Result | Count | Share |',
    '| :--- | ---: | ---: |',
    `| Found verbatim at anchor | ${counts.verbatimAtAnchor} | ${formatShare(counts.verbatimAtAnchor, total)} |`,
    `| Found verbatim elsewhere in the page (anchor suggested) | ${counts.verbatimElsewhere} | ${formatShare(counts.verbatimElsewhere, total)} |`,
    `| Found only in a note or example | ${counts.nonNormativeOnly} | ${formatShare(counts.nonNormativeOnly, total)} |`,
    `| Not found (paraphrase or invented) | ${counts.notFound} | ${formatShare(counts.notFound, total)} |`,
    `| Source rejected (domain, single page, fetch error) | ${counts.sourceRejected} | ${formatShare(counts.sourceRejected, total)} |`,
    '',
    '## Not found',
    ...(notFoundEntries.length > 0
      ? notFoundEntries.map((e) => `- \`${e.claimId}\` : "${truncateQuote(e.quote)}" (${e.url})`)
      : ['- (none)']),
    '',
  ];

  return { markdown: lines.join('\n'), counts };
}

async function main(): Promise<void> {
  const args = parseCliArgs(process.argv.slice(2), {
    record: 'boolean',
    'max-age-hours': 'string',
    page: 'string',
    claim: 'string',
    'suggest-anchors': 'boolean',
    write: 'boolean',
    'legacy-report': 'boolean',
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
  if (!args['legacy-report']) {
    if (args.page) {
      claims = claims.filter((c) => splitClaimId(c.id).pageId === args.page);
    }
    if (args.claim) {
      claims = claims.filter((c) => c.id === args.claim);
    }
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

  const drift = buildSpecDriftReport(outcomes);
  const driftPath = sidecarPath(outPath, 'drift');
  fs.writeFileSync(driftPath, JSON.stringify(drift, null, 2) + '\n', 'utf-8');

  if (args['suggest-anchors']) {
    const suggestions = await suggestAnchorsForOutcomes(outcomes, { maxAgeHours });
    const suggestionsPath = path.join(path.dirname(outPath), 'spec-anchor-suggestions.json');
    fs.writeFileSync(suggestionsPath, JSON.stringify(suggestions, null, 2) + '\n', 'utf-8');
    console.log(`Found anchor suggestions for ${suggestions.length} claim(s) -> ${suggestionsPath}`);
    if (args.write) {
      const claimsDir = path.join(CONTENT_DIR, 'claims');
      const applied = applyAnchorSuggestions(suggestions, claimsDir);
      console.log(
        `Updated ${applied.updatedClaims} claim(s) across ${applied.updatedFiles} claims file(s).`
      );
    }
  }

  if (args['legacy-report']) {
    const { markdown } = await buildLegacyReportMarkdown({
      outcomes,
      dateYmd: todayYmd,
      maxAgeHours,
    });
    const reportPath = path.join(path.dirname(outPath), 'legacy-spec-quotes-report.md');
    fs.writeFileSync(reportPath, markdown, 'utf-8');
    console.log(`Wrote legacy report -> ${reportPath}`);
  }

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
