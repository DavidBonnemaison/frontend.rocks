import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { parseCliArgs } from '../../src/lib/cli-args';
import { CONTENT_DIR, SITE_ROOT } from '../../src/lib/paths';
import type { ExperimentBundle } from '../../src/lib/proof/experiment-schema';
import { RUNTIME_VERSION } from '../../src/lib/proof/runtime/protocol';
import { buildExperimentFromSource, listExperimentFolders } from './build-experiments';

export const ALLOWED_PARENTS_PROD = ['https://frontend.rocks'];
export const ALLOWED_PARENTS_DEV = [
  'https://frontend.rocks',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:4173',
  'http://127.0.0.1:4175',
];

const HOST_HTML =
  '<!DOCTYPE html><meta charset="utf-8"><title>frontend.rocks lab</title><script src="/runtime/lab-host.js"></script>\n';

const HEADERS_FILE = `/*
  Content-Security-Policy: frame-ancestors *
  X-Robots-Tag: noindex, nofollow
  Cache-Control: no-store
`;

const ROBOTS_TXT = `User-agent: *
Disallow: /
`;

const PARENT_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>frontend.rocks lab test parent</title>
  <style>html, body { margin: 0; padding: 0; } #stage { position: absolute; left: 0; top: 0; }</style>
</head>
<body>
  <div id="stage"></div>
  <script src="/__test/parent.js"></script>
</body>
</html>
`;

function gitCommit(): string {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: SITE_ROOT,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return 'unknown';
  }
}

function collectBundlesFromDir(dir: string): ExperimentBundle[] {
  const bundles: ExperimentBundle[] = [];
  for (const folder of listExperimentFolders(dir)) {
    const src = fs.readFileSync(path.join(dir, folder, 'experiment.ts'), 'utf-8');
    const outcome = buildExperimentFromSource(src, folder);
    if (!outcome.bundle) {
      throw new Error(
        `Failed to build experiment "${folder}" from ${dir}:\n${outcome.errors.join('\n')}`
      );
    }
    bundles.push(outcome.bundle);
  }
  return bundles;
}

export interface BuildLabSiteOptions {
  dev?: boolean;
  outDir?: string;
}

export async function buildLabSite(opts: BuildLabSiteOptions = {}): Promise<{ outDir: string; originCount: number }> {
  const dev = Boolean(opts.dev);
  const outDir = opts.outDir ?? path.join(SITE_ROOT, dev ? 'dist-lab-dev' : 'dist-lab');
  const allowedParents = dev ? ALLOWED_PARENTS_DEV : ALLOWED_PARENTS_PROD;

  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(path.join(outDir, 'runtime'), { recursive: true });

  const bundles = collectBundlesFromDir(path.join(CONTENT_DIR, 'experiments'));
  if (dev) {
    const fixturesDir = path.join(SITE_ROOT, 'tests', 'fixtures', 'experiments');
    bundles.push(...collectBundlesFromDir(fixturesDir));
  }
  bundles.sort((a, b) => a.id.localeCompare(b.id));

  const experimentsMap: Record<string, string> = {};
  let originCount = 0;

  for (const bundle of bundles) {
    if (bundle.host === 'origin') {
      originCount += 1;
      const expDir = path.join(outDir, 'x', bundle.id);
      fs.mkdirSync(expDir, { recursive: true });
      fs.writeFileSync(path.join(expDir, 'host.html'), HOST_HTML);
      if (bundle.serviceWorker) {
        fs.writeFileSync(path.join(expDir, 'sw.js'), bundle.serviceWorker);
      }
      experimentsMap[bundle.id] = bundle.sourceHash;
    }
    if (dev) {
      const bundlesDir = path.join(outDir, '__bundles');
      fs.mkdirSync(bundlesDir, { recursive: true });
      fs.writeFileSync(path.join(bundlesDir, `${bundle.id}.json`), JSON.stringify(bundle, null, 2) + '\n');
    }
  }

  await build({
    entryPoints: [path.join(SITE_ROOT, 'src/lib/proof/runtime/lab-host.ts')],
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: ['chrome120', 'firefox120', 'safari17'],
    define: {
      __FR_LAB_ALLOWED_PARENTS__: JSON.stringify(allowedParents),
    },
    outfile: path.join(outDir, 'runtime', 'lab-host.js'),
    minify: false,
    sourcemap: false,
    logLevel: 'warning',
  });

  const vendorSrc = path.join(SITE_ROOT, '.proof-build', 'vendor', 'react.js');
  if (fs.existsSync(vendorSrc)) {
    fs.mkdirSync(path.join(outDir, 'vendor'), { recursive: true });
    fs.copyFileSync(vendorSrc, path.join(outDir, 'vendor', 'react.js'));
  }

  if (dev) {
    const parentEntry = path.join(SITE_ROOT, 'tests', 'fixtures', 'lab', 'parent-entry.ts');
    if (fs.existsSync(parentEntry)) {
      const testDir = path.join(outDir, '__test');
      fs.mkdirSync(testDir, { recursive: true });
      await build({
        entryPoints: [parentEntry],
        bundle: true,
        format: 'iife',
        platform: 'browser',
        target: ['chrome120', 'firefox120', 'safari17'],
        outfile: path.join(testDir, 'parent.js'),
        minify: false,
        sourcemap: false,
        logLevel: 'warning',
      });
      fs.writeFileSync(path.join(testDir, 'parent.html'), PARENT_HTML);
    }
  }

  const buildInfo = {
    commit: gitCommit(),
    runtimeVersion: RUNTIME_VERSION,
    generatedAt: new Date().toISOString(),
    experiments: experimentsMap,
  };
  fs.writeFileSync(path.join(outDir, 'build-info.json'), JSON.stringify(buildInfo, null, 2) + '\n');
  fs.writeFileSync(path.join(outDir, '_headers'), HEADERS_FILE);
  fs.writeFileSync(path.join(outDir, 'robots.txt'), ROBOTS_TXT);

  return { outDir, originCount };
}

async function main(): Promise<void> {
  const args = parseCliArgs(process.argv.slice(2), { dev: 'boolean' });
  const { outDir, originCount } = await buildLabSite({ dev: Boolean(args.dev) });
  console.log(
    `✅ Built lab site (${args.dev ? 'dev' : 'prod'}, ${originCount} origin experiment(s)) into ${path.relative(SITE_ROOT, outDir)}`
  );
}

const CURRENT_FILE = typeof __filename !== 'undefined' ? __filename : fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(CURRENT_FILE)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
