import fs from 'node:fs';
import path from 'node:path';
import { parseCliArgs } from '../src/lib/cli-args';
import {
  formatBaselineRadarMarkdown,
  syncBaselineRadar,
} from '../src/lib/baseline-radar';
import { SITE_ROOT } from '../src/lib/paths';

/**
 * Compares the committed snapshot (`git show HEAD:content/.proof-cache/support-snapshot.json`)
 * against the currently installed `@mdn/browser-compat-data` and `web-features` packages,
 * and prints (or writes via `--report-out`) the Markdown radar report.
 */
async function main(): Promise<void> {
  const args = parseCliArgs(process.argv.slice(2), {
    'dry-run': 'boolean',
    json: 'boolean',
    'write-digest': 'boolean',
    'report-out': 'string',
  });

  const report = syncBaselineRadar({
    rootDir: SITE_ROOT,
    dryRun: Boolean(args['dry-run']),
    writeDigest: Boolean(args['write-digest']),
  });

  const markdown = formatBaselineRadarMarkdown(report);

  if (args['report-out']) {
    fs.mkdirSync(path.dirname(args['report-out']), { recursive: true });
    fs.writeFileSync(args['report-out'], `${markdown}\n`, 'utf-8');
  }

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(markdown);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
