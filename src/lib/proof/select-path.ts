import type { Json } from './define-experiment';

export type SelectPathResult = { ok: true; value: Json } | { ok: false; at: string };

/**
 * Pure dot-notation path resolver over Json values.
 * Empty string "" returns the root value.
 * Numeric segments index arrays; object keys index plain objects.
 */
export function selectPath(value: Json, path: string): SelectPathResult {
  if (path === '') {
    return { ok: true, value };
  }

  const segments = path.split('.');
  let current: Json = value;
  const walked: string[] = [];

  for (const segment of segments) {
    walked.push(segment);
    if (segment === '') {
      return { ok: false, at: walked.join('.') };
    }
    if (current === null || typeof current !== 'object') {
      return { ok: false, at: walked.join('.') };
    }
    if (Array.isArray(current)) {
      if (!/^(?:0|[1-9]\d*)$/.test(segment)) {
        return { ok: false, at: walked.join('.') };
      }
      const idx = Number(segment);
      if (idx < 0 || idx >= current.length) {
        return { ok: false, at: walked.join('.') };
      }
      current = current[idx];
    } else {
      if (!Object.prototype.hasOwnProperty.call(current, segment)) {
        return { ok: false, at: walked.join('.') };
      }
      current = current[segment];
    }
  }

  return { ok: true, value: current };
}
