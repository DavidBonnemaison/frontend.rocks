import type { ClaimCheckResult, ProofArtifact } from '../artifact-schema';
import type { PoliteFetchOptions } from '../spec/http';
import { checkExcerptSize, excerptAt, findExcerpt, normalizeExcerpt } from './excerpt';
import { fetchRawFile, getHeadCommit, type ExecFileRunner } from './github';
import { findExcerptRecord, type SourceQuoteClaim } from './record';
import { REPOS, checkPathAllowed, isSourceRepo } from './repos';

export type SourceVerifyOutcome =
  | {
      kind: 'result';
      result: ClaimCheckResult;
      head: { headCommit: string; linesAtHead: [number, number] | null } | null;
    }
  | { kind: 'unavailable'; error: string };

export function buildSourceQuoteHref(
  repo: string,
  commit: string,
  filePath: string,
  lines: readonly [number, number]
): string {
  return `https://github.com/${repo}/blob/${commit}/${filePath}#L${lines[0]}-L${lines[1]}`;
}

export async function verifySourceQuote(input: {
  claim: SourceQuoteClaim;
  fetchOptions?: PoliteFetchOptions;
  run?: ExecFileRunner;
  recordDir?: string;
  now?: () => Date;
}): Promise<SourceVerifyOutcome> {
  const { claim, fetchOptions, run, recordDir } = input;
  const nowFn = input.now ?? (() => new Date());
  const checkedAt = nowFn().toISOString();
  const { repo, commit, path: filePath, lines, quote } = claim.proof;
  const [start, end] = lines;
  const href = buildSourceQuoteHref(repo, commit, filePath, lines);

  // 1. Repository, path, and excerpt size checks
  if (!isSourceRepo(repo)) {
    return {
      kind: 'result',
      result: {
        claimId: claim.id,
        status: 'failed',
        reason: 'repo-not-allowed',
        message: `Repository "${String(repo)}" is not in the allowed list.`,
        details: { repo, commit, path: filePath, lines, href },
        checkedAt,
      },
      head: null,
    };
  }

  const info = REPOS[repo];
  const baseDetails = {
    repo,
    commit,
    path: filePath,
    lines,
    label: info.label,
    license: info.license,
    href,
  };

  const pathCheck = checkPathAllowed(repo, filePath);
  if (!pathCheck.ok) {
    return {
      kind: 'result',
      result: {
        claimId: claim.id,
        status: 'failed',
        reason: pathCheck.reason,
        message: pathCheck.message,
        details: baseDetails,
        checkedAt,
      },
      head: null,
    };
  }

  const sizeCheck = checkExcerptSize(quote);
  if (!sizeCheck.ok) {
    return {
      kind: 'result',
      result: {
        claimId: claim.id,
        status: 'failed',
        reason: sizeCheck.reason,
        message: sizeCheck.message,
        details: baseDetails,
        checkedAt,
      },
      head: null,
    };
  }

  // 2. Excerpt normalization check
  let normalized: string;
  try {
    normalized = normalizeExcerpt(quote);
  } catch {
    return {
      kind: 'result',
      result: {
        claimId: claim.id,
        status: 'failed',
        reason: 'excerpt-not-normalized',
        message: 'Quote is empty or not normalized; re-run --resolve.',
        details: baseDetails,
        checkedAt,
      },
      head: null,
    };
  }
  if (normalized !== quote) {
    return {
      kind: 'result',
      result: {
        claimId: claim.id,
        status: 'failed',
        reason: 'excerpt-not-normalized',
        message: 'Quote is not in normalized form; re-run --resolve.',
        details: baseDetails,
        checkedAt,
      },
      head: null,
    };
  }

  // 3. Fetch file at pinned commit
  const pinnedRaw = await fetchRawFile(repo, commit, filePath, fetchOptions);
  if ('unavailable' in pinnedRaw) {
    return { kind: 'unavailable', error: pinnedRaw.error };
  }
  if (!pinnedRaw.ok) {
    return {
      kind: 'result',
      result: {
        claimId: claim.id,
        status: 'failed',
        reason: 'fetch-error',
        message: pinnedRaw.tooLarge
          ? pinnedRaw.error
          : `File not found at pinned commit ${repo}@${commit}:${filePath}.`,
        details: baseDetails,
        checkedAt,
      },
      head: null,
    };
  }

  // 4. Verify exact lines at pinned commit
  const actualAtPinned = excerptAt(pinnedRaw.text, start, end);
  if (actualAtPinned !== quote) {
    return {
      kind: 'result',
      result: {
        claimId: claim.id,
        status: 'failed',
        reason: 'excerpt-mismatch',
        message: `Lines ${start}-${end} of ${filePath} at ${commit.slice(0, 7)} do not match the claim quote.`,
        details: baseDetails,
        checkedAt,
      },
      head: null,
    };
  }

  // 5. Resolve HEAD of default branch
  const headCommit = await getHeadCommit(repo, info.defaultBranch, run);
  if (typeof headCommit !== 'string') {
    return { kind: 'unavailable', error: headCommit.error };
  }

  // 6. Fetch file at HEAD and locate quote
  const headRaw = await fetchRawFile(repo, headCommit, filePath, fetchOptions);
  if ('unavailable' in headRaw) {
    return { kind: 'unavailable', error: headRaw.error };
  }

  let gone: boolean;
  let linesAtHead: [number, number] | null = null;
  if (!headRaw.ok) {
    gone = true;
  } else {
    const matches = findExcerpt(headRaw.text, quote);
    if (matches.length === 0) {
      gone = true;
    } else {
      gone = false;
      linesAtHead = matches.find(([s, e]) => s === start && e === end) ?? matches[0];
    }
  }

  // 7. Check committed record
  const recorded = findExcerptRecord(claim, recordDir) !== null;
  const moved = linesAtHead !== null && linesAtHead[0] !== start;
  const fullDetails = {
    ...baseDetails,
    headCommit,
    linesAtHead,
    moved,
  };
  const headInfo = { headCommit, linesAtHead };

  // 8. Decision table
  if (!gone && recorded) {
    return {
      kind: 'result',
      result: {
        claimId: claim.id,
        status: 'proven',
        reason: null,
        message: null,
        details: fullDetails,
        checkedAt,
      },
      head: headInfo,
    };
  }

  if (!gone && !recorded) {
    return {
      kind: 'result',
      result: {
        claimId: claim.id,
        status: 'failed',
        reason: 'not-recorded',
        message: `Excerpt verified. Record it: npm run proof:verify-sources -- --record --claim ${claim.id}`,
        details: fullDetails,
        checkedAt,
      },
      head: headInfo,
    };
  }

  if (gone && recorded) {
    return {
      kind: 'result',
      result: {
        claimId: claim.id,
        status: 'stale',
        reason: 'gone-at-head',
        message: `Recorded excerpt no longer exists at HEAD (${headCommit.slice(0, 7)}) of ${repo}.`,
        details: fullDetails,
        checkedAt,
      },
      head: headInfo,
    };
  }

  return {
    kind: 'result',
    result: {
      claimId: claim.id,
      status: 'failed',
      reason: 'outdated-at-head',
      message: 'The excerpt no longer exists at HEAD. Re-run --resolve without --commit.',
      details: fullDetails,
      checkedAt,
    },
    head: headInfo,
  };
}

/**
 * Exit code for proof:verify-sources:
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
