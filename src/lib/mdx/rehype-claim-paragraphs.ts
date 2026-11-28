/**
 * Rehype plugin that re-wraps paragraphs consisting solely of inline `<C>`
 * elements. `@mdx-js/mdx`'s built-in `remark-mark-and-unravel` unwraps any
 * paragraph whose children are only JSX elements and whitespace, turning
 * `<C id="...">...</C>` into an `mdxJsxFlowElement` with no parent `<p>`.
 *
 * This plugin restores a `<p>` around consecutive flow `<C>` elements that
 * had no blank line between them (unless a `<C>` itself contains block
 * children, in which case it is left untouched so the `C` component raises
 * its block-wrapping error).
 */

interface PositionPoint {
  line?: number;
  column?: number;
  offset?: number;
}

interface HastNode {
  type: string;
  tagName?: string;
  name?: string;
  value?: string;
  properties?: Record<string, unknown>;
  attributes?: unknown[];
  children?: HastNode[];
  position?: {
    start?: PositionPoint;
    end?: PositionPoint;
  };
  data?: Record<string, unknown>;
}

const BLOCK_TAGS = new Set(['p', 'ul', 'ol', 'pre', 'table', 'blockquote', 'div']);
const CONTAINER_TAGS = new Set(['blockquote', 'li']);

function isWhitespaceText(node: HastNode): boolean {
  return node.type === 'text' && /^[\t\r\n ]*$/.test(node.value ?? '');
}

function hasBlockDescendant(node: HastNode): boolean {
  if (!node.children) return false;
  for (const child of node.children) {
    if (child.type === 'element' && child.tagName && BLOCK_TAGS.has(child.tagName)) {
      return true;
    }
    if (child.type === 'mdxJsxFlowElement' && child.name && BLOCK_TAGS.has(child.name)) {
      return true;
    }
  }
  return false;
}

function isInlineClaimFlowElement(node: HastNode): boolean {
  return (
    node.type === 'mdxJsxFlowElement' &&
    node.name === 'C' &&
    !hasBlockDescendant(node)
  );
}

function isSameParagraphLine(prev: HastNode, next: HastNode): boolean {
  const prevEnd = prev.position?.end?.line;
  const nextStart = next.position?.start?.line;
  if (typeof prevEnd === 'number' && typeof nextStart === 'number') {
    return nextStart <= prevEnd + 1;
  }
  return true;
}

function toTextElement(node: HastNode): HastNode {
  return {
    ...node,
    type: 'mdxJsxTextElement',
  };
}

function transformChildren(parent: HastNode): void {
  const children = parent.children;
  if (!children || children.length === 0) return;

  // Recurse into eligible container children first.
  for (const child of children) {
    if (
      child.type === 'mdxJsxFlowElement' ||
      (child.type === 'element' && child.tagName && CONTAINER_TAGS.has(child.tagName))
    ) {
      transformChildren(child);
    }
  }

  const nextChildren: HastNode[] = [];
  let i = 0;

  while (i < children.length) {
    const current = children[i];
    if (!isInlineClaimFlowElement(current)) {
      nextChildren.push(current);
      i += 1;
      continue;
    }

    // Start a paragraph group of consecutive inline <C> flow elements.
    const group: HastNode[] = [toTextElement(current)];
    let lastClaim = current;
    let j = i + 1;

    while (j < children.length) {
      // Collect any whitespace text nodes between <C> elements.
      const wsBuffer: HastNode[] = [];
      let k = j;
      while (k < children.length && isWhitespaceText(children[k])) {
        wsBuffer.push(children[k]);
        k += 1;
      }

      if (k < children.length && isInlineClaimFlowElement(children[k])) {
        const candidate = children[k];
        const hasBlankLineInWs = wsBuffer.some((n) => /\n\s*\n/.test(n.value ?? ''));
        if (!hasBlankLineInWs && isSameParagraphLine(lastClaim, candidate)) {
          if (wsBuffer.length > 0) {
            group.push(...wsBuffer);
          } else {
            // remark-mark-and-unravel strips whitespace between unwrapped JSX siblings.
            group.push({ type: 'text', value: ' ' });
          }
          group.push(toTextElement(candidate));
          lastClaim = candidate;
          j = k + 1;
          continue;
        }
      }
      break;
    }

    nextChildren.push({
      type: 'element',
      tagName: 'p',
      properties: {},
      children: group,
    });
    i = j;
  }

  parent.children = nextChildren;
}

export function rehypeClaimParagraphs() {
  return function transformer(tree: HastNode): void {
    transformChildren(tree);
  };
}
