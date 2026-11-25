import { SERVER_EVENTS, serializeEventPath, type ServerEvent } from '../../../src/lib/analytics-events';

/**
 * Counts a server-side event in GoatCounter.
 * No-op without GOATCOUNTER_WRITE_TOKEN and GOATCOUNTER_SITE.
 * Never throws: a counting failure must not break the caller (e.g. MCP tool calls).
 */
export async function countServerEvent(
  event: ServerEvent,
  target?: string,
  opts: { fetchImpl?: typeof fetch } = {},
): Promise<void> {
  const token = process.env.GOATCOUNTER_WRITE_TOKEN;
  const site = process.env.GOATCOUNTER_SITE;
  if (!token || !site || !(SERVER_EVENTS as readonly string[]).includes(event)) return;

  const path = serializeEventPath(event, target);
  try {
    await (opts.fetchImpl ?? fetch)(`https://${site}.goatcounter.com/api/v0/count`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        no_sessions: true,
        hits: [{ path, title: event, event: true }],
      }),
      signal: AbortSignal.timeout(1000),
    });
  } catch {
    // Intentionally silent: analytics failures never affect server responses.
  }
}
