import { createHighlighter, type Highlighter } from 'shiki';

export const SHIKI_THEME = 'github-dark-default' as const;

export const PRELOADED_LANGS = [
  'ts',
  'tsx',
  'js',
  'jsx',
  'css',
  'html',
  'json',
  'http',
  'bash',
] as const;

let highlighterPromise: Promise<Highlighter> | null = null;
let loadedLangsCache: ReadonlySet<string> | null = null;

async function getHighlighter(): Promise<{
  highlighter: Highlighter;
  loadedLangs: ReadonlySet<string>;
}> {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({
      themes: [SHIKI_THEME],
      langs: [...PRELOADED_LANGS],
    });
  }
  const highlighter = await highlighterPromise;
  if (!loadedLangsCache) {
    loadedLangsCache = new Set(highlighter.getLoadedLanguages().map((l) => l.toLowerCase()));
  }
  return { highlighter, loadedLangs: loadedLangsCache };
}

export function resolveShikiLanguage(
  lang: string | undefined,
  loadedLanguages: ReadonlySet<string>
): string {
  const normalized = (lang ?? '').trim().toLowerCase();
  if (!normalized || normalized === 'text' || normalized === 'plaintext' || normalized === 'txt') {
    return 'text';
  }
  if (loadedLanguages.has(normalized)) {
    return normalized;
  }
  return 'text';
}

export async function highlightCode(
  code: string,
  lang?: string
): Promise<{ html: string; resolvedLang: string }> {
  const { highlighter, loadedLangs } = await getHighlighter();
  const resolvedLang = resolveShikiLanguage(lang, loadedLangs);
  const html = highlighter.codeToHtml(code, {
    lang: resolvedLang,
    theme: SHIKI_THEME,
  });
  return { html, resolvedLang };
}
