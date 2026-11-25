import { execFile } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { SITE_ROOT } from '../../paths';
import { politeFetchText, type PoliteFetchOptions } from '../spec/http';
import type { SourceRepo } from './repos';

const execFileAsync = promisify(execFile);

export type ExecFileRunner = (
  file: string,
  args: readonly string[],
  options?: { timeout?: number }
) => Promise<{ stdout: string }>;

let sourceRawCacheDir = path.join(SITE_ROOT, '.cache', 'proof', 'source-raw');

/** Tests only: redirect the raw source HTTP cache to a temporary directory. */
export function __setSourceRawCacheDirForTests(dir: string): void {
  sourceRawCacheDir = dir;
}

export type Unavailable = { unavailable: true; error: string };

const headMemo = new Map<string, Promise<string | Unavailable>>();

/**
 * Resolves the default branch HEAD SHA using `git ls-remote` over protocol v2.
 * Uses no REST API and no token; memoized once per repo+branch per run.
 */
export function getHeadCommit(
  repo: SourceRepo,
  branch: string,
  run: ExecFileRunner = execFileAsync
): Promise<string | Unavailable> {
  const key = `${repo}@${branch}`;
  if (!headMemo.has(key)) {
    headMemo.set(
      key,
      (async () => {
        try {
          const { stdout } = await run(
            'git',
            [
              '-c',
              'protocol.version=2',
              'ls-remote',
              `https://github.com/${repo}.git`,
              `refs/heads/${branch}`,
            ],
            { timeout: 60_000 }
          );
          const sha = stdout.trim().split(/\s+/)[0] ?? '';
          if (!/^[0-9a-f]{40}$/.test(sha)) {
            return { unavailable: true as const, error: `ls-remote returned no sha for ${key}` };
          }
          return sha;
        } catch (err) {
          return {
            unavailable: true as const,
            error: err instanceof Error ? err.message : String(err),
          };
        }
      })()
    );
  }
  return headMemo.get(key)!;
}

export type RawFileResult =
  | { ok: true; text: string }
  | { ok: false; notFound: true; tooLarge?: false; error?: string }
  | { ok: false; notFound: false; tooLarge: true; error: string }
  | Unavailable;

/**
 * Fetches a raw source file at a specific commit with an unlimited local disk cache
 * (commit contents are immutable). Capped at 5 MiB.
 */
export async function fetchRawFile(
  repo: SourceRepo,
  commit: string,
  filePath: string,
  opts: PoliteFetchOptions = {}
): Promise<RawFileResult> {
  const key = crypto.createHash('sha1').update(`${repo}@${commit}:${filePath}`).digest('hex');
  const cached = path.join(sourceRawCacheDir, `${key}.txt`);
  if (fs.existsSync(cached)) {
    return { ok: true, text: fs.readFileSync(cached, 'utf8') };
  }

  const encodedPath = filePath.split('/').map(encodeURIComponent).join('/');
  const url = `https://raw.githubusercontent.com/${repo}/${commit}/${encodedPath}`;
  const res = await politeFetchText(url, {
    maxBytes: 5 * 1024 * 1024,
    ...opts,
    headers: { Accept: 'text/plain', ...opts.headers },
  });

  if (res.ok) {
    fs.mkdirSync(sourceRawCacheDir, { recursive: true });
    fs.writeFileSync(cached, res.body, 'utf8');
    return { ok: true, text: res.body };
  }
  if (res.status === 404) {
    return { ok: false, notFound: true };
  }
  if (res.error?.startsWith('Response too large')) {
    return { ok: false, notFound: false, tooLarge: true, error: res.error };
  }
  return { unavailable: true, error: res.error ?? `HTTP ${res.status}` };
}

export function __resetGithubMemo(): void {
  headMemo.clear();
}
