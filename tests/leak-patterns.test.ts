import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { findLeak, isExcepted, loadPatterns } from '../scripts/ci/leak-patterns.mjs';

// Literals are assembled at runtime: this public file must not trip the scan it tests.
const KEY = ['GEMINI', 'API', 'KEY'].join('_');
const AGENTS_DIR = ['.agen', 'ts/'].join('');
const AGENTS_PATTERN = ['\\.agen', 'ts/'].join('');
const EPICS_DIR = ['docs/', 'epics'].join('');
const SCOUT = ['topic', 'scout'].join('-');

const script = path.join(process.cwd(), 'scripts/ci/leak-patterns.mjs');

function runMeta(env: Record<string, string>) {
  return spawnSync('node', [script, 'meta', 'HEAD'], {
    env: { ...process.env, PR_TITLE: '', PR_BODY: '', HEAD_REF: '', ...env },
    encoding: 'utf8',
  });
}

describe('leak patterns', () => {
  it('loads one pattern per line without blanks', () => {
    const patterns = loadPatterns();
    expect(patterns).toContain(KEY);
    expect(patterns.every((p) => p.trim() !== '')).toBe(true);
  });

  it('matches case-insensitively and reports the line', () => {
    expect(findLeak(`ok\nuses ${KEY.toLowerCase()} here`, loadPatterns())).toEqual({ line: 2, pattern: KEY });
    expect(findLeak('nothing to see', loadPatterns())).toBeNull();
  });

  it('scopes exceptions to their patterns', () => {
    expect(isExcepted('src/lib/public-skill-bundle.ts', AGENTS_PATTERN)).toBe(true);
    expect(isExcepted('src/lib/public-skill-bundle.ts', KEY)).toBe(false);
    expect(isExcepted('scripts/ci/leak-patterns.txt', KEY)).toBe(true);
  });

  it('meta mode blocks a title, body or branch that cites a private path', () => {
    expect(runMeta({ PR_TITLE: `move ${AGENTS_DIR} around` }).status).toBe(1);
    expect(runMeta({ PR_BODY: `see ${EPICS_DIR}` }).status).toBe(1);
    expect(runMeta({ HEAD_REF: `${SCOUT}-fix` }).status).toBe(1);
    expect(runMeta({ PR_TITLE: 'content: css-subgrid' }).status).toBe(0);
  });
});
