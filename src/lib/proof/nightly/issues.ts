import { ENGINE_IDS, splitClaimId, type EngineId } from '../claim-schema';
import type { ProofResults } from '../results-schema';
import type { NightlyDiff } from './diff';

export interface IssueOpenAction {
  key: string;
  title: string;
  body: string;
  labels: string[];
}

export interface IssueCommentAction {
  key: string;
  body: string;
}

export interface IssueCloseAction {
  key: string;
  comment: string;
}

export interface NightlyIssues {
  open: IssueOpenAction[];
  comment: IssueCommentAction[];
  close: IssueCloseAction[];
}

export interface BuildIssuesOptions {
  statementsByClaimId?: ReadonlyMap<string, string>;
  medianDurationMs?: number | null;
}

const MS_PER_DAY = 86_400_000;
const DEMOTION_GRACE_DAYS = 7;
const DURATION_ALERT_THRESHOLD_MS = 12 * 60_000;

const ENGINE_DISPLAY: Record<EngineId, string> = {
  chromium: 'Chromium',
  firefox: 'Firefox',
  webkit: 'WebKit',
};

function utcDayNumber(iso: string): number {
  const d = new Date(iso);
  return Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / MS_PER_DAY);
}

function shortVersion(version: string): string {
  const dot = version.indexOf('.');
  return dot > 0 ? version.slice(0, dot) : version;
}

function formatEngineVersionsShort(engines: ProofResults['engines']): string {
  const parts: string[] = [];
  for (const engine of ENGINE_IDS) {
    const version = engines[engine];
    if (version) {
      parts.push(`${ENGINE_DISPLAY[engine]} ${shortVersion(version)}`);
    }
  }
  return parts.join(', ');
}

function formatEngineStatusLines(
  claimEngines: Partial<Record<EngineId, 'pass' | 'fail'>> | null,
  runEngines: ProofResults['engines']
): string[] {
  const lines: string[] = [];
  for (const engine of ENGINE_IDS) {
    const status = claimEngines?.[engine];
    const version = runEngines[engine];
    if (status) {
      lines.push(
        `- ${ENGINE_DISPLAY[engine]}${version ? ` ${version}` : ''}: \`${status}\``
      );
    } else if (!claimEngines && version) {
      lines.push(`- ${ENGINE_DISPLAY[engine]}: \`${version}\``);
    }
  }
  return lines;
}

/**
 * Generates GitHub issue actions (open, day-7 comment, recovery close) from a
 * nightly diff and the resulting ProofResults.
 */
export function buildIssues(
  diff: NightlyDiff,
  next: ProofResults,
  now: Date,
  options: BuildIssuesOptions = {}
): NightlyIssues {
  const open: IssueOpenAction[] = [];
  const comment: IssueCommentAction[] = [];
  const close: IssueCloseAction[] = [];

  for (const reg of diff.regressions) {
    const key = `proof-regression:${reg.claimId}`;
    const { pageId, slug } = splitClaimId(reg.claimId);
    const permalink = `https://frontend.rocks/claims/${pageId}/${slug}/`;
    const statement = options.statementsByClaimId?.get(reg.claimId) ?? null;

    const bodyLines: string[] = [
      `<!-- key: ${key} -->`,
      '',
      `Claim: \`${reg.claimId}\``,
      `Permalink: ${permalink}`,
    ];
    if (statement) {
      bodyLines.push(`Statement: ${statement}`);
    }
    bodyLines.push(`Status: \`${reg.from}\` -> \`${reg.to}\``);

    const engineLines = formatEngineStatusLines(reg.engines, next.engines);
    if (engineLines.length > 0) {
      bodyLines.push('', 'Engines:', ...engineLines);
    }
    if (reg.detail) {
      bodyLines.push('', `Detail: ${reg.detail}`);
    }
    bodyLines.push(
      '',
      'If this is not resolved within 7 days, the page is shown as unverified and removed from the index.'
    );

    open.push({
      key,
      title: `[proof] ${reg.claimId} now ${reg.to}`,
      body: bodyLines.join('\n'),
      labels: ['proof-regression', 'automated'],
    });
  }

  // Day-7 comment emitted once on the exact UTC day when age reaches 7 days.
  const nowDay = utcDayNumber(now.toISOString());
  for (const claimId of Object.keys(next.claims).sort((a, b) => a.localeCompare(b))) {
    const entry = next.claims[claimId];
    if (entry.status === 'proven' || !entry.failingSince) continue;
    const ageDays = nowDay - utcDayNumber(entry.failingSince);
    if (ageDays === DEMOTION_GRACE_DAYS) {
      const { pageId } = splitClaimId(claimId);
      comment.push({
        key: `proof-regression:${claimId}`,
        body: `Day 7: the page ${pageId} is now shown as unverified and removed from the index until this claim is proven again.`,
      });
    }
  }

  const dateStr = now.toISOString().slice(0, 10);
  const enginesShort = formatEngineVersionsShort(next.engines);
  for (const rec of diff.recoveries) {
    close.push({
      key: `proof-regression:${rec.claimId}`,
      comment: enginesShort
        ? `Back to proven on ${dateStr} (${enginesShort}).`
        : `Back to proven on ${dateStr}.`,
    });
  }

  if (
    options.medianDurationMs != null &&
    options.medianDurationMs > DURATION_ALERT_THRESHOLD_MS
  ) {
    const minutes = (options.medianDurationMs / 60_000).toFixed(1);
    const key = 'proof-health:nightly-duration';
    open.push({
      key,
      title: '[proof] nightly duration above 12 min',
      body: [
        `<!-- key: ${key} -->`,
        '',
        `The 30-day median nightly verification duration is ${minutes} min, above the 12 min target.`,
        `Measured on ${dateStr}.`,
      ].join('\n'),
      labels: ['proof-regression', 'automated'],
    });
  }

  return { open, comment, close };
}
