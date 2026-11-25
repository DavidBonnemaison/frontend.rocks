import { collectProseText, parseMdx } from '../proof/mdx-text';

// Case-sensitive on purpose so "the trailing edge" or "blink 3 times" do not fire.
const BROWSER = String.raw`(?:Chrome|Chromium|Edge|Firefox|Safari|Opera|Samsung Internet|WebKit|Blink|Gecko|iOS|WebView)`;
// "Edge" alone is ambiguous in prose ("edge cases"); support verbs only fire on "Microsoft Edge".
const BROWSER_SUPPORT = String.raw`(?:Chrome|Chromium|Microsoft Edge|Firefox|Safari|Opera|Samsung Internet|WebKit|Blink|Gecko)`;
const YEAR = String.raw`(?:19[89]\d|20[0-4]\d)`;

export interface SupportLintRule {
  id: string;
  re: RegExp;
  message: string;
  /** Rule ignored inside `<Story>`. */
  allowInStory?: boolean;
  /** Rule ignored inside `<C>` (the sentence is checked against its proof). */
  skipInClaim?: boolean;
  /** Match accepted inside `<C>` when the linked proof contains the matched year. */
  allowWhenProvenYear?: boolean;
}

export const SUPPORT_LINT_RULES: SupportLintRule[] = [
  {
    id: 'browser-version',
    re: new RegExp(String.raw`\b${BROWSER}\s*(?:v|version\s*)?\d{1,3}(?:\.\d+){0,2}\b\s*\+?`),
    message: 'Browser version written by hand. Use <Support feature="..."/> or <SupportDate .../>.',
  },
  {
    id: 'version-of-browser',
    re: new RegExp(
      String.raw`\b(?:[Ss]ince|[Ff]rom|[Aa]s of|[Ii]n|[Uu]ntil)\s+(?:version\s+)?\d{1,3}(?:\.\d+)?\s*\+?\s+(?:of\s+|in\s+|on\s+)?${BROWSER}\b`
    ),
    message: 'Browser version written by hand.',
  },
  {
    id: 'baseline-label',
    re: /\bBaseline\s+(?:Widely|Newly|20\d{2})\b|\b(?:widely|newly)\s+available\b|\blimited availability\b/i,
    message: 'Baseline status written by hand. Use <Support variant="sentence"/>.',
  },
  {
    id: 'all-browsers',
    re: /\b(?:supported|unsupported|support|supports|ships?|shipped|available|implemented|works?)\b[^.;:!?]{0,40}\b(?:in|by|on|across)\s+(?:(?:all|every|most|modern|major|evergreen)\s+(?:the\s+)?){1,2}browsers?\b/i,
    message: 'Cross-browser support claim written by hand.',
    skipInClaim: true,
  },
  {
    id: 'browser-supports',
    re: new RegExp(
      String.raw`\b${BROWSER_SUPPORT}\b[^.;:!?]{0,30}\b(?:supports?|doesn'?t support|does not support|lacks?|ships?|shipped|added support|implemented|implements)\b`
    ),
    message: 'Per-browser support claim written by hand.',
    skipInClaim: true,
  },
  {
    id: 'dated-history',
    // Any standalone year, except measurements ("2000 ms", "2048 bytes") and names ("RFC 2045", "ECMAScript 2015").
    re: new RegExp(
      String.raw`(?<![\w.,-])(?<!RFC\s)(?<!ECMAScript\s)(?<!ES\s)${YEAR}(?!\w|[.,]\d|\s*(?:ms|s|px|bytes?|[kKMG]B|%|x|em|rem|fps|Hz)\b)`
    ),
    message:
      'Year written by hand. Use <SupportDate .../>, wrap it in a <C> whose proof contains this year, or remove it.',
    allowWhenProvenYear: true,
  },
  {
    id: 'usage-share',
    re: /\b\d{1,3}(?:\.\d+)?\s?%\s+of\s+(?:users|browsers|global|traffic)\b/i,
    message: 'Usage share written by hand: not provable from BCD.',
  },
  {
    id: 'safari-mention',
    re: /\bSafari\b/,
    message: 'The word "Safari" may only come from BCD.',
    allowInStory: true,
  },
];

export interface SupportLintViolation {
  rule: string;
  line: number;
  column: number;
  match: string;
  message: string;
}

export interface SupportLintContext {
  pageId: string;
  /** Proven years keyed by full claim id ("page-id/slug"). */
  provenYears: Map<string, Set<number>>;
  /** Artifact filenames absent during this run (for actionable diagnostics). */
  missingArtifacts: string[];
}

function resolveFullClaimId(pageId: string, claimRef: string): string {
  return claimRef.includes('/') ? claimRef : `${pageId}/${claimRef}`;
}

function offsetPosition(
  baseLine: number,
  baseColumn: number,
  text: string,
  index: number
): { line: number; column: number } {
  const before = text.slice(0, index);
  const lastNewline = before.lastIndexOf('\n');
  if (lastNewline === -1) {
    return { line: baseLine, column: baseColumn + index };
  }
  const lineDelta = before.split('\n').length - 1;
  return {
    line: baseLine + lineDelta,
    column: before.length - lastNewline,
  };
}

export function lintSupportProse(
  raw: string,
  ctx: SupportLintContext
): { violations: SupportLintViolation[]; ignored: number } {
  let parsed;
  try {
    parsed = parseMdx(raw);
  } catch (err) {
    const line =
      err && typeof err === 'object' && 'line' in err && typeof (err as { line?: unknown }).line === 'number'
        ? (err as { line: number }).line
        : 1;
    const column =
      err && typeof err === 'object' && 'column' in err && typeof (err as { column?: unknown }).column === 'number'
        ? (err as { column: number }).column
        : 1;
    return {
      violations: [
        {
          rule: 'mdx-parse-error',
          line,
          column,
          match: '',
          message: err instanceof Error ? err.message : String(err),
        },
      ],
      ignored: 0,
    };
  }

  const { nodes, ignores } = collectProseText(parsed);
  const ignoresByBlock = new Map<number, Set<string>>();
  for (const ig of ignores) {
    let set = ignoresByBlock.get(ig.blockIndex);
    if (!set) {
      set = new Set();
      ignoresByBlock.set(ig.blockIndex, set);
    }
    set.add(ig.rule);
  }

  const violations: SupportLintViolation[] = [];
  let ignored = 0;

  for (const node of nodes) {
    const inStory = node.contexts.includes('story');
    const inClaim = node.claimRef !== null;
    const blockIgnores = ignoresByBlock.get(node.blockIndex);

    for (const rule of SUPPORT_LINT_RULES) {
      if (rule.allowInStory && inStory) continue;
      if (rule.skipInClaim && inClaim) continue;

      const flags = rule.re.flags.includes('g') ? rule.re.flags : `${rule.re.flags}g`;
      const globalRe = new RegExp(rule.re.source, flags);

      for (const match of node.value.matchAll(globalRe)) {
        const matchedText = match[0];
        const matchIndex = match.index ?? 0;

        if (rule.allowWhenProvenYear && node.claimRef !== null) {
          const fullId = resolveFullClaimId(ctx.pageId, node.claimRef);
          const year = Number(matchedText);
          if (ctx.provenYears.get(fullId)?.has(year)) {
            continue;
          }
        }

        if (blockIgnores?.has(rule.id)) {
          ignored += 1;
          continue;
        }

        let message = rule.message;
        if (rule.allowWhenProvenYear && node.claimRef !== null && ctx.missingArtifacts.length > 0) {
          message = `${message} (artifacts missing: ${ctx.missingArtifacts.join(', ')}, run npm run proof:all)`;
        }

        const pos = offsetPosition(node.line, node.column, node.value, matchIndex);
        violations.push({
          rule: rule.id,
          line: pos.line,
          column: pos.column,
          match: matchedText,
          message,
        });
      }
    }
  }

  return { violations, ignored };
}
