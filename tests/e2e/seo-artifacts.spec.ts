import { test, expect } from './fixtures';
import fs from 'node:fs';
import path from 'node:path';

// Needs the full build: PR builds skip the OG images, so these tests are not tagged @smoke.

test.describe('SEO artifacts', () => {
  test('has a 1000x420 cover PNG in dist/ for every autopsy', async () => {
    const autopsyIds = fs
      .readdirSync(path.join(process.cwd(), 'content', 'autopsies'))
      .filter((f) => f.endsWith('.mdx'))
      .map((f) => f.replace(/\.mdx$/, ''));

    expect(autopsyIds.length).toBeGreaterThan(0);

    for (const id of autopsyIds) {
      const distCover = path.join(process.cwd(), 'dist/og/autopsies', `${id}-cover.png`);
      expect(fs.existsSync(distCover), `Missing ${distCover}`).toBe(true);

      const buf = fs.readFileSync(distCover);
      expect(buf.readUInt32BE(16)).toBe(1000);
      expect(buf.readUInt32BE(20)).toBe(420);
    }
  });
});
