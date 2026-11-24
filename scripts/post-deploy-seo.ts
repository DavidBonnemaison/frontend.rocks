import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const SITE_URL = 'https://frontend.rocks';

export interface StepResult {
  skipped: boolean;
  updated?: boolean;
  reason?: string;
  submittedCount?: number;
  url?: string;
}

export function mapChangedFileToUrls(filePath: string): string[] {
  const normalized = filePath.replace(/\\/g, '/').replace(/^\.\//, '');

  const conceptMatch = normalized.match(/^content\/concepts\/([^/]+)\.mdx?$/);
  if (conceptMatch) {
    return [`${SITE_URL}/concepts/${conceptMatch[1]}/`];
  }

  const autopsyMatch = normalized.match(/^content\/autopsies\/([^/]+)\.mdx?$/);
  if (autopsyMatch) {
    return [`${SITE_URL}/autopsies/${autopsyMatch[1]}/`];
  }

  const digestMatch = normalized.match(/^content\/digests\/([^/]+)\.json$/);
  if (digestMatch) {
    return [`${SITE_URL}/digest/`];
  }

  const labMatch = normalized.match(/^content\/labs\/([^/]+)\.json$/);
  if (labMatch) {
    return [`${SITE_URL}/embed/lab/${labMatch[1]}/`];
  }

  if (normalized === 'content/paths.json') {
    return [`${SITE_URL}/`];
  }

  if (normalized === 'src/config/symptoms.ts') {
    return [`${SITE_URL}/symptoms/`];
  }

  return [];
}

export function collectIndexNowUrls(changedFiles: string[]): string[] {
  const urlSet = new Set<string>();
  for (const file of changedFiles) {
    for (const url of mapChangedFileToUrls(file)) {
      urlSet.add(url);
    }
  }
  return Array.from(urlSet).sort();
}

export async function submitIndexNow(
  urls: string[],
  env: Record<string, string | undefined> = process.env,
  fetchImpl: typeof fetch = fetch
): Promise<StepResult> {
  const key = env.INDEXNOW_KEY?.trim();
  if (!key) {
    console.log('[post-deploy-seo] INDEXNOW_KEY not set — skipping IndexNow submission.');
    return { skipped: true, reason: 'INDEXNOW_KEY not set' };
  }

  if (urls.length === 0) {
    console.log('[post-deploy-seo] No changed content URLs — skipping IndexNow submission.');
    return { skipped: true, reason: 'No changed content URLs' };
  }

  const payload = {
    host: 'frontend.rocks',
    key,
    keyLocation: `${SITE_URL}/${key}.txt`,
    urlList: urls,
  };

  const res = await fetchImpl('https://api.indexnow.org/indexnow', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`IndexNow submission failed (${res.status}): ${text}`);
  }

  console.log(`[post-deploy-seo] IndexNow submitted ${urls.length} URL(s).`);
  return { skipped: false, submittedCount: urls.length };
}

function getGitDiffFiles(args: string[], cwd: string): string[] {
  try {
    const out = execFileSync('git', args, {
      cwd,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return out
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
  } catch {
    console.log('[post-deploy-seo] Unable to compute git diff against HEAD~1 — treating as empty.');
    return [];
  }
}

export async function runPostDeploySeo(options?: {
  env?: Record<string, string | undefined>;
  cwd?: string;
}): Promise<void> {
  const env = options?.env ?? process.env;
  const cwd = options?.cwd ?? process.cwd();

  const changedFiles = getGitDiffFiles(
    ['diff', '--name-only', 'HEAD~1', 'HEAD', '--', 'content/', 'src/config/symptoms.ts'],
    cwd
  );
  await submitIndexNow(collectIndexNowUrls(changedFiles), env);
}

const isCliEntry =
  typeof process !== 'undefined' &&
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isCliEntry) {
  runPostDeploySeo().catch((err) => {
    console.error('[post-deploy-seo] Fatal error:', err);
    process.exit(1);
  });
}
