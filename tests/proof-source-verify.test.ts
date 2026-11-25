import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProofArtifactSchema } from '@/lib/proof/artifact-schema';
import { __resetPoliteFetchState, type PoliteFetchOptions } from '@/lib/proof/spec/http';
import {
  __resetGithubMemo,
  __setSourceRawCacheDirForTests,
  type ExecFileRunner,
} from '@/lib/proof/source/github';
import {
  findExcerptRecord,
  pruneSourceRecords,
  readSourceRecord,
  recordSourceExcerpt,
  sourceRecordPath,
  type SourceQuoteClaim,
} from '@/lib/proof/source/record';
import { resolveSourceQuote } from '@/lib/proof/source/resolve';
import { computeExitCode, verifySourceQuote } from '@/lib/proof/source/verify';
import { buildSourceQuotesArtifact } from '../scripts/proof/verify-source-quotes';

const FIXTURES_DIR = path.join(process.cwd(), 'tests', 'fixtures', 'sources');
const EVENT_TARGET_CPP = fs.readFileSync(path.join(FIXTURES_DIR, 'EventTarget.cpp'), 'utf8');
const TIMELINE_UI_STRINGS_TS = fs.readFileSync(
  path.join(FIXTURES_DIR, 'TimelineUIStrings.ts'),
  'utf8'
);

const PINNED_SHA = 'fc91aa8caa75fc01f57bc7525d1a78799d13294a';
const HEAD_SHA = '1111111111111111111111111111111111111111';
const EVENT_TARGET_PATH = 'Source/WebCore/dom/EventTarget.cpp';
const VALID_QUOTE = 'if (!isScriptExecutionContextValid())\n    return false;';

function makeClaim(overrides: Partial<SourceQuoteClaim['proof']> = {}): SourceQuoteClaim {
  return {
    id: 'event-target/checks-context',
    type: 'implementation',
    statement: 'WebKit EventTarget::addEventListener rejects listeners when the context is invalid.',
    proof: {
      kind: 'source-quote',
      repo: 'WebKit/WebKit',
      commit: PINNED_SHA,
      path: EVENT_TARGET_PATH,
      lines: [24, 25],
      quote: VALID_QUOTE,
      ...overrides,
    },
  };
}

function makeFetch(
  routes: Record<string, { status: number; body: string }>,
  onRequest?: (url: string, init?: RequestInit) => void
): typeof fetch {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    onRequest?.(url, init);
    const match = routes[url];
    if (!match) {
      return new Response('Not Found', { status: 404 });
    }
    return new Response(match.body, {
      status: match.status,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  }) as typeof fetch;
}

function fastFetchOptions(fetchImpl: typeof fetch): PoliteFetchOptions {
  return {
    fetchImpl,
    minIntervalMs: 0,
    retries: 0,
    sleep: async () => {},
  };
}

describe('resolveSourceQuote', () => {
  const tempDirs: string[] = [];

  beforeEach(() => {
    __resetGithubMemo();
    __resetPoliteFetchState();
    const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fr-source-cache-'));
    tempDirs.push(cacheDir);
    __setSourceRawCacheDirForTests(cacheDir);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    while (tempDirs.length > 0) {
      fs.rmSync(tempDirs.pop()!, { recursive: true, force: true });
    }
  });

  it('resolves commit, 1-indexed lines, and normalized file quote from a snippet with trailing spaces', async () => {
    const rawUrl = `https://raw.githubusercontent.com/WebKit/WebKit/${PINNED_SHA}/${EVENT_TARGET_PATH}`;
    const run: ExecFileRunner = async () => ({
      stdout: `${PINNED_SHA}\trefs/heads/main\n`,
    });
    const snippetWithTrailingSpaces =
      '        if (!isScriptExecutionContextValid())   \n            return false;  \n';

    const res = await resolveSourceQuote(
      {
        repo: 'WebKit/WebKit',
        path: EVENT_TARGET_PATH,
        snippet: snippetWithTrailingSpaces,
      },
      {
        fetchOptions: fastFetchOptions(
          makeFetch({ [rawUrl]: { status: 200, body: EVENT_TARGET_CPP } })
        ),
        run,
      }
    );

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.proof.commit).toBe(PINNED_SHA);
    expect(res.proof.lines).toEqual([24, 25]);
    expect(res.proof.quote).toBe(VALID_QUOTE);
    expect(res.proof.quote).not.toBe(snippetWithTrailingSpaces);
  });

  it('resolves a DevTools UIStrings snippet', async () => {
    const devtoolsPath = 'front_end/panels/timeline/TimelineUIUtils.ts';
    const rawUrl = `https://raw.githubusercontent.com/ChromeDevTools/devtools-frontend/${PINNED_SHA}/${devtoolsPath}`;
    const run: ExecFileRunner = async () => ({ stdout: `${PINNED_SHA}\trefs/heads/main\n` });

    const res = await resolveSourceQuote(
      {
        repo: 'ChromeDevTools/devtools-frontend',
        path: devtoolsPath,
        snippet: "forcedReflow: 'Forced reflow is a likely performance bottleneck.',",
      },
      {
        fetchOptions: fastFetchOptions(
          makeFetch({ [rawUrl]: { status: 200, body: TIMELINE_UI_STRINGS_TS } })
        ),
        run,
      }
    );

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.proof.lines).toEqual([9, 9]);
  });

  it('returns ambiguous with all candidate line ranges when snippet appears twice', async () => {
    const rawUrl = `https://raw.githubusercontent.com/WebKit/WebKit/${PINNED_SHA}/${EVENT_TARGET_PATH}`;
    const run: ExecFileRunner = async () => ({ stdout: `${PINNED_SHA}\trefs/heads/main\n` });

    const res = await resolveSourceQuote(
      {
        repo: 'WebKit/WebKit',
        path: EVENT_TARGET_PATH,
        snippet: 'eventListenersDidChange();',
      },
      {
        fetchOptions: fastFetchOptions(
          makeFetch({ [rawUrl]: { status: 200, body: EVENT_TARGET_CPP } })
        ),
        run,
      }
    );

    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.reason).toBe('ambiguous');
    expect(res.candidates).toEqual([
      [33, 33],
      [45, 45],
    ]);
  });

  it('returns unavailable without throwing when git ls-remote fails', async () => {
    const run: ExecFileRunner = async () => {
      throw new Error('fatal: unable to access github.com');
    };

    const res = await resolveSourceQuote(
      {
        repo: 'WebKit/WebKit',
        path: EVENT_TARGET_PATH,
        snippet: 'eventListenersDidChange();',
      },
      {
        fetchOptions: fastFetchOptions(makeFetch({})),
        run,
      }
    );

    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.reason).toBe('unavailable');
    expect(res.message).toContain('unable to access');
  });

  it('never reads GITHUB_TOKEN or sends an Authorization header', async () => {
    vi.stubEnv('GITHUB_TOKEN', 'secret-test-token');
    const seenHeaders: Array<Record<string, string>> = [];
    const rawUrl = `https://raw.githubusercontent.com/WebKit/WebKit/${PINNED_SHA}/${EVENT_TARGET_PATH}`;
    const run: ExecFileRunner = async () => ({ stdout: `${PINNED_SHA}\trefs/heads/main\n` });

    const res = await resolveSourceQuote(
      {
        repo: 'WebKit/WebKit',
        path: EVENT_TARGET_PATH,
        snippet: VALID_QUOTE,
      },
      {
        fetchOptions: fastFetchOptions(
          makeFetch({ [rawUrl]: { status: 200, body: EVENT_TARGET_CPP } }, (_url, init) => {
            const headers = (init?.headers ?? {}) as Record<string, string>;
            seenHeaders.push(headers);
          })
        ),
        run,
      }
    );

    expect(res.ok).toBe(true);
    expect(seenHeaders.length).toBe(1);
    for (const headers of seenHeaders) {
      const keys = Object.keys(headers).map((k) => k.toLowerCase());
      expect(keys).not.toContain('authorization');
      expect(JSON.stringify(headers)).not.toContain('secret-test-token');
    }
  });
});

describe('verifySourceQuote & record', () => {
  const tempDirs: string[] = [];
  let recordDir: string;

  beforeEach(() => {
    __resetGithubMemo();
    __resetPoliteFetchState();
    const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fr-source-cache-'));
    recordDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fr-source-records-'));
    tempDirs.push(cacheDir, recordDir);
    __setSourceRawCacheDirForTests(cacheDir);
  });

  afterEach(() => {
    while (tempDirs.length > 0) {
      fs.rmSync(tempDirs.pop()!, { recursive: true, force: true });
    }
  });

  it('returns not-recorded before --record and proven after recording, with stable minimal JSON', async () => {
    const claim = makeClaim();
    const pinnedUrl = `https://raw.githubusercontent.com/WebKit/WebKit/${PINNED_SHA}/${EVENT_TARGET_PATH}`;
    const run: ExecFileRunner = async () => ({ stdout: `${PINNED_SHA}\trefs/heads/main\n` });
    const fetchOptions = fastFetchOptions(
      makeFetch({ [pinnedUrl]: { status: 200, body: EVENT_TARGET_CPP } })
    );
    const fixedNow = () => new Date('2026-12-01T10:00:00.000Z');

    const before = await verifySourceQuote({ claim, fetchOptions, run, recordDir, now: fixedNow });
    expect(before.kind).toBe('result');
    if (before.kind !== 'result') return;
    expect(before.result.status).toBe('failed');
    expect(before.result.reason).toBe('not-recorded');

    recordSourceExcerpt(claim, '2026-12-01', recordDir);
    const recordFile = sourceRecordPath('WebKit/WebKit', PINNED_SHA, EVENT_TARGET_PATH, recordDir);
    const raw1 = fs.readFileSync(recordFile, 'utf8');
    expect(raw1).toContain('"quoteSha256"');
    expect(raw1).not.toContain('isScriptExecutionContextValid');
    expect(raw1.endsWith('\n')).toBe(true);

    // Writing again is byte-identical
    recordSourceExcerpt(claim, '2026-12-01', recordDir);
    expect(fs.readFileSync(recordFile, 'utf8')).toBe(raw1);
    expect(findExcerptRecord(claim, recordDir)).not.toBeNull();

    const after1 = await verifySourceQuote({ claim, fetchOptions, run, recordDir, now: fixedNow });
    const after2 = await verifySourceQuote({ claim, fetchOptions, run, recordDir, now: fixedNow });
    expect(after1.kind).toBe('result');
    if (after1.kind !== 'result' || after2.kind !== 'result') return;
    expect(after1.result.status).toBe('proven');
    expect(after1.result.details.moved).toBe(false);
    expect(after1.result.details.linesAtHead).toEqual([24, 25]);
    expect(after1.result.details.href).toBe(
      `https://github.com/WebKit/WebKit/blob/${PINNED_SHA}/${EVENT_TARGET_PATH}#L24-L25`
    );
    expect(after1.result).toEqual(after2.result);
  });

  it('returns excerpt-mismatch when lines are shifted by one line', async () => {
    const claim = makeClaim({ lines: [25, 26] });
    const pinnedUrl = `https://raw.githubusercontent.com/WebKit/WebKit/${PINNED_SHA}/${EVENT_TARGET_PATH}`;
    const run: ExecFileRunner = async () => ({ stdout: `${PINNED_SHA}\trefs/heads/main\n` });

    const outcome = await verifySourceQuote({
      claim,
      fetchOptions: fastFetchOptions(
        makeFetch({ [pinnedUrl]: { status: 200, body: EVENT_TARGET_CPP } })
      ),
      run,
      recordDir,
    });

    expect(outcome.kind).toBe('result');
    if (outcome.kind !== 'result') return;
    expect(outcome.result.status).toBe('failed');
    expect(outcome.result.reason).toBe('excerpt-mismatch');
  });

  it('marks claim proven with moved: true and shifted linesAtHead when 3 lines are inserted above at HEAD', async () => {
    const claim = makeClaim();
    recordSourceExcerpt(claim, '2026-12-01', recordDir);

    const pinnedUrl = `https://raw.githubusercontent.com/WebKit/WebKit/${PINNED_SHA}/${EVENT_TARGET_PATH}`;
    const headUrl = `https://raw.githubusercontent.com/WebKit/WebKit/${HEAD_SHA}/${EVENT_TARGET_PATH}`;
    const shiftedHead = `// line 1\n// line 2\n// line 3\n${EVENT_TARGET_CPP}`;
    const run: ExecFileRunner = async () => ({ stdout: `${HEAD_SHA}\trefs/heads/main\n` });

    const outcome = await verifySourceQuote({
      claim,
      fetchOptions: fastFetchOptions(
        makeFetch({
          [pinnedUrl]: { status: 200, body: EVENT_TARGET_CPP },
          [headUrl]: { status: 200, body: shiftedHead },
        })
      ),
      run,
      recordDir,
    });

    expect(outcome.kind).toBe('result');
    if (outcome.kind !== 'result') return;
    expect(outcome.result.status).toBe('proven');
    expect(outcome.result.details.moved).toBe(true);
    expect(outcome.result.details.linesAtHead).toEqual([27, 28]);
  });

  it('returns stale (gone-at-head) when recorded and outdated-at-head when unrecorded if excerpt disappears at HEAD', async () => {
    const claim = makeClaim();
    const pinnedUrl = `https://raw.githubusercontent.com/WebKit/WebKit/${PINNED_SHA}/${EVENT_TARGET_PATH}`;
    const headUrl = `https://raw.githubusercontent.com/WebKit/WebKit/${HEAD_SHA}/${EVENT_TARGET_PATH}`;
    const modifiedHead = EVENT_TARGET_CPP.replace(
      'isScriptExecutionContextValid()',
      'hasActiveDocument()'
    );
    const run: ExecFileRunner = async () => ({ stdout: `${HEAD_SHA}\trefs/heads/main\n` });
    const fetchOptions = fastFetchOptions(
      makeFetch({
        [pinnedUrl]: { status: 200, body: EVENT_TARGET_CPP },
        [headUrl]: { status: 200, body: modifiedHead },
      })
    );

    const unrecorded = await verifySourceQuote({ claim, fetchOptions, run, recordDir });
    expect(unrecorded.kind).toBe('result');
    if (unrecorded.kind !== 'result') return;
    expect(unrecorded.result.status).toBe('failed');
    expect(unrecorded.result.reason).toBe('outdated-at-head');

    recordSourceExcerpt(claim, '2026-12-01', recordDir);
    const recorded = await verifySourceQuote({ claim, fetchOptions, run, recordDir });
    expect(recorded.kind).toBe('result');
    if (recorded.kind !== 'result') return;
    expect(recorded.result.status).toBe('stale');
    expect(recorded.result.reason).toBe('gone-at-head');
  });

  it('omits unavailable claims from the artifact and lists them in unavailable sidecar with exit code 0', async () => {
    const claim = makeClaim();
    const pinnedUrl = `https://raw.githubusercontent.com/WebKit/WebKit/${PINNED_SHA}/${EVENT_TARGET_PATH}`;
    const run: ExecFileRunner = async () => {
      throw new Error('git ls-remote timeout');
    };

    const outcome = await verifySourceQuote({
      claim,
      fetchOptions: fastFetchOptions(
        makeFetch({ [pinnedUrl]: { status: 200, body: EVENT_TARGET_CPP } })
      ),
      run,
      recordDir,
    });
    expect(outcome.kind).toBe('unavailable');

    const { artifact, unavailable } = buildSourceQuotesArtifact({
      outcomes: [{ claim, outcome }],
      pageStatuses: new Map([['event-target', 'proven']]),
      generatedAt: '2026-12-01T10:00:00.000Z',
    });

    expect(() => ProofArtifactSchema.parse(artifact)).not.toThrow();
    expect(Object.keys(artifact.claims)).toEqual([]);
    expect(unavailable).toHaveLength(1);
    expect(unavailable[0].claimId).toBe(claim.id);
    expect(artifact.tooling['unavailable-claims']).toBe('1');
    expect(computeExitCode(artifact, false)).toBe(0);
    expect(computeExitCode(artifact, true)).toBe(0);
  });

  it('computes exit code 1 under --strict only when an enforced (proven) page fails', async () => {
    const claim = makeClaim();
    const pinnedUrl = `https://raw.githubusercontent.com/WebKit/WebKit/${PINNED_SHA}/${EVENT_TARGET_PATH}`;
    const run: ExecFileRunner = async () => ({ stdout: `${PINNED_SHA}\trefs/heads/main\n` });

    const outcome = await verifySourceQuote({
      claim,
      fetchOptions: fastFetchOptions(
        makeFetch({ [pinnedUrl]: { status: 200, body: EVENT_TARGET_CPP } })
      ),
      run,
      recordDir,
    });

    const unverifiedArtifact = buildSourceQuotesArtifact({
      outcomes: [{ claim, outcome }],
      pageStatuses: new Map([['event-target', 'unverified']]),
      generatedAt: '2026-12-01T10:00:00.000Z',
    }).artifact;
    expect(computeExitCode(unverifiedArtifact, false)).toBe(0);
    expect(computeExitCode(unverifiedArtifact, true)).toBe(0);

    const provenArtifact = buildSourceQuotesArtifact({
      outcomes: [{ claim, outcome }],
      pageStatuses: new Map([['event-target', 'proven']]),
      generatedAt: '2026-12-01T10:00:00.000Z',
    }).artifact;
    expect(computeExitCode(provenArtifact, false)).toBe(0);
    expect(computeExitCode(provenArtifact, true)).toBe(1);
  });

  it('prunes orphaned excerpt records and files', () => {
    const claimA = makeClaim({ lines: [24, 25], quote: VALID_QUOTE });
    const claimB = makeClaim({ lines: [32, 33], quote: 'if (listenerAdded)\n    eventListenersDidChange();' });
    recordSourceExcerpt(claimA, '2026-12-01', recordDir);
    recordSourceExcerpt(claimB, '2026-12-01', recordDir);

    const pruned1 = pruneSourceRecords([claimA], recordDir);
    expect(pruned1).toEqual({ removedFiles: 0, removedExcerpts: 1 });
    expect(readSourceRecord('WebKit/WebKit', PINNED_SHA, EVENT_TARGET_PATH, recordDir)?.excerpts).toHaveProperty('24-25');

    const pruned2 = pruneSourceRecords([], recordDir);
    expect(pruned2).toEqual({ removedFiles: 1, removedExcerpts: 1 });
    expect(readSourceRecord('WebKit/WebKit', PINNED_SHA, EVENT_TARGET_PATH, recordDir)).toBeNull();
  });
});
