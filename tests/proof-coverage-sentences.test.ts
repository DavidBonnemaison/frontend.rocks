import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { extractClaimReferences, toClaimId } from '@/lib/proof/coverage/claim-refs';
import { extractSentences, VERIFIED_PLACEHOLDER } from '@/lib/proof/coverage/sentences';

const FIXTURE_PATH = path.resolve(__dirname, 'fixtures/coverage/segmentation.mdx');

describe('extractSentences and extractClaimReferences', () => {
  it('segments the canonical segmentation.mdx fixture with exact contexts, claims, skips, and absolute lines', () => {
    const raw = fs.readFileSync(FIXTURE_PATH, 'utf-8');
    const { sentences, units, errors } = extractSentences(raw, 'fixture-page');

    expect(errors).toEqual([]);

    // Sentence 1: linked prose with inline code
    expect(sentences[0]).toMatchObject({
      pageId: 'fixture-page',
      index: 0,
      text: 'Every queued microtask runs before the next task, so `Promise.then` beats `setTimeout(cb, 0)`.',
      line: 8,
      context: 'prose',
      claimRefs: ['drains'],
      skip: null,
    });

    // Sentence 2: unlinked prose
    expect(sentences[1]).toMatchObject({
      index: 1,
      text: 'Use a microtask when order matters.',
      line: 8,
      context: 'prose',
      claimRefs: [],
      skip: null,
    });

    // e.g. does not split the sentence
    expect(sentences[2]).toMatchObject({
      text: 'The engine resolves container size first, e.g. during layout.',
      line: 10,
      context: 'prose',
      claimRefs: [],
      skip: null,
    });
    expect(sentences[3]).toMatchObject({
      text: 'It then evaluates the rules.',
      line: 10,
      context: 'prose',
      claimRefs: [],
      skip: null,
    });

    // Inline <Advice> produces two advice sentences, second linked
    expect(sentences[4]).toMatchObject({
      text: 'Prefer `queueMicrotask()` for this.',
      line: 12,
      context: 'advice',
      claimRefs: [],
      skip: null,
    });
    expect(sentences[5]).toMatchObject({
      text: 'It uses the same queue as promise reactions.',
      line: 12,
      context: 'advice',
      claimRefs: ['qm-same-queue'],
      skip: null,
    });

    // Masked inline code prevents splitting inside `obj.method(). then` (2 words outside code -> too-short)
    expect(sentences[6]).toMatchObject({
      text: 'Call `obj.method(). then` chains.',
      line: 14,
      context: 'prose',
      claimRefs: [],
      skip: 'too-short',
    });

    // <C id="other-page/x"> covers two sentences -> single unit, no claim-too-long
    expect(sentences[7]).toMatchObject({
      text: 'One sentence.',
      line: 14,
      claimRefs: ['other-page/x'],
    });
    expect(sentences[8]).toMatchObject({
      text: 'Two sentences.',
      line: 14,
      claimRefs: ['other-page/x'],
    });
    expect(sentences[9]).toMatchObject({
      text: 'Three.',
      line: 14,
      claimRefs: [],
      skip: 'too-short',
    });

    const otherPageUnit = units.find((u) => u.claimRefs.includes('other-page/x'));
    expect(otherPageUnit).toBeDefined();
    expect(otherPageUnit?.sentenceIndexes).toEqual([7, 8]);
    expect(otherPageUnit?.text).toBe('One sentence. Two sentences.');

    // <Story> sentences have skip: 'story'
    const storySentences = sentences.filter((s) => s.context === 'story');
    expect(storySentences).toHaveLength(2);
    expect(storySentences.every((s) => s.skip === 'story')).toBe(true);
    expect(storySentences[0].line).toBe(17);

    // Table cells: code-only vs table prose
    const codeCell = sentences.find((s) => s.text === '`queueMicrotask`');
    expect(codeCell).toMatchObject({ context: 'table', skip: 'code-only', line: 22 });
    const descCell = sentences.find((s) => s.text === 'Runs the callback in the microtask checkpoint');
    expect(descCell).toMatchObject({ context: 'table', skip: null, line: 22 });

    // Computed component replaced by placeholder, too-short
    const computedSentence = sentences.find((s) => s.hasComputed);
    expect(computedSentence).toMatchObject({
      text: `Shipped ${VERIFIED_PLACEHOLDER}.`,
      hasComputed: true,
      skip: 'too-short',
      line: 24,
    });

    // Headings produce no sentences
    expect(sentences.some((s) => s.text.includes('TL;DR'))).toBe(false);

    // extractClaimReferences returns all three references in document order
    expect(extractClaimReferences(raw)).toEqual([
      { ref: 'drains', component: 'C', line: 8 },
      { ref: 'qm-same-queue', component: 'C', line: 12 },
      { ref: 'other-page/x', component: 'C', line: 14 },
    ]);
  });

  it('reports coverage/nested-claim when <C> is nested inside <C>', () => {
    const raw = `---\nid: nested\n---\n\n<C id="outer">Outer text <C id="inner">inner text</C> end.</C>\n`;
    const { errors } = extractSentences(raw, 'nested');
    expect(errors.some((e) => e.rule === 'coverage/nested-claim' && e.line === 5)).toBe(true);
  });

  it('reports coverage/claim-block when <C> wraps a paragraph and still checks its content', () => {
    const raw = `---\nid: block\n---\n\n<C id="a">\n\nThis paragraph is wrapped in a block claim element.\n\n</C>\n`;
    const { sentences, errors } = extractSentences(raw, 'block');
    expect(errors.some((e) => e.rule === 'coverage/claim-block' && e.line === 5)).toBe(true);
    expect(sentences).toHaveLength(1);
    expect(sentences[0].claimRefs).toEqual([]);
    expect(sentences[0].text).toBe('This paragraph is wrapped in a block claim element.');
  });

  it('reports coverage/claim-too-long when <C> touches more than two sentences', () => {
    const raw = `---\nid: long\n---\n\n<C id="a">First sentence here. Second sentence here. Third sentence here.</C>\n`;
    const { errors } = extractSentences(raw, 'long');
    expect(errors.some((e) => e.rule === 'coverage/claim-too-long' && e.line === 5)).toBe(true);
  });

  it('merges two <C> elements in the same sentence into a single ClaimUnit with both claimRefs', () => {
    const raw = `---\nid: two-claims\n---\n\n<C id="first">Microtasks drain first</C>, and <C id="second">timers run in the next task</C>.\n`;
    const { units, errors } = extractSentences(raw, 'two-claims');
    expect(errors).toEqual([]);
    expect(units).toHaveLength(1);
    expect(units[0].claimRefs).toEqual(['first', 'second']);
  });

  it('reports coverage/mdx-parse-error on invalid MDX', () => {
    const raw = `---\nid: broken\n---\n\n<C id="a">Unclosed tag\n`;
    const { sentences, units, errors } = extractSentences(raw, 'broken');
    expect(sentences).toEqual([]);
    expect(units).toEqual([]);
    expect(errors).toHaveLength(1);
    expect(errors[0].rule).toBe('coverage/mdx-parse-error');
  });

  it('extracts SpecQuote and SourceQuote references and throws on non-literal attributes', () => {
    const raw = `---\nid: refs\n---\n\n<SpecQuote claim="spec-a" />\n\n<SourceQuote claim="other/src-b" />\n`;
    expect(extractClaimReferences(raw)).toEqual([
      { ref: 'spec-a', component: 'SpecQuote', line: 5 },
      { ref: 'other/src-b', component: 'SourceQuote', line: 7 },
    ]);
    expect(toClaimId('refs', 'spec-a')).toBe('refs/spec-a');
    expect(toClaimId('refs', 'other/src-b')).toBe('other/src-b');

    const dynamicRaw = `---\nid: dyn\n---\n\n<C id={foo}>Dynamic id.</C>\n`;
    expect(() => extractClaimReferences(dynamicRaw)).toThrow(/line 5/);
  });
});
