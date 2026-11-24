import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

async function loadPaths() {
  vi.resetModules();
  return import('@/lib/paths');
}

describe('paths', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('defaults to the current working directory', async () => {
    vi.stubEnv('FRONTEND_ROCKS_ROOT', '');
    vi.stubEnv('FRONTEND_ROCKS_CONTENT_DIR', '');
    delete process.env.FRONTEND_ROCKS_ROOT;
    delete process.env.FRONTEND_ROCKS_CONTENT_DIR;
    const m = await loadPaths();
    expect(m.SITE_ROOT).toBe(process.cwd());
    expect(m.CONTENT_DIR).toBe(path.join(process.cwd(), 'content'));
    expect(m.PUBLIC_DIR).toBe(path.join(process.cwd(), 'public'));
  });

  it('follows FRONTEND_ROCKS_ROOT', async () => {
    vi.stubEnv('FRONTEND_ROCKS_ROOT', '/tmp/x');
    delete process.env.FRONTEND_ROCKS_CONTENT_DIR;
    const m = await loadPaths();
    expect(m.SITE_ROOT).toBe('/tmp/x');
    expect(m.CONTENT_DIR).toBe('/tmp/x/content');
    expect(m.PUBLIC_DIR).toBe('/tmp/x/public');
  });

  it('lets FRONTEND_ROCKS_CONTENT_DIR override the content directory only', async () => {
    vi.stubEnv('FRONTEND_ROCKS_ROOT', '/tmp/x');
    vi.stubEnv('FRONTEND_ROCKS_CONTENT_DIR', '/tmp/fixtures');
    const m = await loadPaths();
    expect(m.CONTENT_DIR).toBe('/tmp/fixtures');
    expect(m.PUBLIC_DIR).toBe('/tmp/x/public');
  });
});
