import { parseMdx } from '../mdx-text';

export const VERIFIED_PLACEHOLDER = '⟦verified data⟧';

export interface Sentence {
  pageId: string;
  /** Stable 0-based index within the page in document order. */
  index: number;
  /** Unmasked sentence text: inline code keeps backticks, computed components become VERIFIED_PLACEHOLDER. */
  text: string;
  /** Absolute 1-based line number in the .mdx file. */
  line: number;
  column: number;
  context: 'prose' | 'table' | 'advice' | 'story';
  /** Raw `id` attributes of `<C>` elements touching at least one non-whitespace char of the sentence. */
  claimRefs: string[];
  /** Document-order indices of `<C>` elements touching the sentence. */
  claimElements: number[];
  hasComputed: boolean;
  skip: null | 'too-short' | 'code-only' | 'story';
}

export interface ClaimUnit {
  pageId: string;
  /** Indexes of the sentences in this group. */
  sentenceIndexes: number[];
  text: string;
  claimRefs: string[];
  line: number;
}

export type SegmentationError = {
  rule:
    | 'coverage/mdx-parse-error'
    | 'coverage/nested-claim'
    | 'coverage/claim-block'
    | 'coverage/claim-too-long';
  line: number | null;
  message: string;
};

type ContextTag = 'advice' | 'story' | 'table';

interface GenericAstNode {
  type: string;
  value?: unknown;
  name?: string | null;
  attributes?: Array<{ type: string; name?: string; value?: unknown }>;
  children?: GenericAstNode[];
  position?: {
    start?: { line?: number; column?: number };
  };
}

interface TextRun {
  text: string;
  start: number;
  end: number;
  claimElement: number | null;
  claimRef: string | null;
  kind: 'text' | 'code' | 'computed';
  line: number;
  column: number;
  contexts: ContextTag[];
}

const IGNORED_BLOCK_TYPES = new Set([
  'heading',
  'code',
  'html',
  'yaml',
  'mdxjsEsm',
  'mdxFlowExpression',
  'thematicBreak',
  'image',
  'imageReference',
  'definition',
  'footnoteDefinition',
]);

const IGNORED_FLOW_JSX = new Set([
  'Support',
  'SupportDate',
  'SpecQuote',
  'SourceQuote',
  'Experiment',
]);

const IGNORED_INLINE_JSX = new Set(['SpecQuote', 'SourceQuote', 'Experiment']);

const ABBREVIATION_END_RE =
  /(?:^|[\s([{"'—–-])(?:e\.g\.|i\.e\.|vs\.|etc\.|cf\.|approx\.|fig\.|no\.|inc\.|u\.s\.)$/i;

const STARTS_LOWERCASE_RE = /^\p{Ll}/u;

const HAS_LETTER_RE = /\p{L}/u;

const WORD_RE = /[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu;

const sentenceSegmenter = new Intl.Segmenter('en', { granularity: 'sentence' });

function getJsxStringAttr(node: GenericAstNode, attrName: string): string | null {
  if (!Array.isArray(node.attributes)) return null;
  for (const attr of node.attributes) {
    if (attr.type === 'mdxJsxAttribute' && attr.name === attrName && typeof attr.value === 'string') {
      return attr.value;
    }
  }
  return null;
}

function nodeLine(node: GenericAstNode, lineOffset: number): number {
  return (node.position?.start?.line ?? 1) + lineOffset;
}

function nodeColumn(node: GenericAstNode): number {
  return node.position?.start?.column ?? 1;
}

function resolveContext(contexts: ContextTag[], isTableCell: boolean): Sentence['context'] {
  if (contexts.includes('story')) return 'story';
  if (contexts.includes('advice')) return 'advice';
  if (isTableCell || contexts.includes('table')) return 'table';
  return 'prose';
}

export function extractSentences(
  raw: string,
  pageId: string
): { sentences: Sentence[]; units: ClaimUnit[]; errors: SegmentationError[] } {
  let parsed;
  try {
    parsed = parseMdx(raw);
  } catch (err) {
    return {
      sentences: [],
      units: [],
      errors: [
        {
          rule: 'coverage/mdx-parse-error',
          line: null,
          message: `Failed to parse MDX for "${pageId}": ${err instanceof Error ? err.message : String(err)}`,
        },
      ],
    };
  }

  const { lineOffset } = parsed;
  const sentences: Sentence[] = [];
  const errors: SegmentationError[] = [];
  let nextClaimElementId = 1;
  const claimElementSentenceCounts = new Map<number, { count: number; firstLine: number; ref: string }>();

  function processTextUnit(unitNode: GenericAstNode, blockContexts: ContextTag[], isTableCell: boolean): void {
    const runs: TextRun[] = [];
    let cursor = 0;

    function pushRun(
      text: string,
      kind: TextRun['kind'],
      node: GenericAstNode,
      claimElement: number | null,
      claimRef: string | null,
      contexts: ContextTag[]
    ): void {
      if (text.length === 0) return;
      const start = cursor;
      cursor += text.length;
      runs.push({
        text,
        start,
        end: cursor,
        claimElement,
        claimRef,
        kind,
        line: nodeLine(node, lineOffset),
        column: nodeColumn(node),
        contexts: [...contexts],
      });
    }

    function flatten(
      node: GenericAstNode,
      claimElement: number | null,
      claimRef: string | null,
      contexts: ContextTag[]
    ): void {
      if (
        node.type === 'mdxTextExpression' ||
        node.type === 'image' ||
        node.type === 'imageReference' ||
        node.type === 'footnoteReference'
      ) {
        return;
      }

      if (node.type === 'text') {
        const value = typeof node.value === 'string' ? node.value : '';
        pushRun(value, 'text', node, claimElement, claimRef, contexts);
        return;
      }

      if (node.type === 'inlineCode') {
        const value = typeof node.value === 'string' ? node.value : '';
        pushRun(`\`${value}\``, 'code', node, claimElement, claimRef, contexts);
        return;
      }

      if (node.type === 'break') {
        pushRun(' ', 'text', node, claimElement, claimRef, contexts);
        return;
      }

      if (node.type === 'mdxJsxTextElement') {
        const name = typeof node.name === 'string' ? node.name : null;
        if (name === 'Support' || name === 'SupportDate') {
          pushRun(VERIFIED_PLACEHOLDER, 'computed', node, claimElement, claimRef, contexts);
          return;
        }
        if (name && IGNORED_INLINE_JSX.has(name)) {
          return;
        }
        if (name === 'C') {
          if (claimElement !== null) {
            errors.push({
              rule: 'coverage/nested-claim',
              line: nodeLine(node, lineOffset),
              message: 'Nested <C> inside another <C> is not allowed.',
            });
            for (const child of node.children ?? []) {
              flatten(child, claimElement, claimRef, contexts);
            }
            return;
          }
          const elemId = nextClaimElementId++;
          const ref = getJsxStringAttr(node, 'id') ?? '';
          for (const child of node.children ?? []) {
            flatten(child, elemId, ref, contexts);
          }
          return;
        }
        if (name === 'Advice') {
          const nextCtx: ContextTag[] = [...contexts, 'advice'];
          for (const child of node.children ?? []) {
            flatten(child, claimElement, claimRef, nextCtx);
          }
          return;
        }
        if (name === 'Story') {
          const nextCtx: ContextTag[] = [...contexts, 'story'];
          for (const child of node.children ?? []) {
            flatten(child, claimElement, claimRef, nextCtx);
          }
          return;
        }
        for (const child of node.children ?? []) {
          flatten(child, claimElement, claimRef, contexts);
        }
        return;
      }

      // emphasis, strong, delete, link, linkReference, paragraph, tableCell, etc.
      for (const child of node.children ?? []) {
        flatten(child, claimElement, claimRef, contexts);
      }
    }

    flatten(unitNode, null, null, blockContexts);
    if (runs.length === 0) return;

    const plain = runs.map((r) => r.text).join('');
    const masked = runs.map((r) => (r.kind === 'code' ? 'X'.repeat(r.text.length) : r.text)).join('');

    const rawSegments: Array<{ start: number; end: number }> = [];
    for (const seg of sentenceSegmenter.segment(masked)) {
      rawSegments.push({ start: seg.index, end: seg.index + seg.segment.length });
    }
    if (rawSegments.length === 0) return;

    const merged: Array<{ start: number; end: number }> = [rawSegments[0]];
    for (let i = 1; i < rawSegments.length; i++) {
      const prev = merged[merged.length - 1];
      const curr = rawSegments[i];
      const prevText = plain.slice(prev.start, prev.end).trimEnd();
      const currText = plain.slice(curr.start, curr.end).trimStart();
      if (ABBREVIATION_END_RE.test(prevText) || STARTS_LOWERCASE_RE.test(currText)) {
        prev.end = curr.end;
      } else {
        merged.push(curr);
      }
    }

    for (const seg of merged) {
      const text = plain.slice(seg.start, seg.end).replace(/\s+/g, ' ').trim();
      if (text.length === 0) continue;

      const touchedRuns: TextRun[] = [];
      for (const run of runs) {
        const os = Math.max(run.start, seg.start);
        const oe = Math.min(run.end, seg.end);
        if (os < oe && /\S/.test(plain.slice(os, oe))) {
          touchedRuns.push(run);
        }
      }
      if (touchedRuns.length === 0) continue;

      const claimRefs: string[] = [];
      const claimElements: number[] = [];
      const allContexts: ContextTag[] = [...blockContexts];
      let hasComputed = false;
      const proseParts: string[] = [];

      for (const run of touchedRuns) {
        if (run.claimRef !== null && run.claimRef !== '' && !claimRefs.includes(run.claimRef)) {
          claimRefs.push(run.claimRef);
        }
        if (run.claimElement !== null && !claimElements.includes(run.claimElement)) {
          claimElements.push(run.claimElement);
        }
        if (run.kind === 'computed') {
          hasComputed = true;
        }
        for (const ctx of run.contexts) {
          if (!allContexts.includes(ctx)) allContexts.push(ctx);
        }
        if (run.kind === 'text') {
          const os = Math.max(run.start, seg.start);
          const oe = Math.min(run.end, seg.end);
          proseParts.push(plain.slice(os, oe));
        }
      }

      const firstRun = touchedRuns[0];
      const context = resolveContext(allContexts, isTableCell);
      const proseOnly = proseParts.join(' ').replace(/\s+/g, ' ').trim();

      let skip: Sentence['skip'] = null;
      if (context === 'story' && claimRefs.length === 0 && claimElements.length === 0) {
        skip = 'story';
      } else if (!HAS_LETTER_RE.test(proseOnly)) {
        skip = 'code-only';
      } else {
        const words = proseOnly.match(WORD_RE) ?? [];
        const minWords = context === 'table' ? 4 : 3;
        if (words.length < minWords) {
          skip = 'too-short';
        }
      }

      const sentence: Sentence = {
        pageId,
        index: sentences.length,
        text,
        line: firstRun.line,
        column: firstRun.column,
        context,
        claimRefs,
        claimElements,
        hasComputed,
        skip,
      };
      sentences.push(sentence);

      for (const elemId of claimElements) {
        const entry = claimElementSentenceCounts.get(elemId);
        if (entry) {
          entry.count += 1;
        } else {
          const refForElem =
            touchedRuns.find((r) => r.claimElement === elemId)?.claimRef ?? '';
          claimElementSentenceCounts.set(elemId, {
            count: 1,
            firstLine: sentence.line,
            ref: refForElem,
          });
        }
      }
    }
  }

  function walk(node: GenericAstNode, contexts: ContextTag[]): void {
    if (IGNORED_BLOCK_TYPES.has(node.type)) return;

    if (node.type === 'mdxJsxFlowElement') {
      const name = typeof node.name === 'string' ? node.name : null;
      if (name && IGNORED_FLOW_JSX.has(name)) return;
      if (name === 'C') {
        const ref = getJsxStringAttr(node, 'id') ?? '';
        errors.push({
          rule: 'coverage/claim-block',
          line: nodeLine(node, lineOffset),
          message: `<C id="${ref}"> is written as a block element. Place <C> inline inside a paragraph around one or two sentences.`,
        });
        for (const child of node.children ?? []) {
          walk(child, contexts);
        }
        return;
      }
      if (name === 'Advice') {
        const nextCtx: ContextTag[] = [...contexts, 'advice'];
        for (const child of node.children ?? []) {
          walk(child, nextCtx);
        }
        return;
      }
      if (name === 'Story') {
        const nextCtx: ContextTag[] = [...contexts, 'story'];
        for (const child of node.children ?? []) {
          walk(child, nextCtx);
        }
        return;
      }
      for (const child of node.children ?? []) {
        walk(child, contexts);
      }
      return;
    }

    if (node.type === 'paragraph') {
      processTextUnit(node, contexts, false);
      return;
    }

    if (node.type === 'tableCell') {
      processTextUnit(node, contexts, true);
      return;
    }

    const nextCtx: ContextTag[] = node.type === 'table' ? [...contexts, 'table'] : contexts;
    for (const child of node.children ?? []) {
      walk(child, nextCtx);
    }
  }

  walk(parsed.tree as unknown as GenericAstNode, []);

  // Step 12: check claim-too-long (> 2 sentences per <C> element)
  for (const [, info] of claimElementSentenceCounts) {
    if (info.count > 2) {
      errors.push({
        rule: 'coverage/claim-too-long',
        line: info.firstLine,
        message: `<C id="${info.ref}"> spans ${info.count} sentences (maximum is 2).`,
      });
    }
  }

  // Step 13: build ClaimUnits
  const units: ClaimUnit[] = [];
  let currentGroup: Sentence[] = [];
  let currentElements = new Set<number>();

  function flushUnit(): void {
    if (currentGroup.length === 0) return;
    const refs: string[] = [];
    for (const s of currentGroup) {
      for (const r of s.claimRefs) {
        if (!refs.includes(r)) refs.push(r);
      }
    }
    units.push({
      pageId,
      sentenceIndexes: currentGroup.map((s) => s.index),
      text: currentGroup.map((s) => s.text).join(' '),
      claimRefs: refs,
      line: currentGroup[0].line,
    });
    currentGroup = [];
    currentElements = new Set<number>();
  }

  for (const sentence of sentences) {
    if (sentence.claimElements.length === 0) {
      flushUnit();
      continue;
    }
    const sharesElement = sentence.claimElements.some((id) => currentElements.has(id));
    if (currentGroup.length > 0 && sharesElement) {
      currentGroup.push(sentence);
      for (const id of sentence.claimElements) currentElements.add(id);
    } else {
      flushUnit();
      currentGroup = [sentence];
      currentElements = new Set(sentence.claimElements);
    }
  }
  flushUnit();

  return { sentences, units, errors };
}
