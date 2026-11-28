import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildRedirectsFile, validateRedirectTargets } from '@/lib/redirects/build';
import { RedirectsFileSchema } from '@/lib/redirects/schema';
import { buildIndexNowPending } from '@/lib/indexnow';
import { generateRedirectsFile } from '../scripts/build-redirects';

describe('redirects builder', () => {
  it('sorts rules deterministically by from path and formats Netlify _redirects', () => {
    const out = buildRedirectsFile([
      {
        fileName: 'b.json',
        data: {
          source: 'b',
          rules: [
            { from: '/concepts/z-old/', to: '/concepts/z-new/', status: 301 },
            { from: '/concepts/a-gone/', to: '/gone/', status: 410 },
          ],
        },
      },
      {
        fileName: 'a.json',
        data: {
          source: 'a',
          rules: [{ from: '/concepts/m-old', to: '/concepts/m-new/', status: 301 }],
        },
      },
    ]);

    expect(out).toBe(
      [
        '/concepts/a-gone/ /gone/ 410',
        '/concepts/m-old /concepts/m-new/ 301',
        '/concepts/z-old/ /concepts/z-new/ 301',
      ].join('\n') + '\n',
    );
  });

  it('is idempotent regardless of input file order', () => {
    const f1 = {
      fileName: 'one.json',
      data: {
        source: 'one',
        rules: [{ from: '/concepts/foo/', to: '/concepts/bar/', status: 301 as const }],
      },
    };
    const f2 = {
      fileName: 'two.json',
      data: {
        source: 'two',
        rules: [{ from: '/concepts/baz/', to: '/gone/', status: 410 as const }],
      },
    };

    expect(buildRedirectsFile([f1, f2])).toBe(buildRedirectsFile([f2, f1]));
  });

  it('throws with both file names when two files declare the same from path', () => {
    expect(() =>
      buildRedirectsFile([
        {
          fileName: 'recertification.json',
          data: {
            source: 'recertification',
            rules: [{ from: '/concepts/dup/', to: '/concepts/a/', status: 301 }],
          },
        },
        {
          fileName: 'manual.json',
          data: {
            source: 'manual',
            rules: [{ from: '/concepts/dup/', to: '/concepts/b/', status: 301 }],
          },
        },
      ]),
    ).toThrow(/recertification\.json.*manual\.json/);
  });

  it('validates 301 targets against known concepts and static routes', () => {
    const files = [
      {
        fileName: 'recertification.json',
        data: RedirectsFileSchema.parse({
          source: 'recertification',
          rules: [
            { from: '/concepts/old/', to: '/concepts/live/', status: 301 },
            { from: '/concepts/old.md', to: '/concepts/live.md', status: 301 },
            { from: '/concepts/missing/', to: '/concepts/nope/', status: 301 },
            { from: '/concepts/gone/', to: '/gone/', status: 410 },
          ],
        }),
      },
    ];

    const errors = validateRedirectTargets(files, {
      conceptIds: new Set(['live']),
    });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('nope');
  });

  it('writes public/_redirects from a directory of JSON files', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fr-redirects-'));
    try {
      const redirectsDir = path.join(tmp, 'redirects');
      fs.mkdirSync(redirectsDir, { recursive: true });
      fs.writeFileSync(
        path.join(redirectsDir, 'recertification.json'),
        JSON.stringify({
          source: 'recertification',
          rules: [
            { from: '/concepts/old/', to: '/concepts/new/', status: 301 },
            { from: '/concepts/dead/', to: '/gone/', status: 410 },
          ],
        }),
      );
      const outFile = path.join(tmp, '_redirects');
      const res = generateRedirectsFile({ redirectsDir, outFile });
      expect(res.ruleCount).toBe(2);
      expect(res.fileCount).toBe(1);
      expect(fs.readFileSync(outFile, 'utf-8')).toBe(
        '/concepts/dead/ /gone/ 410\n/concepts/old/ /concepts/new/ 301\n',
      );
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('includes modified redirect from paths in IndexNow pending URLs', () => {
    const pending = buildIndexNowPending({
      commit: 'abc1234',
      deployedCommit: 'def5678',
      publishedUrls: ['https://frontend.rocks/concepts/target/'],
      git: (args) => {
        if (args[0] === 'diff') {
          return 'content/redirects/recertification.json\n';
        }
        if (args[0] === 'show' && args[1] === 'HEAD:content/redirects/recertification.json') {
          return JSON.stringify({
            source: 'recertification',
            rules: [
              { from: '/concepts/old-slug/', to: '/concepts/target/', status: 301 },
              { from: '/concepts/deleted-slug/', to: '/gone/', status: 410 },
              { from: '/legacy/*', to: '/gone/', status: 410 },
            ],
          });
        }
        return '';
      },
    });

    expect(pending.urls).toEqual([
      'https://frontend.rocks/concepts/deleted-slug/',
      'https://frontend.rocks/concepts/old-slug/',
    ]);
  });
});
