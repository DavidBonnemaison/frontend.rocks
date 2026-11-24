import { FrontendRocksDataSource } from '../../packages/mcp-server/src/data-source.js';
import { handleMcpHttpRequest } from '../../packages/mcp-server/src/http.js';

// Shared across warm Netlify Function invocations so the 1-hour in-memory TTL cache stays hot.
const sharedDataSource = new FrontendRocksDataSource({
  baseUrl: 'https://frontend.rocks',
});

export default async function handler(req: Request): Promise<Response> {
  return handleMcpHttpRequest(req, { dataSource: sharedDataSource });
}

export const config = {
  path: '/mcp',
};
