import { describe, expect, it } from 'vitest';
import {
  buildIndexNowPending,
  collectIndexNowUrls,
  mapChangedFileToUrls,
  parseIndexNowPending,
  selectIndexNowUrls,
  submitIndexNow,
} from '../src/lib/indexnow';

describe('IndexNow', () => {
  it('maps changed git diff files to canonical frontend.rocks URLs', () => {
    expect(mapChangedFileToUrls('content/concepts/css-stacking-context.mdx')).toEqual([
      'https://frontend.rocks/concepts/css-stacking-context/',
    ]);
    expect(mapChangedFileToUrls('content/autopsies/zindex-9999-tooltip-war.mdx')).toEqual([
      'https://frontend.rocks/autopsies/zindex-9999-tooltip-war/',
    ]);
    expect(mapChangedFileToUrls('content/digests/2026-w46.json')).toEqual([
      'https://frontend.rocks/digest/',
    ]);
    expect(mapChangedFileToUrls('content/labs/css-stacking-context.json')).toEqual([
      'https://frontend.rocks/embed/lab/css-stacking-context/',
    ]);
    expect(mapChangedFileToUrls('src/config/symptoms.ts')).toEqual([
      'https://frontend.rocks/symptoms/',
    ]);
    expect(mapChangedFileToUrls('README.md')).toEqual([]);

    expect(
      collectIndexNowUrls([
        'content/concepts/css-stacking-context.mdx',
        'content/concepts/css-stacking-context.mdx',
        'src/config/symptoms.ts',
        'package.json',
      ])
    ).toEqual([
      'https://frontend.rocks/concepts/css-stacking-context/',
      'https://frontend.rocks/symptoms/',
    ]);
  });

  it('skips gracefully without error when the IndexNow key is missing', async () => {
    const indexRes = await submitIndexNow(['https://frontend.rocks/concepts/css-stacking-context/'], {});
    expect(indexRes).toEqual({ skipped: true, reason: 'INDEXNOW_KEY not set' });
  });

  it('skips when there is no URL to send', async () => {
    const indexRes = await submitIndexNow([], { INDEXNOW_KEY: 'k' });
    expect(indexRes).toEqual({ skipped: true, reason: 'No changed content URLs' });
  });

  it('submits the URL list to IndexNow when the key is set', async () => {
    const calls: Array<{ url: string; body: string }> = [];
    const mockFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), body: String(init?.body) });
      return new Response('', { status: 200 });
    }) as typeof fetch;
    const res = await submitIndexNow(
      ['https://frontend.rocks/concepts/css-stacking-context/'],
      { INDEXNOW_KEY: 'k' },
      mockFetch
    );
    expect(res).toEqual({ skipped: false, submittedCount: 1 });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://api.indexnow.org/indexnow');
    expect(JSON.parse(calls[0].body).urlList).toEqual([
      'https://frontend.rocks/concepts/css-stacking-context/',
    ]);
  });

  it('throws when IndexNow answers with an error', async () => {
    const failing = (async () => new Response('nope', { status: 422 })) as typeof fetch;
    await expect(
      submitIndexNow(['https://frontend.rocks/'], { INDEXNOW_KEY: 'k' }, failing)
    ).rejects.toThrow('IndexNow submission failed (422)');
  });
});

describe('selectIndexNowUrls', () => {
  it('keeps published URLs and pages that were published before and are noindex now', () => {
    expect(
      selectIndexNowUrls({
        changedUrls: [
          'https://frontend.rocks/concepts/live/',
          'https://frontend.rocks/concepts/demoted/',
          'https://frontend.rocks/concepts/never-published/',
        ],
        publishedUrls: ['https://frontend.rocks/concepts/live/'],
        previouslyPublishedUrls: ['https://frontend.rocks/concepts/demoted/'],
      })
    ).toEqual(['https://frontend.rocks/concepts/demoted/', 'https://frontend.rocks/concepts/live/']);
  });
});

describe('buildIndexNowPending', () => {
  const published = [
    'https://frontend.rocks/',
    'https://frontend.rocks/concepts/live/',
  ];

  it('sends every published URL when there is no deployed commit', () => {
    const calls: string[][] = [];
    const pending = buildIndexNowPending({
      commit: 'abc',
      deployedCommit: '',
      publishedUrls: published,
      git: (args) => {
        calls.push(args);
        return '';
      },
    });
    expect(pending).toEqual({ commit: 'abc', urls: [...published].sort() });
    expect(calls).toEqual([]);
  });

  it('sends every published URL when the diff fails', () => {
    const pending = buildIndexNowPending({
      commit: 'abc',
      deployedCommit: 'old',
      publishedUrls: published,
      git: () => {
        throw new Error('bad revision');
      },
    });
    expect(pending.urls).toEqual([...published].sort());
  });

  it('sends the changed published pages and the pages that left the index', () => {
    const git = (args: string[]): string => {
      if (args[0] === 'diff') {
        return [
          'content/concepts/live.mdx',
          'content/concepts/demoted.mdx',
          'content/concepts/draft.mdx',
          'content/concepts/brand-new.mdx',
          'package.json',
        ].join('\n');
      }
      const target = args[1];
      if (target === 'old:content/concepts/demoted.mdx') return 'proof_status: proven\n';
      if (target === 'old:content/concepts/draft.mdx') return 'proof_status: unverified\n';
      throw new Error('path does not exist in old');
    };
    const pending = buildIndexNowPending({
      commit: 'new',
      deployedCommit: 'old',
      publishedUrls: published,
      git,
    });
    expect(pending).toEqual({
      commit: 'new',
      urls: [
        'https://frontend.rocks/concepts/demoted/',
        'https://frontend.rocks/concepts/live/',
      ],
    });
  });
});

describe('parseIndexNowPending', () => {
  it('accepts the build file shape and rejects anything else', () => {
    expect(parseIndexNowPending({ commit: 'a', urls: ['u'] })).toEqual({ commit: 'a', urls: ['u'] });
    expect(parseIndexNowPending(null)).toBeNull();
    expect(parseIndexNowPending({ commit: 'a', urls: [1] })).toBeNull();
    expect(parseIndexNowPending({ urls: [] })).toBeNull();
  });
});
