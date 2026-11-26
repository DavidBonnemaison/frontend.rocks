import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { PUBLIC_DIR, SITE_ROOT } from '../../src/lib/paths';

const OUT = path.join(SITE_ROOT, '.proof-build', 'vendor');
const PUBLIC_VENDOR_OUT = path.join(PUBLIC_DIR, 'experiments', 'vendor');

function readPackageVersion(pkg: string): string {
  const pkgJson = path.join(SITE_ROOT, 'node_modules', pkg, 'package.json');
  const parsed = JSON.parse(fs.readFileSync(pkgJson, 'utf-8')) as { version: string };
  return parsed.version;
}

export async function buildVendor(): Promise<void> {
  fs.mkdirSync(OUT, { recursive: true });
  await build({
    stdin: {
      contents: [
        "import * as React from 'react';",
        "import * as ReactDOM from 'react-dom';",
        "import * as ReactDOMClient from 'react-dom/client';",
        'window.React = React;',
        'window.ReactDOM = Object.assign({}, ReactDOM, ReactDOMClient);',
      ].join('\n'),
      resolveDir: SITE_ROOT,
      loader: 'js',
    },
    bundle: true,
    format: 'iife',
    platform: 'browser',
    minify: true,
    define: { 'process.env.NODE_ENV': '"production"' },
    outfile: path.join(OUT, 'react.js'),
    logLevel: 'warning',
  });

  const versions = {
    react: readPackageVersion('react'),
    'react-dom': readPackageVersion('react-dom'),
  };
  fs.writeFileSync(path.join(OUT, 'versions.json'), JSON.stringify(versions, null, 2) + '\n');
}

async function main(): Promise<void> {
  await buildVendor();
  fs.mkdirSync(PUBLIC_VENDOR_OUT, { recursive: true });
  fs.copyFileSync(path.join(OUT, 'react.js'), path.join(PUBLIC_VENDOR_OUT, 'react.js'));
  console.log('✅ Built local React vendor bundle in .proof-build/vendor and public/experiments/vendor');
}

const CURRENT_FILE = typeof __filename !== 'undefined' ? __filename : fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(CURRENT_FILE)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
