import { describe, expect, it } from 'vitest';
import { jsonEquals } from '@/lib/proof/compare-observation';

describe('jsonEquals', () => {
  it('treats objects with identical keys in different order as equal', () => {
    expect(jsonEquals({ a: 1, b: [1, 2] }, { b: [1, 2], a: 1 })).toBe(true);
  });

  it('treats arrays with different element order as unequal', () => {
    expect(jsonEquals([1, 2], [2, 1])).toBe(false);
  });

  it('treats 0 and -0 as equal', () => {
    expect(jsonEquals(0, -0)).toBe(true);
  });

  it('distinguishes primitives, null, and nested objects', () => {
    expect(jsonEquals(null, false)).toBe(false);
    expect(jsonEquals({ x: { y: 1 } }, { x: { y: 2 } })).toBe(false);
    expect(jsonEquals({ x: { y: 1 } }, { x: { y: 1 } })).toBe(true);
  });
});
