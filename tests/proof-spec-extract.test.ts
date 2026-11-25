import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { isUnrenderedRespec } from '@/lib/proof/spec/fetch-spec';
import {
  extractSection,
  findAnchorForQuote,
  findQuote,
} from '@/lib/proof/spec/extract-section';

const FIXTURES_DIR = path.resolve(__dirname, 'fixtures', 'specs');
const loadFixture = (name: string) => fs.readFileSync(path.join(FIXTURES_DIR, name), 'utf-8');

describe('extractSection and findQuote', () => {
  const whatwg = loadFixture('whatwg-webappapis.html');
  const csswg = loadFixture('csswg-conditional.html');
  const tc39 = loadFixture('tc39-execution-contexts.html');
  const rfc9110 = loadFixture('rfc-9110-excerpt.html');
  const rfc7932 = loadFixture('rfc-7932-excerpt.html');
  const respecAria = loadFixture('respec-wai-aria-excerpt.html');
  const respecUnrendered = loadFixture('respec-unrendered.html');

  it('detects unrendered ReSpec only on the unrendered fixture', () => {
    expect(isUnrenderedRespec(respecUnrendered)).toBe(true);
    for (const html of [whatwg, csswg, tc39, rfc9110, rfc7932, respecAria]) {
      expect(isUnrenderedRespec(html)).toBe(false);
    }
  });

  it('extracts WHATWG data-algorithm section and excludes notes', () => {
    const sec = extractSection(whatwg, 'perform-a-microtask-checkpoint');
    expect('error' in sec).toBe(false);
    if ('error' in sec) return;

    expect(sec.blockKind).toBe('algorithm');
    expect(sec.sectionTitle).toBeNull();
    expect(sec.normativeText).toContain(
      "While the event loop's microtask queue is not empty: Let oldestMicrotask be the result of dequeuing from the event loop's microtask queue."
    );
    expect(sec.normativeText).not.toContain('This might involve invoking scripted callbacks');

    // Audit fabricated paraphrase must fail with quote-not-found
    const fabricated = findQuote(
      sec,
      'While the microtask queue is not empty, pop the oldest microtask and run it.'
    );
    expect(fabricated).toEqual({ found: false, reason: 'quote-not-found' });

    // Note text must fail with quote-in-non-normative-block
    const inNote = findQuote(sec, 'This might involve invoking scripted callbacks');
    expect(inNote).toEqual({ found: false, reason: 'quote-in-non-normative-block' });

    // Case mismatch must fail
    const wrongCase = findQuote(
      sec,
      "while the event loop's microtask queue is not empty"
    );
    expect(wrongCase).toEqual({ found: false, reason: 'quote-not-found' });
  });

  it('extracts CSSWG Bikeshed heading sections and respects heading hierarchy', () => {
    const h2 = extractSection(csswg, 'container-queries');
    expect('error' in h2).toBe(false);
    if ('error' in h2) return;

    expect(h2.blockKind).toBe('heading-section');
    expect(h2.sectionTitle).toBe('Container Queries');
    expect(h2.normativeText).toContain('Size container queries allow styling elements');
    expect(h2.normativeText).not.toContain('Text in the next top-level section.');
    expect(h2.normativeText).not.toContain('container-width.html');
    expect(h2.normativeText).not.toContain('This note is non-normative');

    const h3 = extractSection(csswg, 'container-type');
    expect('error' in h3).toBe(false);
    if ('error' in h3) return;

    expect(h3.blockKind).toBe('heading-section');
    expect(h3.sectionTitle).toBe('Establishing Query Containers');
    expect(h3.normativeText).toContain('establishes an element as a query container');
    expect(h3.normativeText).not.toContain('specifies a list of query container names');
  });

  it('extracts TC39 emu-clause without emu-note or secnum prefix', () => {
    const sec = extractSection(tc39, 'sec-hostenqueuepromisejob');
    expect('error' in sec).toBe(false);
    if ('error' in sec) return;

    expect(sec.blockKind).toBe('section');
    expect(sec.sectionTitle).toBe('HostEnqueuePromiseJob ( job, realm )');
    expect(sec.sectionTitle).not.toMatch(/^\d/);
    expect(sec.normativeText).toContain('schedule the execution of job');
    expect(sec.normativeText).not.toContain('preserve FIFO ordering');
    expect(findQuote(sec, 'preserve FIFO ordering')).toEqual({
      found: false,
      reason: 'quote-in-non-normative-block',
    });
  });

  it('extracts RFC v3 section without pilcrows and matches across curly/straight quotes', () => {
    const sec = extractSection(rfc9110, 'section-9.2.2');
    expect('error' in sec).toBe(false);
    if ('error' in sec) return;

    expect(sec.blockKind).toBe('section');
    expect(sec.normativeText).not.toContain('¶');
    // Straight apostrophe in quote matches curly apostrophe in fixture
    const matchStraight = findQuote(
      sec,
      "Idempotent methods are distinguished because the request can be repeated automatically if a communication failure occurs before the client is able to read the server's response."
    );
    expect(matchStraight.found).toBe(true);

    // Curly apostrophe in quote matches straight apostrophe in WHATWG fixture
    const whatwgSec = extractSection(whatwg, 'perform-a-microtask-checkpoint');
    expect('error' in whatwgSec).toBe(false);
    if (!('error' in whatwgSec)) {
      const matchCurly = findQuote(
        whatwgSec,
        'While the event loop\u2019s microtask queue is not empty:'
      );
      expect(matchCurly.found).toBe(true);
    }
  });

  it('extracts legacy paginated RFC 7932 section across page breaks without headers or footers', () => {
    const sec = extractSection(rfc7932, 'section-1.1');
    expect('error' in sec).toBe(false);
    if ('error' in sec) return;

    expect(sec.blockKind).toBe('heading-section');
    expect(sec.sectionTitle).toBe('Purpose');
    expect(sec.normativeText).not.toContain('[Page 3]');
    expect(sec.normativeText).not.toContain('Alakuijala');
    expect(sec.normativeText).not.toContain('A compliant decoder');
    const acrossBreak = findQuote(
      sec,
      'The goal of this specification is to define a lossless compressed data format that can be decoded reliably across conforming implementations regardless of platform architecture.'
    );
    expect(acrossBreak.found).toBe(true);
  });

  it('extracts exported ReSpec section from header-wrapper heading anchor and flags non-normative sections', () => {
    const sec = extractSection(respecAria, 'x1-1-rich-internet-application-accessibility');
    expect('error' in sec).toBe(false);
    if ('error' in sec) return;

    expect(sec.blockKind).toBe('section');
    expect(sec.sectionTitle).toBe('Rich Internet Application Accessibility');
    expect(sec.nonNormativeSection).toBe(false);
    expect(
      findQuote(sec, 'Assistive technologies rely on semantic roles, states, and properties').found
    ).toBe(true);

    const informative = extractSection(respecAria, 'informative-overview');
    expect('error' in informative).toBe(false);
    if ('error' in informative) return;
    expect(informative.nonNormativeSection).toBe(true);
    expect(findQuote(informative, 'This background narrative provides context')).toEqual({
      found: false,
      reason: 'non-normative-section',
    });
  });

  it('returns anchor-not-found for missing anchors', () => {
    const err = extractSection(whatwg, 'does-not-exist');
    expect('error' in err && err.error).toBe('anchor-not-found');
  });

  it('finds smallest matching anchor via findAnchorForQuote', () => {
    const whatwgAnchors = findAnchorForQuote(
      whatwg,
      "While the event loop's microtask queue is not empty:"
    );
    expect(whatwgAnchors[0]).toBe('perform-a-microtask-checkpoint');

    const rfcAnchors = findAnchorForQuote(
      rfc9110,
      "Idempotent methods are distinguished because the request can be repeated automatically"
    );
    expect(rfcAnchors).toContain('section-9.2.2');

    const legacyRfcAnchors = findAnchorForQuote(
      rfc7932,
      'decoded reliably across conforming implementations'
    );
    expect(legacyRfcAnchors[0]).toBe('section-1.1');

    const missing = findAnchorForQuote(whatwg, 'quote that does not exist anywhere on this page');
    expect(missing).toEqual([]);
  });
});
