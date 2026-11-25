import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCliArgs } from '../../src/lib/cli-args';
import { getAllAutopsies, getAllConcepts, type LoadedConcept } from '../../src/lib/content-loader';
import { CONTENT_DIR, SITE_ROOT } from '../../src/lib/paths';
import { writeProofArtifact } from '../../src/lib/proof/artifact-io';
import type {
  ClaimCheckResult,
  PageCheckResult,
  PageViolation,
  ProofArtifact,
} from '../../src/lib/proof/artifact-schema';
import {
  ClaimsFileSchema,
  splitClaimId,
  type Claim,
  type ClaimsFile,
} from '../../src/lib/proof/claim-schema';
import {
  CLAIMS_DIR,
  CLAIMS_FILE_SUFFIX,
  getAllClaimsFiles,
  resetClaimsCache,
} from '../../src/lib/proof/claims-loader';
import { getDataVersions, getWebFeatures } from '../../src/lib/proof/support/data';
import { renderSupportStatement } from '../../src/lib/proof/support/statements';
import { verifySupportClaim, type SupportClaim } from '../../src/lib/proof/support/verify';

export interface WebFeatureSuggestion {
  conceptId: string;
  candidates: Array<{ id: string; name: string; score: number }>;
}

const WORD_RE = /[a-z0-9]{4,}/g;

function extractSearchWords(text: string): Set<string> {
  const words = new Set<string>();
  for (const m of text.toLowerCase().matchAll(WORD_RE)) {
    words.add(m[0]);
  }
  return words;
}

export function suggestWebFeaturesForConcepts(concepts: LoadedConcept[]): WebFeatureSuggestion[] {
  const features = Object.entries(getWebFeatures())
    .filter(([, entry]) => entry.kind === 'feature')
    .map(([id, entry]) => ({
      id,
      name: entry.kind === 'feature' ? entry.name : id,
      haystack: `${id} ${entry.kind === 'feature' ? entry.name : ''}`.toLowerCase(),
    }));

  const suggestions: WebFeatureSuggestion[] = [];

  for (const concept of concepts) {
    if (concept.frontmatter.web_feature_id) continue;
    const words = extractSearchWords(
      [concept.frontmatter.title, ...(concept.frontmatter.keywords ?? [])].join(' ')
    );
    if (words.size === 0) continue;

    const scored: Array<{ id: string; name: string; score: number }> = [];
    for (const f of features) {
      let score = 0;
      for (const word of words) {
        if (f.haystack.includes(word)) score += 1;
      }
      if (score > 0) {
        scored.push({ id: f.id, name: f.name, score });
      }
    }

    scored.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
    if (scored.length > 0) {
      suggestions.push({
        conceptId: concept.frontmatter.id,
        candidates: scored.slice(0, 5),
      });
    }
  }

  return suggestions;
}

export function checkConceptSupportRules(
  concept: LoadedConcept,
  claimsById: Map<string, Claim>
): PageViolation[] {
  const violations: PageViolation[] = [];
  const pageId = concept.frontmatter.id;
  const pageClaims = concept.claims?.claims ?? [];

  if (concept.frontmatter.web_feature_id) {
    const hasMatchingSupportClaim = pageClaims.some(
      (c) =>
        c.type === 'support' &&
        c.proof.kind === 'bcd' &&
        c.proof.webFeatureId === concept.frontmatter.web_feature_id
    );
    if (!hasMatchingSupportClaim) {
      violations.push({
        rule: 'missing-support-claim',
        line: null,
        column: null,
        message: `Concept "${pageId}" declares web_feature_id "${concept.frontmatter.web_feature_id}" but has no support claim with that webFeatureId.`,
        excerpt: null,
      });
    }
  }

  if (concept.frontmatter.pattern_status) {
    const patternClaimId = `${pageId}/pattern-status`;
    const patternClaim = pageClaims.find((c) => c.id === patternClaimId);
    const supersededSet = new Set(concept.frontmatter.superseded_by ?? []);

    let validDerived = false;
    if (patternClaim && patternClaim.type === 'derived' && patternClaim.proof.kind === 'derived') {
      const fromClaims = patternClaim.proof.from
        .map((id) => claimsById.get(id))
        .filter((c): c is Claim => Boolean(c));

      const hasReplacementSupport = fromClaims.some(
        (c) => c.type === 'support' && supersededSet.has(splitClaimId(c.id).pageId)
      );
      const hasObservable = fromClaims.some((c) => c.type === 'observable');
      validDerived = hasReplacementSupport && hasObservable;
    }

    if (!validDerived) {
      violations.push({
        rule: 'pattern-status-unproven',
        line: null,
        column: null,
        message: `Concept "${pageId}" sets pattern_status "${concept.frontmatter.pattern_status}" without a valid derived claim "${patternClaimId}" citing a support claim from superseded_by and an observable claim.`,
        excerpt: null,
      });
    }
  }

  return violations;
}

export function rewriteSupportStatementsOnDisk(
  claimsFiles: Map<string, ClaimsFile>,
  filter: { page?: string; claim?: string; claimsDir?: string } = {}
): string[] {
  const targetDir = filter.claimsDir ?? CLAIMS_DIR;
  const updatedFiles: string[] = [];

  for (const [pageId, file] of claimsFiles.entries()) {
    if (filter.page && pageId !== filter.page) continue;

    let changed = false;
    const nextClaims = file.claims.map((claim) => {
      if (claim.type !== 'support' || claim.proof.kind !== 'bcd') return claim;
      if (filter.claim && claim.id !== filter.claim) return claim;

      const rendered = renderSupportStatement(claim.proof);
      if (!rendered.ok || rendered.statement === claim.statement) return claim;

      changed = true;
      return { ...claim, statement: rendered.statement };
    });

    if (!changed) continue;

    const validated = ClaimsFileSchema.parse({ ...file, claims: nextClaims });
    const filePath = path.join(targetDir, `${pageId}${CLAIMS_FILE_SUFFIX}`);
    fs.writeFileSync(filePath, `${JSON.stringify(validated, null, 2)}\n`, 'utf-8');
    updatedFiles.push(filePath);
  }

  if (updatedFiles.length > 0 && !filter.claimsDir) {
    resetClaimsCache();
  }

  return updatedFiles;
}

export function computeSupportExitCode(artifact: ProofArtifact, strict: boolean): 0 | 1 {
  if (!strict) return 0;

  for (const page of Object.values(artifact.pages)) {
    if (page.enforced && page.status === 'fail') return 1;
  }

  const enforcedPages = new Set(
    Object.values(artifact.pages)
      .filter((p) => p.enforced)
      .map((p) => p.pageId)
  );
  for (const result of Object.values(artifact.claims)) {
    const { pageId } = splitClaimId(result.claimId);
    if (enforcedPages.has(pageId) && result.status !== 'proven') return 1;
  }

  return 0;
}

export interface RunSupportCheckOptions {
  page?: string;
  claim?: string;
  outPath?: string;
  write?: boolean;
  suggestWebFeatures?: boolean;
  strict?: boolean;
  now?: Date;
}

export function runSupportCheck(options: RunSupportCheckOptions = {}): {
  artifact: ProofArtifact;
  exitCode: 0 | 1;
  updatedFiles: string[];
  suggestionsPath: string | null;
} {
  const now = options.now ?? new Date();
  resetClaimsCache();

  let updatedFiles: string[] = [];
  if (options.write) {
    updatedFiles = rewriteSupportStatementsOnDisk(getAllClaimsFiles(), {
      page: options.page,
      claim: options.claim,
    });
  }

  const claimsFiles = getAllClaimsFiles();
  const allClaimsById = new Map<string, Claim>();
  for (const file of claimsFiles.values()) {
    for (const claim of file.claims) {
      allClaimsById.set(claim.id, claim);
    }
  }

  const concepts = getAllConcepts();
  const autopsies = getAllAutopsies();

  const claimResults: Record<string, ClaimCheckResult> = {};
  const supportResultsById = new Map<string, ClaimCheckResult>();

  for (const claim of allClaimsById.values()) {
    if (claim.type !== 'support' || claim.proof.kind !== 'bcd') continue;
    const { pageId } = splitClaimId(claim.id);
    if (options.page && pageId !== options.page) continue;
    if (options.claim && claim.id !== options.claim) continue;

    const result = verifySupportClaim(claim as SupportClaim, now);
    claimResults[claim.id] = result;
    supportResultsById.set(claim.id, result);
  }

  const pages: Record<string, PageCheckResult> = {};

  for (const concept of concepts) {
    const pageId = concept.frontmatter.id;
    if (options.page && pageId !== options.page) continue;
    if (options.claim && splitClaimId(options.claim).pageId !== pageId) continue;

    const violations = checkConceptSupportRules(concept, allClaimsById);
    const pageClaimFailures = Object.values(claimResults).some(
      (r) => splitClaimId(r.claimId).pageId === pageId && r.status !== 'proven'
    );
    const enforced = concept.frontmatter.proof_status === 'proven';
    pages[pageId] = {
      pageId,
      status: violations.length > 0 || pageClaimFailures ? 'fail' : 'pass',
      enforced,
      violations,
      stats: {},
      foreignClaimIds: [],
    };
  }

  for (const autopsy of autopsies) {
    const pageId = autopsy.frontmatter.id;
    if (options.page && pageId !== options.page) continue;
    if (options.claim && splitClaimId(options.claim).pageId !== pageId) continue;

    const pageClaimFailures = Object.values(claimResults).some(
      (r) => splitClaimId(r.claimId).pageId === pageId && r.status !== 'proven'
    );
    const enforced = autopsy.frontmatter.proof_status === 'proven';
    pages[pageId] = {
      pageId,
      status: pageClaimFailures ? 'fail' : 'pass',
      enforced,
      violations: [],
      stats: {},
      foreignClaimIds: [],
    };
  }

  const versions = getDataVersions();
  const artifact: ProofArtifact = {
    schemaVersion: 1,
    kind: 'support',
    generatedAt: now.toISOString(),
    mode: 'offline',
    tooling: {
      '@mdn/browser-compat-data': versions.bcd,
      'web-features': versions.webFeatures,
    },
    claims: claimResults,
    pages,
  };

  const outPath = options.outPath ?? path.join(SITE_ROOT, 'artifacts', 'proof', 'support.json');
  writeProofArtifact(artifact, outPath);

  let suggestionsPath: string | null = null;
  if (options.suggestWebFeatures) {
    const suggestions = suggestWebFeaturesForConcepts(concepts);
    suggestionsPath = path.join(SITE_ROOT, 'artifacts', 'proof', 'web-feature-suggestions.json');
    fs.mkdirSync(path.dirname(suggestionsPath), { recursive: true });
    fs.writeFileSync(suggestionsPath, `${JSON.stringify(suggestions, null, 2)}\n`, 'utf-8');
  }

  const exitCode = computeSupportExitCode(artifact, Boolean(options.strict));
  return { artifact, exitCode, updatedFiles, suggestionsPath };
}

async function main(): Promise<void> {
  const args = parseCliArgs(process.argv.slice(2), {
    page: 'string',
    claim: 'string',
    out: 'string',
    write: 'boolean',
    'write-snapshot': 'boolean',
    'suggest-web-features': 'boolean',
    strict: 'boolean',
  });

  if (args.claim && !args.claim.includes('/')) {
    console.error(`Invalid --claim "${args.claim}": expected "<page-id>/<claim-slug>"`);
    process.exit(2);
  }

  const { artifact, exitCode, updatedFiles, suggestionsPath } = runSupportCheck({
    page: args.page,
    claim: args.claim,
    outPath: args.out,
    write: Boolean(args.write),
    suggestWebFeatures: Boolean(args['suggest-web-features']),
    strict: Boolean(args.strict),
  });

  const claimValues = Object.values(artifact.claims);
  const provenCount = claimValues.filter((c) => c.status === 'proven').length;
  const failedCount = claimValues.filter((c) => c.status === 'failed').length;
  const pageViolations = Object.values(artifact.pages).reduce(
    (sum, p) => sum + p.violations.length,
    0
  );

  if (updatedFiles.length > 0) {
    console.log(
      `Updated ${updatedFiles.length} claims file(s): ${updatedFiles
        .map((f) => path.relative(SITE_ROOT, f))
        .join(', ')}`
    );
  }
  if (suggestionsPath) {
    console.log(`Wrote web-feature suggestions to ${path.relative(SITE_ROOT, suggestionsPath)}`);
  }

  console.log(
    `Support check (${CONTENT_DIR}): ${provenCount} proven · ${failedCount} failed · ${pageViolations} page violation(s)`
  );
  for (const c of claimValues) {
    if (c.status !== 'proven') {
      console.log(`  FAIL ${c.claimId} [${c.reason ?? 'unknown'}] ${c.message ?? ''}`);
    }
  }

  process.exit(exitCode);
}

const currentFile = typeof __filename !== 'undefined' ? __filename : fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(currentFile)) {
  main().catch((err) => {
    console.error(err);
    process.exit(2);
  });
}
