import fs from 'node:fs';
import { parseCliArgs } from '../../src/lib/cli-args';
import { historyDir } from '../../src/lib/proof/history-loader';
import {
  DURATION_BUDGET_MS,
  evaluateNightlyHealth,
  HEALTH_WINDOW_DAYS,
  readRecentRunRecords,
  STALE_RUN_HOURS,
} from '../../src/lib/proof/nightly/health';

function formatMinutes(ms: number | null): string {
  if (ms === null) return 'n/a';
  return `${(ms / 60_000).toFixed(2)} min`;
}

async function main(): Promise<void> {
  const args = parseCliArgs(process.argv.slice(2), {
    'history-dir': 'string',
    now: 'string',
  });

  const now = args.now ? new Date(args.now) : new Date();
  if (Number.isNaN(now.getTime())) {
    console.error(`Invalid --now timestamp: "${args.now}"`);
    process.exit(2);
  }

  const dir = args['history-dir'] ?? historyDir();
  const records = readRecentRunRecords(dir, now, HEALTH_WINDOW_DAYS);
  const report = evaluateNightlyHealth(records, now);

  const lines = [
    '## Nightly proof health (last 30 days)',
    '',
    `- **Runs**: ${report.runsCount}`,
    `- **Last run**: ${report.lastRunAt ?? 'none'}`,
    `- **Age**: ${report.ageHours !== null ? `${report.ageHours.toFixed(1)} h` : 'n/a'} (limit: ${STALE_RUN_HOURS} h)`,
    `- **Median duration**: ${formatMinutes(report.medianDurationMs)} (target: ${(DURATION_BUDGET_MS / 60_000).toFixed(0)} min)`,
    `- **Max duration**: ${formatMinutes(report.maxDurationMs)}`,
    `- **Status**: ${report.stale ? 'STALE' : report.aboveDurationBudget ? 'SLOW' : 'OK'}`,
    '',
  ];

  const output = lines.join('\n');
  console.log(output);

  if (process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, output + '\n');
  }

  if (report.stale) {
    console.error(
      `❌ Proof nightly is stale: last run ${report.lastRunAt ?? 'never'} (> ${STALE_RUN_HOURS}h ago).`
    );
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
