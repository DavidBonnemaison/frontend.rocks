import fs from 'fs';
import {
  formatBaselineRadarMarkdown,
  syncBaselineRadar,
} from '../src/lib/baseline-radar';
import { SITE_ROOT } from '../src/lib/paths';

function parseArgValue(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  if (idx === -1) return undefined;
  return args[idx + 1];
}

function main(): void {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const asJson = args.includes('--json');
  const writeDigest = args.includes('--write-digest');
  const reportOut = parseArgValue(args, '--report-out');

  const report = syncBaselineRadar({
    rootDir: SITE_ROOT,
    dryRun,
    writeDigest,
  });

  const markdown = formatBaselineRadarMarkdown(report);

  if (reportOut) {
    fs.writeFileSync(reportOut, `${markdown}\n`, 'utf-8');
  }

  if (asJson) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(markdown);
  }
}

main();
