export const DEFAULT_USER_AGENT = 'spec-quote-verifier/1.0 (static site proof checker)';

export interface PoliteFetchOptions {
  userAgent?: string;
  /** Minimum delay between two requests to the same host (ms). */
  minIntervalMs?: number;
  timeoutMs?: number;
  maxBytes?: number;
  retries?: number;
  headers?: Record<string, string>;
  /** Injection hooks for tests. */
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

export interface PoliteFetchResult {
  ok: boolean;
  status: number;
  finalUrl: string;
  body: string;
  error: string | null;
}

const lastRequestAt = new Map<string, number>();
const RETRYABLE = new Set([408, 425, 429, 500, 502, 503, 504]);

export async function politeFetchText(url: string, opts: PoliteFetchOptions = {}): Promise<PoliteFetchResult> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const sleep = opts.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const now = opts.now ?? Date.now;
  const minInterval = opts.minIntervalMs ?? 1000;
  const retries = opts.retries ?? 3;
  const maxBytes = opts.maxBytes ?? 20 * 1024 * 1024;
  const host = new URL(url).hostname;

  let lastError: string | null = null;
  let lastStatus = 0;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const prev = lastRequestAt.get(host);
    if (prev !== undefined) {
      const wait = prev + minInterval - now();
      if (wait > 0) await sleep(wait);
    }
    lastRequestAt.set(host, now());

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 30_000);
    try {
      const res = await fetchImpl(url, {
        redirect: 'follow',
        signal: controller.signal,
        headers: { 'User-Agent': opts.userAgent ?? DEFAULT_USER_AGENT, Accept: 'text/html', ...opts.headers },
      });
      lastStatus = res.status;
      if (res.ok) {
        const declared = Number(res.headers.get('content-length') ?? '0');
        if (declared > maxBytes) {
          return {
            ok: false,
            status: res.status,
            finalUrl: res.url || url,
            body: '',
            error: `Response too large (${declared} bytes)`,
          };
        }
        const body = await res.text();
        if (body.length > maxBytes) {
          return {
            ok: false,
            status: res.status,
            finalUrl: res.url || url,
            body: '',
            error: `Response too large (${body.length} chars)`,
          };
        }
        return { ok: true, status: res.status, finalUrl: res.url || url, body, error: null };
      }
      lastError = `HTTP ${res.status}`;
      if (!RETRYABLE.has(res.status)) break;
      const retryAfter = Number(res.headers.get('retry-after'));
      const delay =
        Number.isFinite(retryAfter) && retryAfter > 0
          ? Math.min(retryAfter, 60) * 1000
          : 1000 * 4 ** attempt;
      if (attempt < retries) await sleep(delay);
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      if (attempt < retries) await sleep(1000 * 4 ** attempt);
    } finally {
      clearTimeout(timer);
    }
  }
  return { ok: false, status: lastStatus, finalUrl: url, body: '', error: lastError };
}

/** Resets per-host throttling state (tests only). */
export function __resetPoliteFetchState(): void {
  lastRequestAt.clear();
}
