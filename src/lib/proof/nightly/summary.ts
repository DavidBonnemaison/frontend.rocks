import { ENGINE_IDS, type ClaimStatus, type EngineId } from '../claim-schema';
import type { PageStatusChange } from '../claim-status';
import type { ClaimEngineStatus, ProofResults } from '../results-schema';
import type { NightlyDiff } from './diff';

export interface StepOutcome {
  ok: boolean;
  status: number | null;
  ms: number;
}

export interface StatusTotals {
  proven: number;
  diverges: number;
  failed: number;
  stale: number;
  pending: number;
}

export interface RenderPrBodyInput {
  date: string;
  next: ProofResults;
  diff: NightlyDiff;
  demotions: PageStatusChange[];
  promotions: PageStatusChange[];
}

export interface RenderSummaryInput extends RenderPrBodyInput {
  steps: Record<string, StepOutcome>;
  totalDurationMs: number;
}

export interface BuildHistoryLinesInput {
  next: ProofResults;
  diff: NightlyDiff;
  now: Date;
  durationMs: number;
  distro: string;
}

const ENGINE_DISPLAY: Record<EngineId, string> = {
  chromium: 'Chromium',
  firefox: 'Firefox',
  webkit: 'WebKit',
};

export function computeStatusTotals(results: ProofResults): StatusTotals {
  const totals: StatusTotals = {
    proven: 0,
    diverges: 0,
    failed: 0,
    stale: 0,
    pending: 0,
  };
  for (const claim of Object.values(results.claims)) {
    const status: ClaimStatus = claim.status;
    totals[status] = (totals[status] ?? 0) + 1;
  }
  return totals;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const secs = ms / 1000;
  if (secs < 60) return `${secs.toFixed(1)}s`;
  const mins = Math.floor(secs / 60);
  const rem = Math.round(secs % 60);
  return `${mins}m ${rem}s`;
}

function formatEnginesList(engines: ProofResults['engines']): string[] {
  const lines: string[] = [];
  for (const engine of ENGINE_IDS) {
    const version = engines[engine];
    if (version) {
      lines.push(`- ${ENGINE_DISPLAY[engine]}: \`${version}\``);
    }
  }
  return lines;
}

/**
 * Renders the nightly pull request body (totals, engine versions, regressions,
 * recoveries, demoted/promoted pages, infra errors count).
 */
export function renderPrBody(input: RenderPrBodyInput): string {
  const totals = computeStatusTotals(input.next);
  const lines: string[] = [
    `## Nightly proof results (${input.date})`,
    '',
    '### Totals',
    '',
    `- **proven**: ${totals.proven}`,
    `- **diverges**: ${totals.diverges}`,
    `- **failed**: ${totals.failed}`,
    `- **stale**: ${totals.stale}`,
    `- **pending**: ${totals.pending}`,
    `- **infraErrors**: ${input.diff.infraErrors.length}`,
  ];

  const engineLines = formatEnginesList(input.next.engines);
  if (engineLines.length > 0) {
    lines.push('', '### Engines', '', ...engineLines);
  }

  lines.push('', '### Regressions', '');
  if (input.diff.regressions.length === 0) {
    lines.push('- None');
  } else {
    for (const reg of input.diff.regressions) {
      lines.push(`- \`${reg.claimId}\`: \`${reg.from}\` -> \`${reg.to}\``);
    }
  }

  lines.push('', '### Recoveries', '');
  if (input.diff.recoveries.length === 0) {
    lines.push('- None');
  } else {
    for (const rec of input.diff.recoveries) {
      lines.push(`- \`${rec.claimId}\`: \`${rec.from}\` -> \`${rec.to}\``);
    }
  }

  lines.push('', '### Demoted pages (7+ days failing)', '');
  if (input.demotions.length === 0) {
    lines.push('- None');
  } else {
    for (const page of input.demotions) {
      lines.push(
        `- \`${page.pageId}\` (\`${page.file}\`): ${page.claimIds.map((id) => `\`${id}\``).join(', ')}`
      );
    }
  }

  lines.push('', '### Promoted pages (repaired)', '');
  if (input.promotions.length === 0) {
    lines.push('- None');
  } else {
    for (const page of input.promotions) {
      lines.push(`- \`${page.pageId}\` (\`${page.file}\`)`);
    }
  }

  lines.push('');
  return lines.join('\n');
}

/**
 * Renders the GitHub Actions job summary (failing steps first, per-step durations
 * and exit codes, plus the nightly results overview).
 */
export function renderSummary(input: RenderSummaryInput): string {
  const stepEntries = Object.entries(input.steps);
  const failedSteps = stepEntries.filter(([, outcome]) => !outcome.ok);
  const lines: string[] = [
    `## Proof nightly summary (${input.date})`,
    '',
    `- **Total duration**: ${formatDuration(input.totalDurationMs)}`,
    `- **Failed steps**: ${failedSteps.length}`,
    `- **Infra errors**: ${input.diff.infraErrors.length}`,
  ];

  if (failedSteps.length > 0) {
    lines.push('', '### Failed steps', '');
    for (const [name, outcome] of failedSteps) {
      lines.push(
        `- \`${name}\`: exit \`${outcome.status ?? 'null'}\` (${formatDuration(outcome.ms)})`
      );
    }
  }

  if (stepEntries.length > 0) {
    lines.push('', '### Steps', '', '| Step | Result | Exit | Duration |', '| :--- | :--- | ---: | ---: |');
    for (const [name, outcome] of stepEntries) {
      lines.push(
        `| \`${name}\` | ${outcome.ok ? 'ok' : 'failed'} | ${outcome.status ?? '-'} | ${formatDuration(outcome.ms)} |`
      );
    }
  }

  lines.push('', renderPrBody(input).trimEnd(), '');
  return lines.join('\n');
}

function filterPassFailEngines(
  engines: Partial<Record<EngineId, ClaimEngineStatus>> | null
): Partial<Record<EngineId, 'pass' | 'fail'>> | undefined {
  if (!engines) return undefined;
  const out: Partial<Record<EngineId, 'pass' | 'fail'>> = {};
  let hasAny = false;
  for (const engine of ENGINE_IDS) {
    const v = engines[engine];
    if (v === 'pass' || v === 'fail') {
      out[engine] = v;
      hasAny = true;
    }
  }
  return hasAny ? out : undefined;
}

/**
 * Builds the JSONL lines to append to `content/.proof-results/history/<yyyy-mm>.jsonl`:
 * one `run` line followed by one `claim` line per claim whose status changed.
 */
export function buildHistoryLines(input: BuildHistoryLinesInput): string {
  const at = input.now.toISOString();
  const totals = computeStatusTotals(input.next);

  const runLine = {
    kind: 'run',
    at,
    engines: input.next.engines,
    playwright: input.next.runner.playwright,
    os: input.next.runner.os === 'none' ? process.platform : input.next.runner.os,
    distro: input.distro,
    totals,
    durationMs: Math.max(0, Math.round(input.durationMs)),
    infraErrors: input.diff.infraErrors.length,
  };

  const lines: string[] = [JSON.stringify(runLine)];

  for (const change of input.diff.statusChanged) {
    const claimResult = input.next.claims[change.claimId];
    const engines = claimResult ? filterPassFailEngines(claimResult.engines) : undefined;
    const claimLine: Record<string, unknown> = {
      kind: 'claim',
      at,
      claimId: change.claimId,
      from: change.from,
      to: change.to,
    };
    if (engines) {
      claimLine.engines = engines;
    }
    lines.push(JSON.stringify(claimLine));
  }

  return lines.join('\n') + '\n';
}
