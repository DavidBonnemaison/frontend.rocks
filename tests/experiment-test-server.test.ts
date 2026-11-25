import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildExperimentFromSource } from '../scripts/proof/build-experiments';
import { startTestServer, type TestServer } from '../scripts/proof/test-server';

const FIXTURES_DIR = path.join(process.cwd(), 'tests', 'fixtures', 'experiments');

describe('dual-origin experiment test server', () => {
  const originalBuildDir = process.env.FR_PROOF_BUILD_DIR;
  let tempDir = '';
  let server: TestServer;

  beforeAll(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fr-test-server-'));
    for (const id of ['network-shim-abort', 'network-server-cors']) {
      const source = fs.readFileSync(path.join(FIXTURES_DIR, id, 'experiment.ts'), 'utf-8');
      const outcome = buildExperimentFromSource(source, id);
      expect(outcome.errors).toEqual([]);
      expect(outcome.bundle).not.toBeNull();
      fs.writeFileSync(path.join(tempDir, `${id}.json`), JSON.stringify(outcome.bundle));
    }
    process.env.FR_PROOF_BUILD_DIR = tempDir;
    server = await startTestServer();
  });

  afterAll(async () => {
    if (originalBuildDir === undefined) delete process.env.FR_PROOF_BUILD_DIR;
    else process.env.FR_PROOF_BUILD_DIR = originalBuildDir;
    if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('serves the standalone experiment page on selfOrigin', async () => {
    const res = await fetch(`${server.selfOrigin}/__exp/network-server-cors/treatment`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    const html = await res.text();
    expect(html).toContain('window.__frConfig =');
    expect(html).toContain('"standalone":true');
  });

  it('serves declared cross-origin routes with exact headers and no automatic OPTIONS', async () => {
    const openRes = await fetch(`${server.crossOrigin}/__api/network-server-cors/data-open`);
    expect(openRes.status).toBe(200);
    expect(openRes.headers.get('access-control-allow-origin')).toBe('*');

    const closedRes = await fetch(`${server.crossOrigin}/__api/network-server-cors/data-closed`);
    expect(closedRes.status).toBe(200);
    expect(closedRes.headers.get('access-control-allow-origin')).toBeNull();

    const preflight = await fetch(`${server.crossOrigin}/__api/network-server-cors/data-open`, {
      method: 'OPTIONS',
    });
    expect(preflight.status).toBe(404);
  });

  it('returns 404 or 500 for unknown routes and experiments without crashing', async () => {
    const unknownRoute = await fetch(`${server.crossOrigin}/__api/network-server-cors/missing`);
    expect(unknownRoute.status).toBe(404);

    const unknownExpApi = await fetch(`${server.crossOrigin}/__api/does-not-exist/data-open`);
    expect(unknownExpApi.status).toBe(404);

    const unknownExpPage = await fetch(`${server.selfOrigin}/__exp/does-not-exist/treatment`);
    expect([404, 500]).toContain(unknownExpPage.status);

    // Server is still alive after errors.
    const check = await fetch(`${server.crossOrigin}/__api/network-server-cors/data-open`);
    expect(check.status).toBe(200);
  });

  it('releases listening ports on close()', async () => {
    const url = `${server.selfOrigin}/__exp/network-server-cors/treatment`;
    await server.close();
    await expect(fetch(url)).rejects.toThrow();
  });
});
