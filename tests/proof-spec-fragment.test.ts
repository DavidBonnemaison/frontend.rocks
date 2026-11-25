import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildSpecQuoteHref,
  buildTextFragment,
  encodeTextDirectiveTerm,
} from '@/lib/proof/spec/text-fragment';
import { writeSpecRecord, quoteKey } from '@/lib/proof/spec/record';
import { buildSpecFragmentUrl } from '@/lib/proof/spec-links';

describe('text-fragment', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    vi.unstubAllEnvs();
    while (tempDirs.length > 0) {
      fs.rmSync(tempDirs.pop()!, { recursive: true, force: true });
    }
  });

  it('encodes short unique 3-word quote as a single term', () => {
    const page = 'Intro text. Run oldest microtask now. Outro text.';
    const res = buildTextFragment('Run oldest microtask', 'Intro text.', page);
    expect(res).toEqual({
      fragment: ':~:text=Run%20oldest%20microtask',
      unique: true,
    });
  });

  it('encodes a 25-word quote as 5-word start and 5-word end', () => {
    const words25 = Array.from({ length: 25 }, (_, i) => `word${i + 1}`).join(' ');
    const res = buildTextFragment(words25, 'Before.', `Before. ${words25} After.`);
    expect(res).toEqual({
      fragment: ':~:text=word1%20word2%20word3%20word4%20word5,word21%20word22%20word23%20word24%20word25',
      unique: true,
    });
  });

  it('encodes hyphens as %2D and commas as %2C', () => {
    expect(encodeTextDirectiveTerm('non-normative, really')).toBe('non%2Dnormative%2C%20really');
    const res = buildTextFragment(
      'non-normative, really clear',
      '',
      'Section with non-normative, really clear rules.'
    );
    expect(res.unique).toBe(true);
    expect(res.fragment).toBe(':~:text=non%2Dnormative%2C%20really%20clear');
  });

  it('disambiguates duplicate starts with a 3-word prefix and falls back when still ambiguous', () => {
    const longQuote =
      'the user agent must perform a microtask checkpoint immediately after running any script callback now';
    const pageUniqueWithPrefix =
      `First mention: the user agent must perform something else. ` +
      `When scripts finish, ${longQuote}.`;

    const disambiguated = buildTextFragment(
      longQuote,
      'When scripts finish,',
      pageUniqueWithPrefix
    );
    expect(disambiguated.unique).toBe(true);
    expect(disambiguated.fragment).toBe(
      ':~:text=When%20scripts%20finish%2C-,the%20user%20agent%20must%20perform,after%20running%20any%20script%20callback%20now'
        .replace('after%20running%20any%20script%20callback%20now', 'running%20any%20script%20callback%20now')
    );

    const pageStillAmbiguous =
      `When scripts finish, ${longQuote}. Again, When scripts finish, ${longQuote}.`;
    const ambiguous = buildTextFragment(longQuote, 'When scripts finish,', pageStillAmbiguous);
    expect(ambiguous).toEqual({ fragment: '', unique: false });
  });

  it('preserves original typography in the encoded fragment', () => {
    const quoteOriginal = 'the event loop\u2019s queue';
    const page = `Inspect ${quoteOriginal} carefully.`;
    const res = buildTextFragment(quoteOriginal, 'Inspect', page);
    expect(res.unique).toBe(true);
    expect(res.fragment).toContain('event%20loop%E2%80%99s');
  });

  it('builds final href combining canonicalUrl, anchor, and fragment', () => {
    expect(
      buildSpecQuoteHref(
        'https://html.spec.whatwg.org/multipage/webappapis.html',
        'perform-a-microtask-checkpoint',
        ':~:text=While%20the%20event'
      )
    ).toBe(
      'https://html.spec.whatwg.org/multipage/webappapis.html#perform-a-microtask-checkpoint:~:text=While%20the%20event'
    );
  });

  it('buildSpecFragmentUrl delegates to committed record or falls back to anchor alone', () => {
    const contentDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spec-links-'));
    tempDirs.push(contentDir);
    vi.stubEnv('FRONTEND_ROCKS_CONTENT_DIR', contentDir);

    const url = 'https://html.spec.whatwg.org/multipage/webappapis.html';
    const anchor = 'perform-a-microtask-checkpoint';
    const quote = "While the event loop's microtask queue is not empty.";

    // Without record: anchor only
    expect(buildSpecFragmentUrl(url, anchor, quote)).toBe(`${url}#${anchor}`);

    // With record: anchor + stored fragment
    writeSpecRecord({
      schemaVersion: 2,
      url,
      family: 'whatwg',
      maturity: 'living-standard',
      specTitle: 'HTML Standard',
      statusText: null,
      sections: {
        [anchor]: {
          blockKind: 'algorithm',
          sectionTitle: null,
          sectionSha256: 'a'.repeat(64),
          quotes: {
            [quoteKey(quote)]: {
              quoteOriginal: 'While the event loop\u2019s microtask queue is not empty.',
              fragment: ':~:text=While%20the%20event%20loop%E2%80%99s',
              fragmentUnique: true,
              recordedOn: '2026-12-01',
            },
          },
        },
      },
    });

    expect(buildSpecFragmentUrl(url, anchor, quote)).toBe(
      `${url}#${anchor}:~:text=While%20the%20event%20loop%E2%80%99s`
    );
  });
});
