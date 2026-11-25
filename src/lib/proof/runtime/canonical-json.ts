import type { Json } from '../define-experiment';

/** JSON with sorted object keys so structurally equal values serialize identically. */
export function canonicalJson(value: Json): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys
    .map((k) => `${JSON.stringify(k)}:${canonicalJson((value as Record<string, Json>)[k])}`)
    .join(',')}}`;
}

export function jsonEqual(a: Json, b: Json): boolean {
  return canonicalJson(a) === canonicalJson(b);
}
