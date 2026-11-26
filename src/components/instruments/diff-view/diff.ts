import type { Json } from '@/lib/proof/define-experiment';

export interface DiffEntry {
  path: string;
  kind: 'same' | 'changed' | 'added' | 'removed';
  a?: Json;
  b?: Json;
}

function isPlainObject(v: Json | undefined): v is { [k: string]: Json } {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function joinPath(prefix: string, segment: string | number): string {
  const seg = String(segment);
  return prefix === '' ? seg : `${prefix}.${seg}`;
}

/**
 * Recursively diffs two Json values (`a` = treatment/primary, `b` = control/secondary).
 * Produces dot-notation paths; arrays are compared by index; `null` vs absent is distinct;
 * floats are compared strictly (`===`).
 */
export function diffJson(a: Json, b: Json): DiffEntry[] {
  const entries: DiffEntry[] = [];

  const walk = (va: Json | undefined, vb: Json | undefined, path: string) => {
    if (va === undefined && vb === undefined) return;
    if (va === undefined) {
      entries.push({ path: path || '(root)', kind: 'added', b: vb });
      return;
    }
    if (vb === undefined) {
      entries.push({ path: path || '(root)', kind: 'removed', a: va });
      return;
    }

    if (Array.isArray(va) && Array.isArray(vb)) {
      const len = Math.max(va.length, vb.length);
      if (len === 0) {
        entries.push({ path: path || '(root)', kind: 'same', a: va, b: vb });
        return;
      }
      for (let i = 0; i < len; i++) {
        walk(i < va.length ? va[i] : undefined, i < vb.length ? vb[i] : undefined, joinPath(path, i));
      }
      return;
    }

    if (isPlainObject(va) && isPlainObject(vb)) {
      const keys = Array.from(new Set([...Object.keys(va), ...Object.keys(vb)]));
      if (keys.length === 0) {
        entries.push({ path: path || '(root)', kind: 'same', a: va, b: vb });
        return;
      }
      for (const key of keys) {
        const hasA = Object.prototype.hasOwnProperty.call(va, key);
        const hasB = Object.prototype.hasOwnProperty.call(vb, key);
        walk(hasA ? va[key] : undefined, hasB ? vb[key] : undefined, joinPath(path, key));
      }
      return;
    }

    const same = va === vb;
    entries.push({
      path: path || '(root)',
      kind: same ? 'same' : 'changed',
      a: va,
      b: vb,
    });
  };

  walk(a, b, '');
  return entries;
}

export function flattenJsonLeaves(value: Json): DiffEntry[] {
  const entries: DiffEntry[] = [];

  const walk = (v: Json, path: string) => {
    if (Array.isArray(v)) {
      if (v.length === 0) {
        entries.push({ path: path || '(root)', kind: 'same', a: v });
        return;
      }
      v.forEach((item, idx) => walk(item, joinPath(path, idx)));
      return;
    }
    if (isPlainObject(v)) {
      const keys = Object.keys(v);
      if (keys.length === 0) {
        entries.push({ path: path || '(root)', kind: 'same', a: v });
        return;
      }
      for (const k of keys) {
        walk(v[k], joinPath(path, k));
      }
      return;
    }
    entries.push({ path: path || '(root)', kind: 'same', a: v });
  };

  walk(value, '');
  return entries;
}

/**
 * Returns true when the observation consists solely of 1 to 3 numeric leaves,
 * qualifying for EPIC-39 7-segment Readout rendering.
 */
export function shouldUseReadoutMode(entries: DiffEntry[]): boolean {
  if (entries.length < 1 || entries.length > 3) return false;
  return entries.every((entry) => {
    const aOk = entry.a === undefined || (typeof entry.a === 'number' && Number.isFinite(entry.a));
    const bOk = entry.b === undefined || (typeof entry.b === 'number' && Number.isFinite(entry.b));
    return aOk && bOk && (entry.a !== undefined || entry.b !== undefined);
  });
}

export function formatJsonCell(val: Json | undefined): string {
  if (val === undefined) return '— (absent)';
  return JSON.stringify(val);
}
