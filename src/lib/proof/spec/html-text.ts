import type { CheerioAPI, Cheerio } from 'cheerio';
import type { AnyNode, Element } from 'domhandler';

export const NON_NORMATIVE_SELECTORS = [
  '.note',
  '.example',
  '.issue',
  '.advisement',
  '.XXX',
  '.warning',
  '.domintro',
  'dl.domintro',
  'emu-note',
  'emu-example',
  'details.wpt-tests-block',
  '.wpt-tests-block',
  '.wpt-tests-list',
  'details.mdn-anno',
  '.mdn-anno',
  '.caniuse-status',
  'details.respec-tests-details',
  '.annotation',
].join(', ');

export const DECORATIVE_SELECTORS = [
  'script',
  'style',
  'template',
  '[hidden]',
  '.secno',
  '.secnum',
  '.self-link',
  '.pilcrow',
  '.iref',
  'a.selfRef.section-number',
  '.dfn-panel',
  '.ref-hint',
].join(', ');

/** Legacy paginated RFC headers, footers, and page-break rules (RFC family only). */
export const RFC_DECORATIVE_SELECTORS = 'span.grey, hr.noprint';

const BLOCK_TAGS = new Set([
  'p',
  'div',
  'section',
  'article',
  'li',
  'ol',
  'ul',
  'dl',
  'dt',
  'dd',
  'pre',
  'blockquote',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'table',
  'thead',
  'tbody',
  'tr',
  'td',
  'th',
  'figure',
  'figcaption',
  'details',
  'summary',
  'emu-clause',
  'emu-alg',
  'emu-grammar',
  'emu-table',
  'br',
  'hr',
]);

/** Concatenates node text with newlines around block elements to prevent word gluing. */
export function nodeToText(nodes: AnyNode[]): string {
  let out = '';
  const walk = (n: AnyNode) => {
    if (n.type === 'text') {
      out += (n as unknown as { data: string }).data;
      return;
    }
    if (n.type !== 'tag' && n.type !== 'script' && n.type !== 'style') return;
    const el = n as Element;
    const block = BLOCK_TAGS.has(el.name);
    if (block) out += '\n';
    for (const c of el.children) walk(c);
    if (block) out += '\n';
  };
  for (const n of nodes) walk(n);
  return out;
}

/**
 * Walks nodes like nodeToText while recording start positions of marked elements
 * and optionally skipping specific elements (such as a heading line in legacy RFCs).
 */
export function nodeToTextWithMarkers(
  nodes: AnyNode[],
  marked: Set<AnyNode>,
  skip: Set<AnyNode>
): { text: string; offsets: Map<AnyNode, number> } {
  let out = '';
  const offsets = new Map<AnyNode, number>();
  const walk = (n: AnyNode) => {
    if (marked.has(n)) {
      offsets.set(n, out.length);
    }
    if (skip.has(n)) {
      return;
    }
    if (n.type === 'text') {
      out += (n as unknown as { data: string }).data;
      return;
    }
    if (n.type !== 'tag' && n.type !== 'script' && n.type !== 'style') return;
    const el = n as Element;
    const block = BLOCK_TAGS.has(el.name);
    if (block) out += '\n';
    for (const c of el.children) walk(c);
    if (block) out += '\n';
  };
  for (const n of nodes) walk(n);
  return { text: out, offsets };
}

export function cloneWithout($: CheerioAPI, block: Cheerio<AnyNode>, selectors: string): Cheerio<AnyNode> {
  const clone = block.clone();
  clone.find(selectors).remove();
  // The block itself can match (e.g. anchor on a <p class="note">).
  return clone.filter((_, el) => !$(el).is(selectors));
}
