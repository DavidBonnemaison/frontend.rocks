import type { RedirectRule, RedirectsFile } from './schema';

export interface NamedRedirectsFile {
  fileName: string;
  data: RedirectsFile;
}

function normalizeInput(files: readonly (RedirectsFile | NamedRedirectsFile)[]): NamedRedirectsFile[] {
  return files.map((entry) =>
    'data' in entry && 'fileName' in entry
      ? entry
      : { fileName: `${entry.source}.json`, data: entry },
  );
}

/**
 * Pure builder for Netlify `public/_redirects` from all `content/redirects/*.json` sources.
 * Sorts rules deterministically by `from` and throws if any `from` path is declared twice
 * (listing both file names).
 */
export function buildRedirectsFile(
  files: readonly (RedirectsFile | NamedRedirectsFile)[],
): string {
  const named = normalizeInput(files);
  const seen = new Map<string, string>();
  const allRules: RedirectRule[] = [];

  for (const { fileName, data } of named) {
    for (const rule of data.rules) {
      const existingFile = seen.get(rule.from);
      if (existingFile !== undefined) {
        throw new Error(
          `Duplicate redirect source "${rule.from}" declared in "${existingFile}" and "${fileName}"`,
        );
      }
      seen.set(rule.from, fileName);
      allRules.push(rule);
    }
  }

  allRules.sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : 0));

  if (allRules.length === 0) {
    return '';
  }

  return allRules.map((r) => `${r.from} ${r.to} ${r.status}`).join('\n') + '\n';
}

export const KNOWN_STATIC_REDIRECT_TARGETS: ReadonlySet<string> = new Set([
  '/',
  '/agents/',
  '/autopsies/',
  '/diagnose/',
  '/digest/',
  '/gone/',
  '/graph/',
  '/index-list/',
  '/obsolescence/',
  '/privacy/',
  '/proof/',
  '/symptoms/',
  '/vs/',
]);

/**
 * Validates that every `301` redirect target resolves to a known static route,
 * an existing concept page (`/concepts/<id>/` or `/concepts/<id>.md`),
 * or an existing autopsy page (`/autopsies/<id>/` or `/autopsies/<id>.md`).
 */
export function validateRedirectTargets(
  files: readonly NamedRedirectsFile[],
  knownTargets: {
    conceptIds: ReadonlySet<string>;
    autopsyIds?: ReadonlySet<string>;
    symptomIds?: ReadonlySet<string>;
    extraRoutes?: ReadonlySet<string>;
  },
): string[] {
  const errors: string[] = [];
  const autopsyIds = knownTargets.autopsyIds ?? new Set<string>();
  const symptomIds = knownTargets.symptomIds ?? new Set<string>();
  const extraRoutes = knownTargets.extraRoutes ?? new Set<string>();

  for (const { fileName, data } of files) {
    for (const rule of data.rules) {
      if (rule.status !== 301) continue;
      const basePath = rule.to.split('#')[0];
      if (KNOWN_STATIC_REDIRECT_TARGETS.has(basePath) || extraRoutes.has(basePath)) {
        continue;
      }

      const conceptMatch = /^\/concepts\/([a-z0-9-]+)(?:\/|\.md)$/.exec(basePath);
      if (conceptMatch) {
        if (!knownTargets.conceptIds.has(conceptMatch[1])) {
          errors.push(
            `[redirects/${fileName}] 301 target "${rule.to}" references unknown concept "${conceptMatch[1]}"`,
          );
        }
        continue;
      }

      const autopsyMatch = /^\/autopsies\/([a-z0-9-]+)(?:\/|\.md)$/.exec(basePath);
      if (autopsyMatch) {
        if (!autopsyIds.has(autopsyMatch[1])) {
          errors.push(
            `[redirects/${fileName}] 301 target "${rule.to}" references unknown autopsy "${autopsyMatch[1]}"`,
          );
        }
        continue;
      }

      const symptomMatch = /^\/symptoms\/([a-z0-9-]+)\/$/.exec(basePath);
      if (symptomMatch) {
        if (!symptomIds.has(symptomMatch[1])) {
          errors.push(
            `[redirects/${fileName}] 301 target "${rule.to}" references unknown symptom "${symptomMatch[1]}"`,
          );
        }
        continue;
      }

      errors.push(
        `[redirects/${fileName}] 301 target "${rule.to}" does not match a known route or content page`,
      );
    }
  }

  return errors;
}
