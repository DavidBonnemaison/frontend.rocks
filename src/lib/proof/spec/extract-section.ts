import * as cheerio from 'cheerio';
import type { AnyNode, Element } from 'domhandler';
import type { SpecFamily } from './domains';
import {
  DECORATIVE_SELECTORS,
  NON_NORMATIVE_SELECTORS,
  RFC_DECORATIVE_SELECTORS,
  cloneWithout,
  nodeToText,
  nodeToTextWithMarkers,
} from './html-text';
import { normalizeSpecText } from './normalize';

export type BlockKind =
  | 'section'
  | 'heading-section'
  | 'algorithm'
  | 'enclosing-section'
  | 'element'
  | 'definition-table';

export interface ExtractedSection {
  anchor: string;
  blockKind: BlockKind;
  sectionTitle: string | null;
  /** Normative text, unnormalized (raw whitespace and typography preserved). */
  normativeRaw: string;
  /** Normative text after normalizeSpecText. */
  normativeText: string;
  /** Full block text including notes/examples, normalized. */
  fullText: string;
  nonNormativeSection: boolean;
}

export type ExtractError = { error: 'anchor-not-found'; message: string };

export interface ExtractSectionOptions {
  family?: SpecFamily;
}

const SECTION_TAGS = new Set(['section', 'emu-clause', 'emu-annex', 'emu-intro']);
const NON_NORMATIVE_SECTION_RE = /this section is (?:non-normative|not normative)/i;

function cssEscapeAttr(v: string): string {
  return v.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function headingLevel(name: string): number | null {
  const m = /^h([1-6])$/.exec(name);
  return m ? Number(m[1]) : null;
}

function legacyRfcSpanLevel($: cheerio.CheerioAPI, el: Element): number | null {
  if (el.name !== 'span') return null;
  const cls = $(el).attr('class') ?? '';
  const m = /\bh([1-6])\b/.exec(cls);
  return m ? Number(m[1]) : null;
}

function collectHeadingRun($: cheerio.CheerioAPI, heading: Element): AnyNode[] {
  const level = headingLevel(heading.name)!;
  const run: AnyNode[] = [heading];
  let cur = heading.nextSibling;
  while (cur) {
    if (cur.type === 'tag') {
      const el = cur as Element;
      const l = headingLevel(el.name);
      if (l !== null && l <= level) break;
      const nested = $(el)
        .find('h1,h2,h3,h4,h5,h6')
        .toArray()
        .some((h) => (headingLevel(h.name) ?? 7) <= level);
      if (nested) break;
    }
    run.push(cur);
    cur = cur.nextSibling;
  }
  return run;
}

function resolveHeadingBlock(
  $: cheerio.CheerioAPI,
  heading: Element
): { blockNodes: AnyNode[]; blockKind: BlockKind } {
  const parent = heading.parent;
  if (parent && parent.type === 'tag') {
    const parentEl = parent as Element;
    if (parentEl.name === 'section') {
      const firstHeading = $(parentEl).find('h1,h2,h3,h4,h5,h6').first()[0];
      if (firstHeading === heading) {
        return { blockNodes: [parentEl], blockKind: 'section' };
      }
    }
    if (parentEl.name === 'div' && $(parentEl).hasClass('header-wrapper')) {
      const grandParent = parentEl.parent;
      if (
        grandParent &&
        grandParent.type === 'tag' &&
        (grandParent as Element).name === 'section' &&
        $(grandParent).children().first()[0] === parentEl
      ) {
        return { blockNodes: [grandParent], blockKind: 'section' };
      }
    }
  }
  return { blockNodes: collectHeadingRun($, heading), blockKind: 'heading-section' };
}

function extractHeadingTitle($: cheerio.CheerioAPI, heading: Element, decorativeSel: string): string | null {
  const cleaned = cloneWithout($, $(heading), decorativeSel);
  const text = normalizeSpecText(nodeToText(cleaned.toArray()));
  return text.length > 0 ? text : null;
}

function extractLegacyRfcSection(
  $: cheerio.CheerioAPI,
  anchor: string,
  targetSpan: Element
): ExtractedSection {
  const targetLevel = legacyRfcSpanLevel($, targetSpan)!;
  const titleClone = $(targetSpan).clone();
  titleClone.find('a.selflink').remove();
  const rawTitle = nodeToText(titleClone.toArray()).replace(/^\s*\.?\s*/, '');
  const sectionTitle = normalizeSpecText(rawTitle) || null;

  const sliceBody = (removeNonNormative: boolean): string => {
    const bodyRoot: cheerio.Cheerio<AnyNode> = $('body').length > 0 ? $('body') : $.root();
    const bodyClone = bodyRoot.clone();
    const sel = removeNonNormative
      ? `${DECORATIVE_SELECTORS}, ${RFC_DECORATIVE_SELECTORS}, ${NON_NORMATIVE_SELECTORS}`
      : `${DECORATIVE_SELECTORS}, ${RFC_DECORATIVE_SELECTORS}`;
    bodyClone.find(sel).remove();

    const headingSpans = bodyClone
      .find('span.h1, span.h2, span.h3, span.h4, span.h5, span.h6')
      .toArray()
      .filter((s) => $(s).find('a.selflink[id]').length > 0) as Element[];

    const startIdx = headingSpans.findIndex(
      (s) => $(s).find(`a.selflink[id="${cssEscapeAttr(anchor)}"]`).length > 0
    );
    if (startIdx === -1) return '';

    const startSpan = headingSpans[startIdx];
    let endSpan: Element | null = null;
    for (let i = startIdx + 1; i < headingSpans.length; i++) {
      const lvl = legacyRfcSpanLevel($, headingSpans[i]);
      if (lvl !== null && lvl <= targetLevel) {
        endSpan = headingSpans[i];
        break;
      }
    }

    const marked = new Set<AnyNode>([startSpan]);
    if (endSpan) marked.add(endSpan);
    const skip = new Set<AnyNode>([startSpan]);

    const { text, offsets } = nodeToTextWithMarkers(bodyClone.toArray(), marked, skip);
    const startOffset = offsets.get(startSpan) ?? 0;
    const endOffset = endSpan ? (offsets.get(endSpan) ?? text.length) : text.length;
    return text.slice(startOffset, endOffset);
  };

  const normativeRaw = sliceBody(true);
  const normativeText = normalizeSpecText(normativeRaw);
  const fullText = normalizeSpecText(sliceBody(false));
  const nonNormativeSection = NON_NORMATIVE_SECTION_RE.test(normativeText.slice(0, 400));

  return {
    anchor,
    blockKind: 'heading-section',
    sectionTitle,
    normativeRaw,
    normativeText,
    fullText,
    nonNormativeSection,
  };
}

function findEnclosingHeading($: cheerio.CheerioAPI, el: Element): Element | null {
  let cur: Element | null = el;
  while (cur && cur.parent && cur.parent.type === 'tag') {
    let sib = cur.prev;
    while (sib) {
      if (sib.type === 'tag') {
        const sibEl = sib as Element;
        if (headingLevel(sibEl.name) !== null) {
          return sibEl;
        }
        if (sibEl.name === 'div' && $(sibEl).hasClass('header-wrapper')) {
          const h = $(sibEl).find('h1,h2,h3,h4,h5,h6').first()[0];
          if (h) return h as Element;
        }
      }
      sib = sib.prev;
    }
    cur = cur.parent as Element;
  }
  return null;
}

export function extractSectionFromCheerio(
  $: cheerio.CheerioAPI,
  anchor: string,
  options: ExtractSectionOptions = {}
): ExtractedSection | ExtractError {
  const escaped = cssEscapeAttr(anchor);
  let $el = $(`[id="${escaped}"]`).first();
  if ($el.length === 0) {
    $el = $(`a[name="${escaped}"]`).first();
  }
  if ($el.length === 0) {
    return { error: 'anchor-not-found', message: `Anchor "#${anchor}" not found in specification.` };
  }

  const el = $el[0] as Element;
  const family = options.family;

  // Rule 1b: legacy paginated RFC format (no <section id="section-...">).
  if (
    (family === undefined || family === 'rfc') &&
    $('section[id^="section-"]').length === 0 &&
    el.name === 'a' &&
    $el.hasClass('selflink') &&
    el.parent &&
    el.parent.type === 'tag' &&
    legacyRfcSpanLevel($, el.parent as Element) !== null
  ) {
    return extractLegacyRfcSection($, anchor, el.parent as Element);
  }

  const decorativeSel =
    family === 'rfc' ? `${DECORATIVE_SELECTORS}, ${RFC_DECORATIVE_SELECTORS}` : DECORATIVE_SELECTORS;

  let blockNodes: AnyNode[];
  let blockKind: BlockKind;
  let headingForTitle: Element | null = null;

  if (SECTION_TAGS.has(el.name)) {
    // Rule 2
    blockNodes = [el];
    blockKind = 'section';
  } else if (headingLevel(el.name) !== null) {
    // Rule 3
    const resolved = resolveHeadingBlock($, el);
    blockNodes = resolved.blockNodes;
    blockKind = resolved.blockKind;
    headingForTitle = el;
  } else {
    // Rule 4
    const algo = $el.closest('[data-algorithm]');
    if (algo.length > 0) {
      blockNodes = [algo[0]];
      blockKind = 'algorithm';
    } else {
      const container = $el.closest('emu-clause, table.def, table.propdef, dl.domintro');
      if (container.length > 0) {
        const containerEl = container[0] as Element;
        blockNodes = [containerEl];
        blockKind =
          containerEl.name === 'emu-clause'
            ? 'section'
            : containerEl.name === 'table'
              ? 'definition-table'
              : 'element';
      } else {
        const enclosing = findEnclosingHeading($, el);
        if (enclosing) {
          const resolved = resolveHeadingBlock($, enclosing);
          blockNodes = resolved.blockNodes;
          blockKind = 'enclosing-section';
          headingForTitle = enclosing;
        } else {
          const closestLeaf = $el.closest('p, li, dd, td');
          blockNodes = [closestLeaf.length > 0 ? closestLeaf[0] : el];
          blockKind = 'element';
        }
      }
    }
  }

  // Rule 5: sectionTitle
  if (!headingForTitle) {
    const firstBlock = blockNodes[0];
    if (firstBlock && firstBlock.type === 'tag' && headingLevel((firstBlock as Element).name) !== null) {
      headingForTitle = firstBlock as Element;
    } else {
      const desc = $(blockNodes).find('h1,h2,h3,h4,h5,h6').first()[0];
      if (desc && desc.type === 'tag') {
        headingForTitle = desc as Element;
      }
    }
  }
  const sectionTitle = headingForTitle ? extractHeadingTitle($, headingForTitle, decorativeSel) : null;

  // Rules 6 & 8: normative vs full text
  const $block = $(blockNodes);
  const normativeNodes = cloneWithout($, $block, `${decorativeSel}, ${NON_NORMATIVE_SELECTORS}`).toArray();
  const fullNodes = cloneWithout($, $block, decorativeSel).toArray();

  const normativeRaw = nodeToText(normativeNodes);
  const normativeText = normalizeSpecText(normativeRaw);
  const fullText = normalizeSpecText(nodeToText(fullNodes));

  // Rule 7
  const nonNormativeSection = NON_NORMATIVE_SECTION_RE.test(normativeText.slice(0, 400));

  return {
    anchor,
    blockKind,
    sectionTitle,
    normativeRaw,
    normativeText,
    fullText,
    nonNormativeSection,
  };
}

export function extractSection(
  html: string,
  anchor: string,
  options: ExtractSectionOptions = {}
): ExtractedSection | ExtractError {
  const $ = cheerio.load(html);
  return extractSectionFromCheerio($, anchor, options);
}

export type QuoteMatch =
  | { found: true; start: number; end: number }
  | { found: false; reason: 'quote-not-found' | 'quote-in-non-normative-block' | 'non-normative-section' };

export function findQuote(section: ExtractedSection, quote: string): QuoteMatch {
  if (section.nonNormativeSection) return { found: false, reason: 'non-normative-section' };
  const q = normalizeSpecText(quote);
  if (!q) return { found: false, reason: 'quote-not-found' };
  const start = section.normativeText.indexOf(q);
  if (start !== -1) return { found: true, start, end: start + q.length };
  if (section.fullText.includes(q)) return { found: false, reason: 'quote-in-non-normative-block' };
  return { found: false, reason: 'quote-not-found' };
}

/** Extracts full page text (including notes, with decorative elements removed) in original typography. */
export function extractPageTextOriginal($: cheerio.CheerioAPI, family?: SpecFamily): string {
  const decorativeSel =
    family === 'rfc' ? `${DECORATIVE_SELECTORS}, ${RFC_DECORATIVE_SELECTORS}` : DECORATIVE_SELECTORS;
  const $root = $('body').length > 0 ? $('body') : $.root();
  const cleaned = cloneWithout($, $root, decorativeSel);
  return nodeToText(cleaned.toArray()).replace(/\s+/g, ' ').trim();
}

/** Extracts specTitle (first h1, else <title>) and W3C TR statusText from a loaded spec page. */
export function extractSpecPageMeta(
  $: cheerio.CheerioAPI,
  html: string,
  family: SpecFamily
): { specTitle: string | null; statusText: string | null } {
  const decorativeSel =
    family === 'rfc' ? `${DECORATIVE_SELECTORS}, ${RFC_DECORATIVE_SELECTORS}` : DECORATIVE_SELECTORS;
  let specTitle: string | null = null;
  const firstH1 = $('h1').first();
  if (firstH1.length > 0) {
    const cleaned = cloneWithout($, firstH1, decorativeSel);
    const t = normalizeSpecText(nodeToText(cleaned.toArray()));
    if (t) specTitle = t;
  }
  if (!specTitle) {
    const titleText = normalizeSpecText($('title').first().text());
    if (titleText) specTitle = titleText;
  }

  let statusText: string | null = null;
  if (family === 'w3c-tr') {
    const m =
      /W3C (Recommendation|Candidate Recommendation(?: Snapshot| Draft)?|Proposed Recommendation|Working Draft|Group Note|Statement)/.exec(
        html.slice(0, 30_000)
      );
    if (m) statusText = m[0];
  }

  return { specTitle, statusText };
}

/**
 * Finds all anchors whose normative section text contains the quote,
 * ordered from smallest section to largest.
 */
export function findAnchorForQuote(
  html: string,
  quote: string,
  options: ExtractSectionOptions = {}
): string[] {
  const q = normalizeSpecText(quote);
  if (!q) return [];
  const $ = cheerio.load(html);
  const family = options.family;
  const decorativeSel =
    family === 'rfc' || (family === undefined && $('section[id^="section-"]').length === 0)
      ? `${DECORATIVE_SELECTORS}, ${RFC_DECORATIVE_SELECTORS}`
      : DECORATIVE_SELECTORS;

  // Fast pre-check against full normalized normative text of the page.
  const $root = $('body').length > 0 ? $('body') : $.root();
  const pageNormative = normalizeSpecText(
    nodeToText(cloneWithout($, $root, `${decorativeSel}, ${NON_NORMATIVE_SELECTORS}`).toArray())
  );
  if (!pageNormative.includes(q)) return [];

  const candidateIds = new Set<string>();
  const addId = (el: AnyNode) => {
    const id = $(el).attr('id');
    if (id) candidateIds.add(id);
  };

  $(
    'h1[id], h2[id], h3[id], h4[id], h5[id], h6[id], section[id], emu-clause[id], emu-annex[id], emu-intro[id], [data-algorithm][id], [data-algorithm] dfn[id]'
  ).each((_, el) => addId(el));

  // Legacy RFC headings: span.h1..h6 > a.selflink[id]
  if ((family === undefined || family === 'rfc') && $('section[id^="section-"]').length === 0) {
    $('span.h1, span.h2, span.h3, span.h4, span.h5, span.h6')
      .find('a.selflink[id]')
      .each((_, el) => addId(el));
  }

  const matches: Array<{ anchor: string; length: number }> = [];
  for (const anchor of candidateIds) {
    const sec = extractSectionFromCheerio($, anchor, options);
    if ('error' in sec) continue;
    const found = findQuote(sec, quote);
    if (found.found) {
      matches.push({ anchor, length: sec.normativeText.length });
    }
  }

  matches.sort((a, b) => a.length - b.length || a.anchor.localeCompare(b.anchor));
  return matches.map((m) => m.anchor);
}
