#!/usr/bin/env node
// Leak patterns shared by the public leak-scan workflow and the private split check.
// No dependency. The pattern list lives next to this file (leak-patterns.txt):
// one POSIX extended regular expression per line, readable by `grep -E -f` and by Node.
//
// Usage:
//   node scripts/ci/leak-patterns.mjs files   scan tracked text files
//   node scripts/ci/leak-patterns.mjs meta    scan PR_TITLE, PR_BODY, HEAD_REF and commit messages
//
// Commit messages are read from `git log <base>..HEAD`. The base is, in order:
// the second CLI argument, GITHUB_BASE_REF (set by GitHub on pull_request events) as origin/<ref>,
// then origin/main.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MAX_TEXT_BYTES = 2 * 1024 * 1024;

/**
 * Files that may legitimately contain a pattern. `patterns` lists the regex sources
 * (as written in leak-patterns.txt) that are allowed in that file; absent means all of them.
 * @type {ReadonlyArray<{ file: string; patterns?: readonly string[] }>}
 */
export const EXCEPTIONS = [
  { file: 'scripts/ci/leak-patterns.mjs' },
  { file: 'scripts/ci/leak-patterns.txt' },
  { file: 'src/lib/public-skill-bundle.ts', patterns: ['\\.agents/'] },
  { file: 'tests/audit-rules.test.ts', patterns: ['\\.agents/'] },
];

/** @returns {string[]} regex sources, in file order */
export function loadPatterns() {
  return fs
    .readFileSync(path.join(HERE, 'leak-patterns.txt'), 'utf8')
    .split(/\r?\n/)
    .filter((line) => line.trim() !== '');
}

/** True when `file` is allowed to contain `patternSource`. */
export function isExcepted(file, patternSource) {
  return EXCEPTIONS.some(
    (e) => e.file === file && (e.patterns === undefined || e.patterns.includes(patternSource))
  );
}

/**
 * First hit of any pattern in `text`, case-insensitive, or null.
 * @param {string} text
 * @param {readonly string[]} patterns
 * @param {(patternSource: string) => boolean} [skip]
 * @returns {{ line: number; pattern: string } | null}
 */
export function findLeak(text, patterns, skip) {
  const compiled = patterns.filter((p) => !skip || !skip(p)).map((p) => ({ p, re: new RegExp(p, 'i') }));
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    for (const { p, re } of compiled) {
      if (re.test(lines[i])) return { line: i + 1, pattern: p };
    }
  }
  return null;
}

/** Read a tracked file as text, or null when it is too large or binary. */
export function readTextFile(absPath) {
  const stat = fs.statSync(absPath);
  if (!stat.isFile() || stat.size >= MAX_TEXT_BYTES) return null;
  const buf = fs.readFileSync(absPath);
  if (buf.subarray(0, 8000).includes(0)) return null;
  return buf.toString('utf8');
}

function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

function scanFiles(root) {
  const patterns = loadPatterns();
  const files = git(['ls-files', '-z'], root).split('\0').filter(Boolean);
  for (const file of files) {
    const abs = path.join(root, file);
    if (!fs.existsSync(abs)) continue;
    const text = readTextFile(abs);
    if (text === null) continue;
    const hit = findLeak(text, patterns, (p) => isExcepted(file, p));
    if (hit) {
      console.error(`LEAK ${file}:${hit.line} matches /${hit.pattern}/i`);
      return 1;
    }
  }
  console.log('leak-patterns: no leak found in tracked files');
  return 0;
}

function scanMeta(root, baseArg) {
  const patterns = loadPatterns();
  const fields = [
    ['PR_TITLE', process.env.PR_TITLE ?? ''],
    ['PR_BODY', process.env.PR_BODY ?? ''],
    ['HEAD_REF', process.env.HEAD_REF ?? ''],
  ];
  const base = baseArg || (process.env.GITHUB_BASE_REF ? `origin/${process.env.GITHUB_BASE_REF}` : 'origin/main');
  let log = '';
  try {
    log = git(['log', '--format=%B', `${base}..HEAD`], root);
  } catch {
    console.error(`leak-patterns: cannot read commit messages from ${base}..HEAD, skipping that field`);
  }
  fields.push(['commit messages', log]);
  for (const [name, value] of fields) {
    const hit = findLeak(value, patterns);
    if (hit) {
      console.error(`LEAK ${name}:${hit.line} matches /${hit.pattern}/i`);
      return 1;
    }
  }
  console.log('leak-patterns: no leak found in PR metadata');
  return 0;
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  const mode = process.argv[2];
  const root = process.cwd();
  if (mode === 'files') process.exit(scanFiles(root));
  else if (mode === 'meta') process.exit(scanMeta(root, process.argv[3]));
  else {
    console.error('usage: leak-patterns.mjs files | meta [baseRef]');
    process.exit(2);
  }
}
