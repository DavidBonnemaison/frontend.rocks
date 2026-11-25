import fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { loadExperimentBundle } from '../../src/lib/proof/experiment-bundles';
import { SITE_ROOT } from '../../src/lib/paths';
import { buildExperimentDocument } from '../../src/lib/proof/runtime/document';
import type { NetworkRoute } from '../../src/lib/proof/define-experiment';

export interface TestServer {
  selfOrigin: string; // http://127.0.0.1:<port>
  crossOrigin: string; // http://localhost:<port2>
  close(): Promise<void>;
}

function decodeParams(raw: string | null): Record<string, number | boolean | string> {
  if (!raw) return {};
  return JSON.parse(Buffer.from(raw, 'base64url').toString('utf-8')) as Record<
    string,
    number | boolean | string
  >;
}

export function encodeParams(params: Record<string, number | boolean | string>): string {
  return Buffer.from(JSON.stringify(params), 'utf-8').toString('base64url');
}

function listen(server: http.Server, host?: string): Promise<number> {
  return new Promise((resolve) =>
    server.listen(0, host, () => resolve((server.address() as AddressInfo).port))
  );
}

export async function startTestServer(): Promise<TestServer> {
  let selfOrigin = '';
  let crossOrigin = '';

  const handle =
    (originKind: 'self' | 'cross') => (req: http.IncomingMessage, res: http.ServerResponse) => {
      const url = new URL(req.url ?? '/', 'http://placeholder');
      // 1. Standalone Experiment page (self origin only): /__exp/<id>/<variant>?params=<b64>&mutated=1
      const page = url.pathname.match(/^\/__exp\/([a-z0-9-]+)\/(treatment|control|blank)$/);
      if (originKind === 'self' && page) {
        try {
          const bundle = loadExperimentBundle(page[1]);
          const html = buildExperimentDocument(
            bundle,
            page[2] as 'treatment' | 'control' | 'blank',
            decodeParams(url.searchParams.get('params')),
            {
              runId: 'standalone',
              standalone: true,
              mutated: url.searchParams.get('mutated') === '1',
              origins: { self: selfOrigin, cross: crossOrigin },
              parentOrigin: null,
              vendorBaseUrl: selfOrigin,
            }
          );
          res.writeHead(200, {
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': 'no-store',
          });
          res.end(html);
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'text/plain' });
          res.end(String(err));
        }
        return;
      }

      // 2. Local vendor bundle (self origin only).
      if (originKind === 'self' && url.pathname === '/vendor/react.js') {
        const file = path.join(SITE_ROOT, '.proof-build', 'vendor', 'react.js');
        if (!fs.existsSync(file)) {
          res.writeHead(404);
          res.end();
          return;
        }
        res.writeHead(200, {
          'Content-Type': 'text/javascript; charset=utf-8',
          'Cache-Control': 'no-store',
        });
        res.end(fs.readFileSync(file));
        return;
      }

      // 3. Experiment-declared API routes: /__api/<experiment-id>/<path...>
      // Never auto-responds to OPTIONS preflights unless declared explicitly.
      const api = url.pathname.match(/^\/__api\/([a-z0-9-]+)(\/.*)$/);
      if (api) {
        let routes: NetworkRoute[] = [];
        try {
          routes = (loadExperimentBundle(api[1]).network?.routes ?? []) as NetworkRoute[];
        } catch {
          // Handled as 404 below.
        }
        const route = routes.find(
          (r) => r.origin === originKind && r.method === req.method && r.path === api[2]
        );
        if (!route) {
          res.writeHead(404);
          res.end();
          return;
        }
        setTimeout(() => {
          res.writeHead(route.status, route.headers ?? {});
          res.end(route.body ?? undefined);
        }, route.delayMs ?? 0);
        return;
      }

      res.writeHead(404);
      res.end();
    };

  const selfServer = http.createServer(handle('self'));
  const crossServer = http.createServer(handle('cross'));
  const selfPort = await listen(selfServer, '127.0.0.1');
  // Listen on all interfaces for crossServer because "localhost" may resolve to ::1.
  const crossPort = await listen(crossServer);
  selfOrigin = `http://127.0.0.1:${selfPort}`;
  crossOrigin = `http://localhost:${crossPort}`;

  return {
    selfOrigin,
    crossOrigin,
    close: () =>
      Promise.all([
        new Promise<void>((r) => selfServer.close(() => r())),
        new Promise<void>((r) => crossServer.close(() => r())),
      ]).then(() => undefined),
  };
}
