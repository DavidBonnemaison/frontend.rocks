import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { SITE_ROOT } from '@/lib/paths';
import { getBuildCommit, getVerifierRepoLinks, PUBLIC_REPO } from '@/lib/proof/repo-links';

describe('repo-links', () => {
  it('resolves the build commit and only links paths that exist in the repository', () => {
    const commit = getBuildCommit();
    expect(commit).toMatch(/^([0-9a-f]{40}|main)$/);

    const links = getVerifierRepoLinks(commit);
    expect(links.length).toBeGreaterThan(0);

    for (const link of links) {
      expect(fs.existsSync(path.join(SITE_ROOT, link.repoPath)), link.repoPath).toBe(true);
      expect(link.href.startsWith(PUBLIC_REPO)).toBe(true);
      if (link.kind !== 'actions') {
        expect(link.href).toContain(`/${commit}/`);
      }
    }
  });
});
