import { BROWSER_LABELS, CORE_BROWSERS, getBcdSupport } from './bcd';
import { getBaseline } from './baseline';

export type RenderSupportStatementResult =
  | { ok: true; statement: string }
  | { ok: false; reason: string; message: string };

function formatEnglishList(items: string[]): string {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0];
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

function formatSinceClause(date: string | null): string {
  if (!date || date.startsWith('≤')) return '';
  return ` (since ${date})`;
}

/**
 * Generates the deterministic canonical English statement for a support claim or `<Support variant="sentence" />`.
 */
export function renderSupportStatement(proof: {
  bcdKey?: string;
  webFeatureId?: string;
}): RenderSupportStatementResult {
  if (!proof.bcdKey && !proof.webFeatureId) {
    return {
      ok: false,
      reason: 'missing-support-key',
      message: 'Either bcdKey or webFeatureId must be provided',
    };
  }

  if (proof.bcdKey) {
    const bcd = getBcdSupport(proof.bcdKey);
    if (!bcd.exists) {
      return {
        ok: false,
        reason: 'unknown-bcd-key',
        message: `Unknown BCD key "${proof.bcdKey}"`,
      };
    }

    if (!proof.webFeatureId) {
      const supportedList: string[] = [];
      const missingList: string[] = [];
      for (const browser of CORE_BROWSERS) {
        const entry = bcd.browsers[browser];
        if (entry.status === 'supported' && entry.since) {
          supportedList.push(`${BROWSER_LABELS[browser]} ${entry.since}`);
        } else {
          missingList.push(BROWSER_LABELS[browser]);
        }
      }

      if (supportedList.length === 0) {
        return {
          ok: true,
          statement: `\`${proof.bcdKey}\` is not supported in ${formatEnglishList(missingList)}.`,
        };
      }

      const missingPart =
        missingList.length > 0 ? `; not supported in ${formatEnglishList(missingList)}` : '';
      return {
        ok: true,
        statement: `\`${proof.bcdKey}\` is supported in ${formatEnglishList(supportedList)}${missingPart}.`,
      };
    }
  }

  const wfId = proof.webFeatureId!;
  const baselineLookup = getBaseline(wfId);
  if (!baselineLookup.ok) {
    const reason =
      baselineLookup.reason === 'moved'
        ? 'web-feature-moved'
        : baselineLookup.reason === 'split'
          ? 'web-feature-split'
          : 'unknown-web-feature';
    return {
      ok: false,
      reason,
      message: baselineLookup.message,
    };
  }

  const { info } = baselineLookup;
  if (info.baseline === 'high') {
    return {
      ok: true,
      statement: `${info.name} is Baseline Widely available${formatSinceClause(info.highDate)}.`,
    };
  }
  if (info.baseline === 'low') {
    return {
      ok: true,
      statement: `${info.name} is Baseline Newly available${formatSinceClause(info.lowDate)}.`,
    };
  }

  const missingBrowsers = CORE_BROWSERS.filter((b) => !info.support[b]).map(
    (b) => BROWSER_LABELS[b]
  );
  if (missingBrowsers.length === 0) {
    return {
      ok: true,
      statement: `${info.name} is not Baseline yet.`,
    };
  }
  return {
    ok: true,
    statement: `${info.name} is not Baseline: it is not yet supported in ${formatEnglishList(missingBrowsers)}.`,
  };
}
