import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetPoliteFetchState, type PoliteFetchOptions } from '@/lib/proof/spec/http';
import {
  __resetGithubMemo,
  __setSourceRawCacheDirForTests,
  type ExecFileRunner,
} from '@/lib/proof/source/github';
import { resolveSourceQuote } from '@/lib/proof/source/resolve';

const FIXTURES_DIR = path.join(process.cwd(), 'tests', 'fixtures', 'sources');
const EVENT_TARGET_CPP = fs.readFileSync(path.join(FIXTURES_DIR, 'EventTarget.cpp'), 'utf8');
const TIMELINE_UI_STRINGS_TS = fs.readFileSync(
  path.join(FIXTURES_DIR, 'TimelineUIStrings.ts'),
  'utf8'
);

const HEAD_SHA = 'fc91aa8caa75fc01f57bc7525d1a78799d13294a';
const EVENT_TARGET_PATH = 'Source/WebCore/dom/EventTarget.cpp';

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
    const rawUrl = `https://raw.githubusercontent.com/WebKit/WebKit/${HEAD_SHA}/${EVENT_TARGET_PATH}`;
    const run: ExecFileRunner = async () => ({
      stdout: `${HEAD_SHA}\trefs/heads/main\n`,
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
    expect(res.proof.commit).toBe(HEAD_SHA);
    expect(res.proof.lines).toEqual([24, 25]);
    expect(res.proof.quote).toBe('if (!isScriptExecutionContextValid())\n    return false;');
    expect(res.proof.quote).not.toBe(snippetWithTrailingSpaces);
  });

  it('resolves a DevTools UIStrings snippet', async () => {
    const devtoolsPath = 'front_end/panels/timeline/TimelineUIUtils.ts';
    const rawUrl = `https://raw.githubusercontent.com/ChromeDevTools/devtools-frontend/${HEAD_SHA}/${devtoolsPath}`;
    const run: ExecFileRunner = async () => ({ stdout: `${HEAD_SHA}\trefs/heads/main\n` });

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
    const rawUrl = `https://raw.githubusercontent.com/WebKit/WebKit/${HEAD_SHA}/${EVENT_TARGET_PATH}`;
    const run: ExecFileRunner = async () => ({ stdout: `${HEAD_SHA}\trefs/heads/main\n` });

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
    const rawUrl = `https://raw.githubusercontent.com/WebKit/WebKit/${HEAD_SHA}/${EVENT_TARGET_PATH}`;
    const run: ExecFileRunner = async () => ({ stdout: `${HEAD_SHA}\trefs/heads/main\n` });

    const res = await resolveSourceQuote(
      {
        repo: 'WebKit/WebKit',
        path: EVENT_TARGET_PATH,
        snippet: 'if (!isScriptExecutionContextValid())\n    return false;',
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
