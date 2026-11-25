import type { SOURCE_REPOS } from '../claim-schema';

export type SourceRepo = (typeof SOURCE_REPOS)[number];

export interface RepoInfo {
  /** Display label shown in UI and proof receipts. */
  label: string;
  /** Grouping in the proof panel. */
  project: 'blink' | 'v8' | 'webkit' | 'gecko' | 'devtools' | 'react' | 'jsdom';
  defaultBranch: string;
  /** Primary license displayed in captions. "see file header" when it varies per file. */
  license: string;
  /** Allowed path prefixes. Empty array means the whole repository. */
  allowedPrefixes: string[];
  /** Denied path prefixes (third-party code, generated files, large test suites). */
  deniedPrefixes: string[];
}

export const REPOS: Record<SourceRepo, RepoInfo> = {
  'chromium/chromium': {
    label: 'Chromium',
    project: 'blink',
    defaultBranch: 'main',
    license: 'BSD-3-Clause',
    allowedPrefixes: [],
    deniedPrefixes: ['third_party/'],
  },
  'v8/v8': {
    label: 'V8',
    project: 'v8',
    defaultBranch: 'main',
    license: 'BSD-3-Clause',
    allowedPrefixes: ['src/', 'include/'],
    deniedPrefixes: ['third_party/'],
  },
  'WebKit/WebKit': {
    label: 'WebKit',
    project: 'webkit',
    defaultBranch: 'main',
    license: 'see file header',
    allowedPrefixes: ['Source/'],
    deniedPrefixes: ['Source/ThirdParty/'],
  },
  'mozilla-firefox/firefox': {
    label: 'Firefox',
    project: 'gecko',
    defaultBranch: 'main',
    license: 'MPL-2.0',
    allowedPrefixes: [],
    deniedPrefixes: ['third_party/'],
  },
  'ChromeDevTools/devtools-frontend': {
    label: 'Chrome DevTools',
    project: 'devtools',
    defaultBranch: 'main',
    license: 'BSD-3-Clause',
    allowedPrefixes: ['front_end/'],
    deniedPrefixes: ['front_end/third_party/'],
  },
  'react/react': {
    label: 'React',
    project: 'react',
    defaultBranch: 'main',
    license: 'MIT',
    allowedPrefixes: ['packages/', 'CHANGELOG.md'],
    deniedPrefixes: ['fixtures/', 'packages/react-devtools-shared/src/__tests__/'],
  },
  'jsdom/jsdom': {
    label: 'jsdom',
    project: 'jsdom',
    defaultBranch: 'main',
    license: 'MIT',
    allowedPrefixes: ['lib/'],
    deniedPrefixes: [],
  },
};

/** Exception: Chromium's Blink rendering engine lives under third_party/blink/. */
const CHROMIUM_ALLOWED_THIRD_PARTY = ['third_party/blink/'];

export function isSourceRepo(repo: string): repo is SourceRepo {
  return Object.prototype.hasOwnProperty.call(REPOS, repo);
}

export function checkPathAllowed(
  repo: SourceRepo,
  filePath: string
): { ok: true } | { ok: false; reason: 'path-not-allowed'; message: string } {
  if (!filePath || filePath.startsWith('/') || filePath.includes('..')) {
    return {
      ok: false,
      reason: 'path-not-allowed',
      message: 'Path must be relative and must not contain "..".',
    };
  }
  if (/\.(min\.js|map|png|jpg|gif|woff2?|ttf|pdf|bin)$/i.test(filePath)) {
    return { ok: false, reason: 'path-not-allowed', message: 'Binary or generated file.' };
  }
  const info = REPOS[repo];
  const isBlinkException =
    repo === 'chromium/chromium' &&
    CHROMIUM_ALLOWED_THIRD_PARTY.some((p) => filePath.startsWith(p));
  if (!isBlinkException && info.deniedPrefixes.some((p) => filePath.startsWith(p))) {
    return {
      ok: false,
      reason: 'path-not-allowed',
      message: `${filePath} is under a denied prefix of ${repo}.`,
    };
  }
  if (
    !isBlinkException &&
    info.allowedPrefixes.length > 0 &&
    !info.allowedPrefixes.some((p) => filePath.startsWith(p))
  ) {
    return {
      ok: false,
      reason: 'path-not-allowed',
      message: `${filePath} is outside the allowed prefixes of ${repo}: ${info.allowedPrefixes.join(', ')}.`,
    };
  }
  return { ok: true };
}

const EXTENSION_LANGUAGE_MAP: Record<string, string> = {
  cc: 'cpp',
  cpp: 'cpp',
  cxx: 'cpp',
  h: 'cpp',
  hh: 'cpp',
  hpp: 'cpp',
  mm: 'objective-cpp',
  m: 'objective-c',
  js: 'js',
  mjs: 'js',
  ts: 'ts',
  tsx: 'tsx',
  rs: 'rust',
  py: 'python',
  idl: 'text',
  json: 'json',
  css: 'css',
  html: 'html',
  md: 'markdown',
};

/** Shiki language identifier derived from file extension; unknown or non-preloaded languages fall back to 'text'. */
export function languageForPath(filePath: string): string {
  const lastSlash = filePath.lastIndexOf('/');
  const lastDot = filePath.lastIndexOf('.');
  if (lastDot === -1 || lastDot < lastSlash) return 'text';
  const ext = filePath.slice(lastDot + 1).toLowerCase();
  return EXTENSION_LANGUAGE_MAP[ext] ?? 'text';
}
