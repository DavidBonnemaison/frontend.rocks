import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { SITE_ROOT } from '../../paths';

export const SPEC_HTML_CACHE_DIR = path.join(SITE_ROOT, '.cache', 'proof', 'spec-html');

export interface HtmlCacheMeta {
  url: string;
  finalUrl: string;
  fetchedAt: string;
  renderedWithBrowser: boolean;
}

function cachePaths(canonicalUrl: string, cacheDir: string): { htmlPath: string; metaPath: string } {
  const hash = crypto.createHash('sha1').update(canonicalUrl).digest('hex');
  return {
    htmlPath: path.join(cacheDir, `${hash}.html`),
    metaPath: path.join(cacheDir, `${hash}.meta.json`),
  };
}

/** Returns cached page if present and younger than maxAgeHours. maxAgeHours <= 0 never reads the cache. */
export function readCachedSpecHtml(
  canonicalUrl: string,
  maxAgeHours: number,
  now: Date = new Date(),
  cacheDir: string = SPEC_HTML_CACHE_DIR
): { html: string; meta: HtmlCacheMeta } | null {
  if (maxAgeHours <= 0) return null;
  const { htmlPath, metaPath } = cachePaths(canonicalUrl, cacheDir);
  if (!fs.existsSync(htmlPath) || !fs.existsSync(metaPath)) return null;
  try {
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8')) as HtmlCacheMeta;
    const fetchedAtMs = Date.parse(meta.fetchedAt);
    if (!Number.isFinite(fetchedAtMs)) return null;
    const ageMs = now.getTime() - fetchedAtMs;
    if (ageMs >= maxAgeHours * 3_600_000) return null;
    const html = fs.readFileSync(htmlPath, 'utf-8');
    return { html, meta };
  } catch {
    return null;
  }
}

export function writeCachedSpecHtml(
  canonicalUrl: string,
  html: string,
  meta: HtmlCacheMeta,
  cacheDir: string = SPEC_HTML_CACHE_DIR
): void {
  fs.mkdirSync(cacheDir, { recursive: true });
  const { htmlPath, metaPath } = cachePaths(canonicalUrl, cacheDir);
  fs.writeFileSync(htmlPath, html, 'utf-8');
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2) + '\n', 'utf-8');
}
