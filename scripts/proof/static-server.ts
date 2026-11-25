import fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';

export interface StaticServerOptions {
  host?: string;
  port?: number;
  headers?: (urlPath: string) => Record<string, string>;
}

export interface StaticServer {
  origin: string;
  close(): Promise<void>;
}

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
};

export async function startStaticServer(
  rootDir: string,
  opts: StaticServerOptions = {}
): Promise<StaticServer> {
  const resolvedRoot = path.resolve(rootDir);
  const host = opts.host ?? '127.0.0.1';
  const port = opts.port ?? 0;

  const server = http.createServer((req, res) => {
    const rawUrl = req.url ?? '/';
    if (rawUrl.includes('..')) {
      res.writeHead(400);
      res.end();
      return;
    }

    let pathname: string;
    try {
      pathname = decodeURIComponent(new URL(rawUrl, 'http://placeholder').pathname);
    } catch {
      res.writeHead(400);
      res.end();
      return;
    }

    if (pathname.includes('..') || pathname.includes('\0')) {
      res.writeHead(400);
      res.end();
      return;
    }

    const relativePath = (pathname.endsWith('/') ? `${pathname}index.html` : pathname).replace(
      /^\/+/,
      ''
    );
    const targetPath = path.resolve(resolvedRoot, relativePath);
    if (targetPath !== resolvedRoot && !targetPath.startsWith(`${resolvedRoot}${path.sep}`)) {
      res.writeHead(400);
      res.end();
      return;
    }

    if (!fs.existsSync(targetPath) || !fs.statSync(targetPath).isFile()) {
      res.writeHead(404);
      res.end();
      return;
    }

    const ext = path.extname(targetPath).toLowerCase();
    const contentType = MIME_TYPES[ext] ?? 'application/octet-stream';
    const extraHeaders = opts.headers ? opts.headers(pathname) : {};
    res.writeHead(200, { 'Content-Type': contentType, ...extraHeaders });
    res.end(fs.readFileSync(targetPath));
  });

  const boundPort = await new Promise<number>((resolve) => {
    server.listen(port, host, () => resolve((server.address() as AddressInfo).port));
  });

  return {
    origin: `http://${host}:${boundPort}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
