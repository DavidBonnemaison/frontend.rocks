import { describe, expect, it } from 'vitest';
import { mannWhitneyGreater, median, normalCdf } from '../src/lib/proof/stats';

describe('proof stats', () => {
  it('computes median for odd and even arrays and throws on empty', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(() => median([])).toThrow();
  });

  it('approximates standard normal CDF accurately', () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 6);
    expect(Math.abs(normalCdf(0) - 0.5)).toBeLessThan(1e-7);
    expect(Math.abs(normalCdf(1.96) - 0.975)).toBeLessThan(1e-4);
    expect(Math.abs(normalCdf(-2.611) - 0.00451)).toBeLessThan(1e-4);
  });

  it('detects stochastically greater samples with Mann-Whitney U', () => {
    const res = mannWhitneyGreater([6, 7, 8, 9, 10], [1, 2, 3, 4, 5]);
    expect(res.u).toBe(25);
    expect(res.pValue).toBeLessThan(0.01);
  });

  it('returns high pValue when first sample is smaller', () => {
    const res = mannWhitneyGreater([1, 2, 3, 4, 5], [6, 7, 8, 9, 10]);
    expect(res.pValue).toBeGreaterThan(0.99);
  });

  it('returns neutral pValue for identical samples', () => {
    const res = mannWhitneyGreater([1, 2, 3, 4, 5], [1, 2, 3, 4, 5]);
    expect(res.pValue).toBeGreaterThanOrEqual(0.4);
    expect(res.pValue).toBeLessThanOrEqual(0.6);
  });

  it('returns pValue 1 when all values are tied (zero variance)', () => {
    const res = mannWhitneyGreater([2, 2, 2], [2, 2, 2]);
    expect(res.pValue).toBe(1);
  });

  it('returns pValue < 1e-4 for 15-element completely separated samples', () => {
    const greater = Array.from({ length: 15 }, (_, i) => i + 100);
    const smaller = Array.from({ length: 15 }, (_, i) => i + 1);
    const res = mannWhitneyGreater(greater, smaller);
    expect(res.pValue).toBeLessThan(1e-4);
  });
});
