import { parseMdx } from '../mdx-text';

export interface ClaimReference {
  ref: string;
  component: 'C' | 'SpecQuote' | 'SourceQuote';
  line: number;
}

interface GenericAstNode {
  type: string;
  name?: string | null;
  attributes?: Array<{ type: string; name?: string; value?: unknown }>;
  children?: GenericAstNode[];
  position?: {
    start?: { line?: number };
  };
}

/** Full claim id as seen from a page: keeps "other/slug", expands "slug" to "<pageId>/slug". */
export function toClaimId(pageId: string, ref: string): string {
  return ref.includes('/') ? ref : `${pageId}/${ref}`;
}

/** Extracts every claim reference (`<C id>`, `<SpecQuote claim>`, `<SourceQuote claim>`) in document order. */
export function extractClaimReferences(raw: string): ClaimReference[] {
  const parsed = parseMdx(raw);
  const refs: ClaimReference[] = [];

  function walk(node: GenericAstNode): void {
    if (node.type === 'mdxJsxFlowElement' || node.type === 'mdxJsxTextElement') {
      const name = typeof node.name === 'string' ? node.name : null;
      if (name === 'C' || name === 'SpecQuote' || name === 'SourceQuote') {
        const attrName = name === 'C' ? 'id' : 'claim';
        const line = (node.position?.start?.line ?? 1) + parsed.lineOffset;
        const attr = (node.attributes ?? []).find(
          (a) => a.type === 'mdxJsxAttribute' && a.name === attrName
        );
        if (!attr || typeof attr.value !== 'string' || attr.value.trim().length === 0) {
          throw new Error(
            `<${name} ${attrName}=...> at line ${line} must use a static string literal.`
          );
        }
        refs.push({ ref: attr.value, component: name, line });
      }
    }
    if (Array.isArray(node.children)) {
      for (const child of node.children) {
        walk(child);
      }
    }
  }

  walk(parsed.tree as unknown as GenericAstNode);
  return refs;
}
