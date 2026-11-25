import matter from 'gray-matter';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkMdx from 'remark-mdx';
import remarkGfm from 'remark-gfm';
import type { Root } from 'mdast';

export interface ParsedMdx {
  tree: Root;
  /** Number of frontmatter lines (delimiters included) to add to AST line numbers. */
  lineOffset: number;
  data: Record<string, unknown>;
}

export function parseMdx(raw: string): ParsedMdx {
  const fm = matter(raw);
  const lineOffset = raw.slice(0, raw.length - fm.content.length).split('\n').length - 1;
  const tree = unified().use(remarkParse).use(remarkMdx).use(remarkGfm).parse(fm.content) as Root;
  return { tree, lineOffset, data: fm.data };
}

export type ProseContext = 'prose' | 'heading' | 'table' | 'advice' | 'story' | 'claim';

export interface ProseTextNode {
  value: string;
  /** Absolute 1-based line number in the .mdx file. */
  line: number;
  column: number;
  /** Enclosing contexts, from outermost to innermost. */
  contexts: ProseContext[];
  /** Raw `id` attribute of the nearest enclosing `<C>` ("slug" or "page-id/slug"), or null. */
  claimRef: string | null;
  /** Top-level block index (paragraph, list, table, heading, etc.) containing this text. */
  blockIndex: number;
}

export interface LintIgnore {
  blockIndex: number;
  rule: string;
  reason: string;
  line: number;
}

const EXCLUDED_NODE_TYPES = new Set([
  'code',
  'inlineCode',
  'html',
  'mdxjsEsm',
  'mdxTextExpression',
  'mdxFlowExpression',
  'yaml',
  'image',
  'imageReference',
]);

const EXCLUDED_JSX_COMPONENTS = new Set([
  'Support',
  'SupportDate',
  'SpecQuote',
  'SourceQuote',
  'Experiment',
]);

const IGNORE_COMMENT_RE = /^\s*\/\*\s*support-lint-ignore\s+([a-z-]+):\s*(.{10,}?)\s*\*\/\s*$/;

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

function getJsxStringAttr(node: GenericAstNode, attrName: string): string | null {
  if (!Array.isArray(node.attributes)) return null;
  for (const attr of node.attributes) {
    if (attr.type === 'mdxJsxAttribute' && attr.name === attrName && typeof attr.value === 'string') {
      return attr.value;
    }
  }
  return null;
}

/**
 * Returns all prose `text` nodes in document order plus any `support-lint-ignore` directives.
 * Excludes code, inlineCode, html, mdxjsEsm, mdx expressions, yaml, images (including alt),
 * JSX attributes, link URLs (link text is included), and computed proof components
 * (`Support`, `SupportDate`, `SpecQuote`, `SourceQuote`, `Experiment`).
 */
export function collectProseText(parsed: ParsedMdx): {
  nodes: ProseTextNode[];
  ignores: LintIgnore[];
} {
  const nodes: ProseTextNode[] = [];
  const ignores: LintIgnore[] = [];
  const pendingIgnores: Array<{ rule: string; reason: string; line: number }> = [];

  const rootChildren = (parsed.tree.children ?? []) as unknown as GenericAstNode[];

  function walk(
    node: GenericAstNode,
    blockIndex: number,
    contexts: ProseContext[],
    claimRef: string | null
  ): void {
    if (EXCLUDED_NODE_TYPES.has(node.type)) return;

    if (node.type === 'text') {
      const value = typeof node.value === 'string' ? node.value : '';
      if (value.length > 0) {
        nodes.push({
          value,
          line: (node.position?.start?.line ?? 1) + parsed.lineOffset,
          column: node.position?.start?.column ?? 1,
          contexts: contexts.length > 0 ? [...contexts] : ['prose'],
          claimRef,
          blockIndex,
        });
      }
      return;
    }

    let nextContexts = contexts;
    let nextClaimRef = claimRef;

    if (node.type === 'heading') {
      nextContexts = [...contexts, 'heading'];
    } else if (node.type === 'table' && !contexts.includes('table')) {
      nextContexts = [...contexts, 'table'];
    } else if (node.type === 'mdxJsxFlowElement' || node.type === 'mdxJsxTextElement') {
      const name = typeof node.name === 'string' ? node.name : null;
      if (name && EXCLUDED_JSX_COMPONENTS.has(name)) {
        return;
      }
      if (name === 'Advice') {
        nextContexts = [...contexts, 'advice'];
      } else if (name === 'Story') {
        nextContexts = [...contexts, 'story'];
      } else if (name === 'C') {
        nextContexts = [...contexts, 'claim'];
        nextClaimRef = getJsxStringAttr(node, 'id');
      }
    }

    if (Array.isArray(node.children)) {
      for (const child of node.children) {
        walk(child, blockIndex, nextContexts, nextClaimRef);
      }
    }
  }

  rootChildren.forEach((child, blockIndex) => {
    if (child.type === 'mdxFlowExpression' && typeof child.value === 'string') {
      const match = IGNORE_COMMENT_RE.exec(child.value);
      if (match) {
        pendingIgnores.push({
          rule: match[1],
          reason: match[2].trim(),
          line: (child.position?.start?.line ?? 1) + parsed.lineOffset,
        });
      }
      return;
    }

    if (pendingIgnores.length > 0) {
      for (const pending of pendingIgnores) {
        ignores.push({
          blockIndex,
          rule: pending.rule,
          reason: pending.reason,
          line: pending.line,
        });
      }
      pendingIgnores.length = 0;
    }

    walk(child, blockIndex, [], null);
  });

  return { nodes, ignores };
}
