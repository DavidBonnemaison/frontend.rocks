import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { highlightCode, PRELOADED_LANGS, resolveShikiLanguage, SHIKI_THEME } from '@/lib/shiki';

describe('Shiki server-side syntax highlighting', () => {
  it('highlights all preloaded corpus languages with styled token spans', async () => {
    const samples: Record<string, string> = {
      ts: 'const count: number = 42;',
      tsx: 'export const Badge = () => <span className="ok">OK</span>;',
      js: 'function add(a, b) { return a + b; }',
      jsx: 'const el = <button type="button">Copy</button>;',
      css: '.card { position: relative; z-index: 10; }',
      html: '<div class="box" data-open="true">Hello</div>',
      json: '{"status": "ok", "count": 3}',
      http: 'HTTP/1.1 200 OK\nCache-Control: max-age=3600',
      bash: 'npm run build-prod && echo "done"',
      cpp: 'bool ok(int x) { return x > 0; }',
      rust: 'pub fn ok(x: i32) -> bool { x > 0 }',
      markdown: '# Release 19.0\n\n- Added `useActionState`.',
    };

    for (const lang of PRELOADED_LANGS) {
      const { html, resolvedLang } = await highlightCode(samples[lang], lang);
      expect(resolvedLang).toBe(lang);
      expect(html).toContain(`class="shiki ${SHIKI_THEME}"`);
      expect(html).toContain('<span style="color:');
    }
  });

  it('falls back safely to text for empty or unrecognized language tags', async () => {
    const loaded = new Set(['ts', 'js', 'css']);
    expect(resolveShikiLanguage(undefined, loaded)).toBe('text');
    expect(resolveShikiLanguage('', loaded)).toBe('text');
    expect(resolveShikiLanguage('plaintext', loaded)).toBe('text');
    expect(resolveShikiLanguage('unknown-exotic-lang', loaded)).toBe('text');

    const { html, resolvedLang } = await highlightCode('plain output line', 'unknown-exotic-lang');
    expect(resolvedLang).toBe('text');
    expect(html).toContain('plain output line');
    expect(html).toContain('<pre class="shiki');
  });

  it('handles every fenced code block language tag across all concepts and autopsies', async () => {
    const dirs = [
      path.join(process.cwd(), 'content/concepts'),
      path.join(process.cwd(), 'content/autopsies'),
    ];
    const discoveredLangs = new Set<string>();

    for (const dir of dirs) {
      for (const file of fs.readdirSync(dir)) {
        if (!file.endsWith('.mdx')) continue;
        const content = fs.readFileSync(path.join(dir, file), 'utf8');
        for (const match of content.matchAll(/^```([a-zA-Z0-9_-]*)/gm)) {
          discoveredLangs.add(match[1]);
        }
      }
    }

    expect(discoveredLangs.size).toBeGreaterThan(0);

    for (const lang of discoveredLangs) {
      const result = await highlightCode('const ok = true;', lang);
      expect(result.html).toContain('<pre class="shiki');
      expect(result.resolvedLang).toBeTruthy();
    }
  });
});
