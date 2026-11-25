import crypto from 'node:crypto';
import * as cheerio from 'cheerio';
import type { ClaimCheckResult, ProofArtifact } from '../artifact-schema';
import { UNANCHORED } from '../claim-schema';
import { classifySpecUrl, isRejection, type SpecFamily, type SpecMaturity } from './domains';
import {
  extractPageTextOriginal,
  extractSectionFromCheerio,
  extractSpecPageMeta,
  findQuote,
  type BlockKind,
} from './extract-section';
import { fetchSpecPage, type FetchSpecOptions } from './fetch-spec';
import { normalizeWithMap, originalSlice } from './normalize';
import {
  findQuoteRecord,
  quoteKey,
  readSpecRecord,
  writeSpecRecord,
  type SpecQuoteClaim,
  type SpecRecordFile,
} from './record';
import { buildSpecQuoteHref, buildTextFragment } from './text-fragment';

export interface ObservedQuote {
  canonicalUrl: string;
  family: SpecFamily;
  maturity: SpecMaturity;
  anchor: string;
  blockKind: BlockKind;
  sectionTitle: string | null;
  sectionSha256: string;
  quoteOriginal: string;
  fragment: string;
  fragmentUnique: boolean;
  specTitle: string | null;
  statusText: string | null;
  href: string;
}

export type SpecVerifyOutcome =
  | { kind: 'result'; result: ClaimCheckResult; observed: ObservedQuote | null }
  | { kind: 'unavailable'; error: string };

interface ParsedPageCacheEntry {
  html: string;
  $: cheerio.CheerioAPI;
  pageTextOriginal: string;
  specTitle: string | null;
  statusText: string | null;
}

const parsedPageCache = new Map<string, ParsedPageCacheEntry>();

function getParsedPage(canonicalUrl: string, html: string, family: SpecFamily): ParsedPageCacheEntry {
  const existing = parsedPageCache.get(canonicalUrl);
  if (existing && existing.html === html) return existing;
  const $ = cheerio.load(html);
  const pageTextOriginal = extractPageTextOriginal($, family);
  const { specTitle, statusText } = extractSpecPageMeta($, html, family);
  const entry: ParsedPageCacheEntry = { html, $, pageTextOriginal, specTitle, statusText };
  parsedPageCache.set(canonicalUrl, entry);
  return entry;
}

export function __resetParsedSpecCache(): void {
  parsedPageCache.clear();
}

export async function verifySpecQuote(input: {
  claim: SpecQuoteClaim;
  maxAgeHours: number;
  fetchOptions?: FetchSpecOptions;
  recordDir?: string;
  now?: () => Date;
}): Promise<SpecVerifyOutcome> {
  const { claim, maxAgeHours, fetchOptions, recordDir } = input;
  const nowFn = input.now ?? (() => new Date());
  const checkedAt = nowFn().toISOString();

  // 1. Domain allow-list
  const source = classifySpecUrl(claim.proof.url);
  if (isRejection(source)) {
    return {
      kind: 'result',
      result: {
        claimId: claim.id,
        status: 'failed',
        reason: source.reason,
        message: source.message,
        details: { url: claim.proof.url },
        checkedAt,
      },
      observed: null,
    };
  }

  // 2. Unanchored sentinel
  if (claim.proof.anchor === UNANCHORED) {
    return {
      kind: 'result',
      result: {
        claimId: claim.id,
        status: 'failed',
        reason: 'unanchored',
        message: `Claim has no spec anchor. Run: npm run proof:verify-specs -- --suggest-anchors --claim ${claim.id}`,
        details: { url: source.canonicalUrl },
        checkedAt,
      },
      observed: null,
    };
  }

  // 3. Check committed record
  const existingRecord = findQuoteRecord(claim, recordDir);
  const recorded = existingRecord !== null;

  // 4. Fetch spec page (through local HTTP cache)
  const fetched = await fetchSpecPage(source.canonicalUrl, {
    ...fetchOptions,
    maxAgeHours,
    now: fetchOptions?.now ?? (() => nowFn().getTime()),
  });
  if ('error' in fetched) {
    if (fetched.error === 'fetch-error') {
      if (fetched.status === 404 || fetched.status === 410) {
        return {
          kind: 'result',
          result: {
            claimId: claim.id,
            status: recorded ? 'stale' : 'failed',
            reason: 'fetch-error',
            message: fetched.message,
            details: { url: source.canonicalUrl, httpStatus: fetched.status },
            checkedAt,
          },
          observed: null,
        };
      }
      return { kind: 'unavailable', error: fetched.message };
    }
    return {
      kind: 'result',
      result: {
        claimId: claim.id,
        status: 'failed',
        reason: fetched.error,
        message: fetched.message,
        details: { url: source.canonicalUrl },
        checkedAt,
      },
      observed: null,
    };
  }

  // 5. Extract section
  const parsed = getParsedPage(source.canonicalUrl, fetched.html, source.family);
  const section = extractSectionFromCheerio(parsed.$, claim.proof.anchor, { family: source.family });
  if ('error' in section) {
    return {
      kind: 'result',
      result: {
        claimId: claim.id,
        status: recorded ? 'stale' : 'failed',
        reason: 'anchor-not-found',
        message: section.message,
        details: { url: source.canonicalUrl, anchor: claim.proof.anchor },
        checkedAt,
      },
      observed: null,
    };
  }

  // 6. Find quote verbatim in normative section text
  const match = findQuote(section, claim.proof.quote);
  if (!match.found) {
    const messages: Record<typeof match.reason, string> = {
      'non-normative-section': `Section #${claim.proof.anchor} declares itself non-normative.`,
      'quote-in-non-normative-block': `Quote only appears inside a non-normative note, example, or test block in #${claim.proof.anchor}.`,
      'quote-not-found': `Quote not found verbatim in normative text of #${claim.proof.anchor}.`,
    };
    return {
      kind: 'result',
      result: {
        claimId: claim.id,
        status: recorded ? 'stale' : 'failed',
        reason: match.reason,
        message: messages[match.reason],
        details: {
          url: source.canonicalUrl,
          anchor: claim.proof.anchor,
          sectionTitle: section.sectionTitle,
        },
        checkedAt,
      },
      observed: null,
    };
  }

  // 7. Quote found: compute ObservedQuote
  const norm = normalizeWithMap(section.normativeRaw);
  const quoteOriginal = originalSlice(norm, match.start, match.end);
  const precedingOriginal = originalSlice(norm, Math.max(0, match.start - 200), match.start);
  const { fragment, unique: fragmentUnique } = buildTextFragment(
    quoteOriginal,
    precedingOriginal,
    parsed.pageTextOriginal
  );
  const sectionSha256 = crypto.createHash('sha256').update(section.normativeText).digest('hex');
  const href = buildSpecQuoteHref(source.canonicalUrl, claim.proof.anchor, fragment);

  const observed: ObservedQuote = {
    canonicalUrl: source.canonicalUrl,
    family: source.family,
    maturity: source.maturity,
    anchor: claim.proof.anchor,
    blockKind: section.blockKind,
    sectionTitle: section.sectionTitle,
    sectionSha256,
    quoteOriginal,
    fragment,
    fragmentUnique,
    specTitle: parsed.specTitle,
    statusText: parsed.statusText,
    href,
  };

  if (existingRecord) {
    return {
      kind: 'result',
      result: {
        claimId: claim.id,
        status: 'proven',
        reason: null,
        message: null,
        details: {
          family: source.family,
          maturity: source.maturity,
          specTitle: parsed.specTitle,
          sectionTitle: section.sectionTitle,
          sectionChanged: observed.sectionSha256 !== existingRecord.section.sectionSha256,
          href,
        },
        checkedAt,
      },
      observed,
    };
  }

  return {
    kind: 'result',
    result: {
      claimId: claim.id,
      status: 'failed',
      reason: 'not-recorded',
      message: `Quote found. Record it: npm run proof:verify-specs -- --record --claim ${claim.id}`,
      details: {
        family: source.family,
        maturity: source.maturity,
        specTitle: parsed.specTitle,
        sectionTitle: section.sectionTitle,
        href,
      },
      checkedAt,
    },
    observed,
  };
}

/** Writes or updates the committed minimal record for a verified quote. */
export function recordObservedQuote(
  claim: SpecQuoteClaim,
  observed: ObservedQuote,
  recordedOn: string,
  recordDir?: string
): void {
  const existing = readSpecRecord(observed.canonicalUrl, recordDir);
  const file: SpecRecordFile = existing ?? {
    schemaVersion: 2,
    url: observed.canonicalUrl,
    family: observed.family,
    maturity: observed.maturity,
    specTitle: observed.specTitle,
    statusText: observed.statusText,
    sections: {},
  };

  file.family = observed.family;
  file.maturity = observed.maturity;
  file.specTitle = observed.specTitle;
  file.statusText = observed.statusText;

  const prevSection = file.sections[observed.anchor];
  file.sections[observed.anchor] = {
    blockKind: observed.blockKind,
    sectionTitle: observed.sectionTitle,
    sectionSha256: observed.sectionSha256,
    quotes: {
      ...(prevSection?.quotes ?? {}),
      [quoteKey(claim.proof.quote)]: {
        quoteOriginal: observed.quoteOriginal,
        fragment: observed.fragment,
        fragmentUnique: observed.fragmentUnique,
        recordedOn,
      },
    },
  };

  writeSpecRecord(file, recordDir);
}

/**
 * Exit code for proof:verify-specs:
 * - 0 whenever the artifact is written and --strict is not set.
 * - 1 with --strict if any enforced ("proven") page has a failed or stale claim.
 */
export function computeExitCode(artifact: ProofArtifact, strict: boolean): 0 | 1 {
  if (!strict) return 0;
  for (const page of Object.values(artifact.pages)) {
    if (page.enforced && page.status === 'fail') return 1;
  }
  return 0;
}
