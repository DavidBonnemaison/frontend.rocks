import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import type {
  FrontendRocksDataSource,
  FrontendRocksDataSourceOptions,
} from './data-source.js';
import {
  MCP_SERVER_NAME,
  MCP_SERVER_VERSION,
  createFrontendRocksMcpServer,
} from './server.js';

export const MCP_HTTP_ENDPOINT = 'https://frontend.rocks/mcp';

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers':
    'Content-Type, Accept, Mcp-Session-Id, Mcp-Protocol-Version, Last-Event-ID',
};

function withCorsHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(CORS_HEADERS)) {
    if (!headers.has(key)) {
      headers.set(key, value);
    }
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export interface HandleMcpHttpRequestOptions extends FrontendRocksDataSourceOptions {
  dataSource?: FrontendRocksDataSource;
}

/**
 * Stateless Web Standards Streamable HTTP handler for `@frontend-rocks/mcp`.
 * Compatible with Netlify Functions v2, Cloudflare Workers, Deno, Bun, and Node 20+.
 */
export async function handleMcpHttpRequest(
  req: Request,
  options: HandleMcpHttpRequestOptions = {}
): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: CORS_HEADERS,
    });
  }

  if (req.method === 'GET') {
    return new Response(
      JSON.stringify(
        {
          name: MCP_SERVER_NAME,
          version: MCP_SERVER_VERSION,
          transport: 'streamable-http',
          stateless: true,
          endpoint: MCP_HTTP_ENDPOINT,
          docs: 'https://frontend.rocks/agents/',
          tools: [
            'diagnose_symptom',
            'get_concept_internals',
            'check_pattern_obsolescence',
            'find_related_autopsy',
          ],
        },
        null,
        2
      ),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'public, max-age=300',
          ...CORS_HEADERS,
        },
      }
    );
  }

  if (req.method === 'DELETE') {
    return new Response(null, {
      status: 204,
      headers: CORS_HEADERS,
    });
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({
        jsonrpc: '2.0',
        error: {
          code: -32000,
          message: `Method ${req.method} not allowed. Use POST for MCP JSON-RPC requests.`,
        },
        id: null,
      }),
      {
        status: 405,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          Allow: 'GET, POST, DELETE, OPTIONS',
          ...CORS_HEADERS,
        },
      }
    );
  }

  const { server } = createFrontendRocksMcpServer(options);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  try {
    await server.connect(transport);
    const response = await transport.handleRequest(req);
    return withCorsHeaders(response);
  } finally {
    await transport.close().catch(() => {});
    await server.close().catch(() => {});
  }
}
