import { execSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

const GENERATED = [
  /^public\/(llms(-full)?\.txt|graph\.json|rss\.xml|robots\.txt|sitemap\.xml|search-index\.json|audit-rules\.json|build-info\.json|indexnow-pending\.json|map-layout\.json)$/,
  /^public\/(concepts|autopsies|vs|og|assets)\//,
  /^packages\/public-skill\/references\/audit-catalog\.md$/,
];

describe('repository hygiene', () => {
  it('does not track generated artifacts', () => {
    const tracked = execSync('git ls-files', { encoding: 'utf-8' }).split('\n');
    const offenders = tracked.filter((f) => GENERATED.some((re) => re.test(f)));
    expect(offenders).toEqual([]);
  });
});
