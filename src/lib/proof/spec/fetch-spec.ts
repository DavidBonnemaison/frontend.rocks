import { politeFetchText, type PoliteFetchOptions } from './http';
import { classifySpecUrl, isRejection } from './domains';
import { readCachedSpecHtml, writeCachedSpecHtml } from './html-cache';

export interface FetchedSpecPage {
  url: string;
  finalUrl: string;
  html: string;
  renderedWithBrowser: boolean;
}

export type FetchSpecError = {
  error: 'domain-not-allowed' | 'single-page-spec' | 'fetch-error' | 'unrendered-respec';
  message: string;
  status?: number;
};

export interface FetchSpecOptions extends PoliteFetchOptions {
  maxAgeHours?: number;
  cacheDir?: string;
  renderRespec?: (url: string) => Promise<string>;
}

/** Per-run memoization: a page is downloaded only once even if multiple claims cite it. */
const memo = new Map<string, Promise<FetchedSpecPage | FetchSpecError>>();

export function isUnrenderedRespec(html: string): boolean {
  // An exported ReSpec page has a table of contents with id="toc" (a <nav> on w3.org/TR, sometimes a <section>).
  return /respecConfig\s*=/.test(html) && !/\bid=["']?toc["'\s>]/i.test(html);
}

export async function fetchSpecPage(
  url: string,
  opts: FetchSpecOptions = {}
): Promise<FetchedSpecPage | FetchSpecError> {
  const source = classifySpecUrl(url);
  if (isRejection(source)) return { error: source.reason, message: source.message };
  const key = source.canonicalUrl;
  const maxAgeHours = opts.maxAgeHours ?? 24;
  const nowDate = () => new Date((opts.now ?? Date.now)());

  if (!memo.has(key)) {
    memo.set(
      key,
      (async () => {
        const cached = readCachedSpecHtml(key, maxAgeHours, nowDate(), opts.cacheDir);
        if (cached) {
          return {
            url: key,
            finalUrl: cached.meta.finalUrl,
            html: cached.html,
            renderedWithBrowser: cached.meta.renderedWithBrowser,
          };
        }

        const res = await politeFetchText(key, opts);
        if (!res.ok) {
          return { error: 'fetch-error' as const, status: res.status, message: `${key}: ${res.error}` };
        }
        const finalCheck = classifySpecUrl(res.finalUrl);
        if (isRejection(finalCheck)) {
          return {
            error: 'domain-not-allowed' as const,
            message: `Redirected outside the allow-list: ${res.finalUrl}`,
          };
        }

        let html = res.body;
        let renderedWithBrowser = false;
        if (isUnrenderedRespec(html)) {
          const render = opts.renderRespec ?? renderWithPlaywright;
          try {
            html = await render(key);
            if (isUnrenderedRespec(html)) {
              return { error: 'unrendered-respec' as const, message: `ReSpec did not finish rendering ${key}` };
            }
            renderedWithBrowser = true;
          } catch (err) {
            return {
              error: 'unrendered-respec' as const,
              message: err instanceof Error ? err.message : String(err),
            };
          }
        }

        writeCachedSpecHtml(
          key,
          html,
          {
            url: key,
            finalUrl: res.finalUrl,
            fetchedAt: nowDate().toISOString(),
            renderedWithBrowser,
          },
          opts.cacheDir
        );

        return { url: key, finalUrl: res.finalUrl, html, renderedWithBrowser };
      })()
    );
  }
  return memo.get(key)!;
}

export async function renderWithPlaywright(url: string): Promise<string> {
  const { chromium } = await import('@playwright/test');
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'networkidle', timeout: 60_000 });
    // ReSpec exposes document.respec.ready (a Promise) once loaded.
    await page.waitForFunction(
      () => Boolean((document as unknown as { respec?: { ready?: Promise<unknown> } }).respec?.ready),
      undefined,
      { timeout: 30_000 }
    );
    await page.evaluate(async () => {
      await (document as unknown as { respec: { ready: Promise<unknown> } }).respec.ready;
    });
    return await page.content();
  } finally {
    await browser.close();
  }
}

export function __resetFetchSpecMemo(): void {
  memo.clear();
}
