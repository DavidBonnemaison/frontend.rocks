import {
  INDEXNOW_PENDING_PATH,
  SITE_URL,
  parseIndexNowPending,
  submitIndexNow,
} from '../../src/lib/indexnow';

// Netlify runs a function named after an event when that event fires. This one runs after every
// successful deploy, CLI deploys included. The git history is not available here: the build
// wrote everything it needs to /indexnow-pending.json.
export default async function handler(req: Request): Promise<Response> {
  const body = (await req.json().catch(() => null)) as { payload?: { context?: string } } | null;
  const context = body?.payload?.context;
  if (context && context !== 'production') {
    return new Response(`skipped: deploy context is ${context}`, { status: 200 });
  }

  const res = await fetch(`${SITE_URL}${INDEXNOW_PENDING_PATH}`, { headers: { 'Cache-Control': 'no-cache' } });
  if (!res.ok) {
    return new Response(`skipped: ${INDEXNOW_PENDING_PATH} answered ${res.status}`, { status: 200 });
  }
  const pending = parseIndexNowPending(await res.json().catch(() => null));
  if (!pending) {
    return new Response(`skipped: ${INDEXNOW_PENDING_PATH} is not valid`, { status: 200 });
  }

  const result = await submitIndexNow(pending.urls, { INDEXNOW_KEY: process.env.INDEXNOW_KEY });
  return new Response(JSON.stringify(result), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
