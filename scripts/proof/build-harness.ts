import fs from 'node:fs';
import path from 'node:path';
import { build } from 'esbuild';
import { SITE_ROOT } from '../../src/lib/paths';

const OUT = path.join(SITE_ROOT, '.proof-build', 'harness');

async function main(): Promise<void> {
  fs.mkdirSync(OUT, { recursive: true });
  await build({
    entryPoints: [path.join(SITE_ROOT, 'src/lib/proof/runtime/harness-entry.ts')],
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: ['chrome120', 'firefox120', 'safari17'],
    outfile: path.join(OUT, 'harness.js'),
    minify: false,
    sourcemap: false,
    logLevel: 'warning',
  });
  // Local React vendor bundle (when present), served from the harness origin.
  const vendor = path.join(SITE_ROOT, '.proof-build', 'vendor', 'react.js');
  if (fs.existsSync(vendor)) {
    fs.mkdirSync(path.join(OUT, 'vendor'), { recursive: true });
    fs.copyFileSync(vendor, path.join(OUT, 'vendor', 'react.js'));
  }
  fs.writeFileSync(
    path.join(OUT, 'index.html'),
    `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8" /><title>frontend.rocks proof harness</title>
<style>html, body { margin: 0; padding: 0; } #stage { position: absolute; left: 0; top: 0; }</style>
</head><body><div id="stage"></div><script src="harness.js"></script></body></html>\n`
  );
  console.log('✅ Proof harness built in .proof-build/harness');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
