import type { PoliteFetchOptions } from '../spec/http';
import { checkExcerptSize, excerptAt, findExcerpt, normalizeExcerpt } from './excerpt';
import { fetchRawFile, getHeadCommit, type ExecFileRunner } from './github';
import { REPOS, checkPathAllowed, isSourceRepo, type SourceRepo } from './repos';

export interface ResolveSourceQuoteInput {
  repo: SourceRepo;
  path: string;
  /** Proposed excerpt. May have different indentation, but must match verbatim line by line. */
  snippet: string;
  /** Optional pinned 40-char commit SHA. Defaults to HEAD of the repository's default branch. */
  commit?: string;
}

export type ResolveSourceQuoteResult =
  | {
      ok: true;
      proof: {
        kind: 'source-quote';
        repo: SourceRepo;
        commit: string;
        path: string;
        lines: [number, number];
        quote: string;
      };
    }
  | {
      ok: false;
      reason:
        | 'repo-not-allowed'
        | 'path-not-allowed'
        | 'fetch-error'
        | 'unavailable'
        | 'not-found'
        | 'ambiguous'
        | 'excerpt-too-long';
      message: string;
      candidates?: Array<[number, number]>;
    };

export async function resolveSourceQuote(
  input: ResolveSourceQuoteInput,
  opts?: { fetchOptions?: PoliteFetchOptions; run?: ExecFileRunner }
): Promise<ResolveSourceQuoteResult> {
  if (!isSourceRepo(input.repo)) {
    return {
      ok: false,
      reason: 'repo-not-allowed',
      message: `Repository "${String(input.repo)}" is not in the allowed list.`,
    };
  }

  const pathCheck = checkPathAllowed(input.repo, input.path);
  if (!pathCheck.ok) {
    return pathCheck;
  }

  let normalized: string;
  try {
    normalized = normalizeExcerpt(input.snippet);
  } catch {
    return { ok: false, reason: 'not-found', message: 'Empty snippet.' };
  }

  const sizeCheck = checkExcerptSize(normalized);
  if (!sizeCheck.ok) {
    return sizeCheck;
  }

  let commit: string;
  if (input.commit !== undefined) {
    if (!/^[0-9a-f]{40}$/.test(input.commit)) {
      return {
        ok: false,
        reason: 'fetch-error',
        message: `Invalid commit SHA: "${input.commit}". Expected 40 lowercase hex characters.`,
      };
    }
    commit = input.commit;
  } else {
    const head = await getHeadCommit(input.repo, REPOS[input.repo].defaultBranch, opts?.run);
    if (typeof head !== 'string') {
      return { ok: false, reason: 'unavailable', message: head.error };
    }
    commit = head;
  }

  const raw = await fetchRawFile(input.repo, commit, input.path, opts?.fetchOptions);
  if ('unavailable' in raw) {
    return { ok: false, reason: 'unavailable', message: raw.error };
  }
  if (!raw.ok) {
    return {
      ok: false,
      reason: 'fetch-error',
      message: raw.tooLarge ? raw.error : `File not found at ${input.repo}@${commit}:${input.path}.`,
    };
  }

  const matches = findExcerpt(raw.text, normalized);
  if (matches.length === 0) {
    return {
      ok: false,
      reason: 'not-found',
      message: `Snippet not found verbatim in ${input.repo}@${commit}:${input.path}.`,
    };
  }
  if (matches.length > 1) {
    return {
      ok: false,
      reason: 'ambiguous',
      message: `Snippet matched ${matches.length} locations in ${input.path}; provide a longer excerpt.`,
      candidates: matches,
    };
  }

  const lines = matches[0];
  const quote = excerptAt(raw.text, lines[0], lines[1]);
  if (quote === null) {
    return {
      ok: false,
      reason: 'not-found',
      message: `Could not extract lines ${lines[0]}-${lines[1]} from ${input.path}.`,
    };
  }

  return {
    ok: true,
    proof: {
      kind: 'source-quote',
      repo: input.repo,
      commit,
      path: input.path,
      lines,
      quote,
    },
  };
}
