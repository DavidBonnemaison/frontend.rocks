export const SITE_URL = 'https://frontend.rocks';
export const INDEXNOW_ENDPOINT = 'https://api.indexnow.org/indexnow';
export const INDEXNOW_PENDING_PATH = '/indexnow-pending.json';

export interface StepResult {
  skipped: boolean;
  updated?: boolean;
  reason?: string;
  submittedCount?: number;
  url?: string;
}

/** File written at build time to public/indexnow-pending.json and read by the deploy-succeeded function. */
export interface IndexNowPending {
  commit: string;
  urls: string[];
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

/**
 * Keeps the changed URLs worth sending: pages that are published now, plus pages that were
 * published before this build and are noindex now (search engines must learn about it).
 * A changed URL that was never published is not sent.
 */
export function selectIndexNowUrls(input: {
  changedUrls: string[];
  publishedUrls: Iterable<string>;
  previouslyPublishedUrls: Iterable<string>;
}): string[] {
  const published = new Set(input.publishedUrls);
  const previously = new Set(input.previouslyPublishedUrls);
  return input.changedUrls.filter((url) => published.has(url) || previously.has(url)).sort();
}

const PROVEN_RE = /^proof_status:\s*proven\s*$/m;

/**
 * Content of public/indexnow-pending.json for a build.
 * `git` runs a git command from the repository root and returns its output (it throws on failure).
 * Without a deployed commit, or when the diff fails (history missing, first build), every
 * published URL is sent.
 */
export function extractRedirectUrlsFromJson(rawJson: string): string[] {
  try {
    const parsed = JSON.parse(rawJson) as { rules?: Array<{ from?: unknown }> };
    if (!Array.isArray(parsed.rules)) return [];
    const urls: string[] = [];
    for (const rule of parsed.rules) {
      if (typeof rule?.from !== 'string') continue;
      if (!rule.from.startsWith('/') || rule.from.includes('*')) continue;
      urls.push(`${SITE_URL}${rule.from}`);
    }
    return urls;
  } catch {
    return [];
  }
}

export function buildIndexNowPending(input: {
  commit: string;
  deployedCommit?: string | null;
  publishedUrls: string[];
  git: (args: string[]) => string;
}): IndexNowPending {
  const everything = { commit: input.commit, urls: [...new Set(input.publishedUrls)].sort() };
  const deployed = input.deployedCommit?.trim();
  if (!deployed) return everything;

  try {
    const changedFiles = input
      .git(['diff', '--name-only', deployed, 'HEAD', '--', 'content/', 'src/config/symptoms.ts'])
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

    const previouslyPublishedUrls: string[] = [];
    const redirectUrls: string[] = [];

    for (const file of changedFiles) {
      if (/^content\/redirects\/[^/]+\.json$/.test(file)) {
        try {
          const currentJson = input.git(['show', `HEAD:${file}`]);
          redirectUrls.push(...extractRedirectUrlsFromJson(currentJson));
        } catch {
          // Redirect file deleted or unreadable from HEAD.
        }
        continue;
      }
      if (!/^content\/(concepts|autopsies)\//.test(file)) continue;
      try {
        if (PROVEN_RE.test(input.git(['show', `${deployed}:${file}`]))) {
          previouslyPublishedUrls.push(...mapChangedFileToUrls(file));
        }
      } catch {
        // The file did not exist at the deployed commit: it was never published.
      }
    }

    const selected = selectIndexNowUrls({
      changedUrls: collectIndexNowUrls(changedFiles),
      publishedUrls: input.publishedUrls,
      previouslyPublishedUrls,
    });

    return {
      commit: input.commit,
      urls: [...new Set([...selected, ...redirectUrls])].sort(),
    };
  } catch {
    return everything;
  }
}

export function parseIndexNowPending(value: unknown): IndexNowPending | null {
  if (typeof value !== 'object' || value === null) return null;
  const { commit, urls } = value as Record<string, unknown>;
  if (typeof commit !== 'string' || !Array.isArray(urls)) return null;
  if (!urls.every((u): u is string => typeof u === 'string')) return null;
  return { commit, urls };
}

export async function submitIndexNow(
  urls: string[],
  env: Record<string, string | undefined> = process.env,
  fetchImpl: typeof fetch = fetch
): Promise<StepResult> {
  const key = env.INDEXNOW_KEY?.trim();
  if (!key) {
    console.log('[indexnow] INDEXNOW_KEY not set, skipping IndexNow submission.');
    return { skipped: true, reason: 'INDEXNOW_KEY not set' };
  }

  if (urls.length === 0) {
    console.log('[indexnow] No changed content URLs, skipping IndexNow submission.');
    return { skipped: true, reason: 'No changed content URLs' };
  }

  const payload = {
    host: 'frontend.rocks',
    key,
    keyLocation: `${SITE_URL}/${key}.txt`,
    urlList: urls,
  };

  const res = await fetchImpl(INDEXNOW_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`IndexNow submission failed (${res.status}): ${text}`);
  }

  console.log(`[indexnow] IndexNow submitted ${urls.length} URL(s).`);
  return { skipped: false, submittedCount: urls.length };
}
