import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startStaticServer, type StaticServer } from '../scripts/proof/static-server';

function rawHttpGet(urlStr: string): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.get(urlStr, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => {
        resolve({ status: res.statusCode ?? 0, headers: res.headers, body });
      });
    });
    req.on('error', reject);
  });
}

describe('startStaticServer', () => {
  let tempDir = '';
  let server: StaticServer;

  beforeAll(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fr-static-server-'));
    fs.writeFileSync(path.join(tempDir, 'index.html'), '<h1>index</h1>');
    fs.writeFileSync(path.join(tempDir, 'a.html'), '<p>hello</p>');
    fs.writeFileSync(path.join(tempDir, 'b.json'), '{"ok":true}');
    server = await startStaticServer(tempDir, {
      headers: (urlPath) => ({ 'X-Served-Path': urlPath }),
    });
  });

  afterAll(async () => {
    if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('serves html, json, and directory index with matching Content-Type and custom headers', async () => {
    const htmlRes = await fetch(`${server.origin}/a.html`);
    expect(htmlRes.status).toBe(200);
    expect(htmlRes.headers.get('content-type')).toContain('text/html');
    expect(htmlRes.headers.get('x-served-path')).toBe('/a.html');
    expect(await htmlRes.text()).toBe('<p>hello</p>');

    const jsonRes = await fetch(`${server.origin}/b.json`);
    expect(jsonRes.status).toBe(200);
    expect(jsonRes.headers.get('content-type')).toContain('application/json');
    expect(await jsonRes.text()).toBe('{"ok":true}');

    const indexRes = await fetch(`${server.origin}/`);
    expect(indexRes.status).toBe(200);
    expect(await indexRes.text()).toBe('<h1>index</h1>');
  });

  it('rejects path traversal and returns 404 for missing files', async () => {
    // Use node:http directly so the URL is not normalized before hitting the server.
    const traversal = await rawHttpGet(`${server.origin}/../package.json`);
    expect([400, 404]).toContain(traversal.status);

    const encodedTraversal = await rawHttpGet(`${server.origin}/%2e%2e/package.json`);
    expect([400, 404]).toContain(encodedTraversal.status);

    const missing = await fetch(`${server.origin}/absent.css`);
    expect(missing.status).toBe(404);
  });

  it('closes cleanly and releases the port', async () => {
    const url = `${server.origin}/a.html`;
    await server.close();
    await expect(fetch(url)).rejects.toThrow();
  });
});
