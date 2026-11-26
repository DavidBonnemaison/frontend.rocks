export type ScaleFn = (value: number) => number;

/**
 * Pure linear scale mapping a numeric domain [d0, d1] into range [r0, r1].
 * When d0 === d1, maps every input to the midpoint of range.
 */
export function createLinearScale(
  domain: readonly [number, number],
  range: readonly [number, number],
): ScaleFn {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const span = d1 - d0;
  if (span === 0 || !Number.isFinite(span)) {
    const mid = (r0 + r1) / 2;
    return () => mid;
  }
  const factor = (r1 - r0) / span;
  return (value: number) => r0 + (value - d0) * factor;
}

/**
 * Computes "nice" 1-2-5 * 10^n tick values inside [min, max].
 * Example: niceTicks([0, 37]) -> [0, 10, 20, 30].
 */
export function niceTicks(domain: readonly [number, number], count = 5): number[] {
  const min = Math.min(domain[0], domain[1]);
  const max = Math.max(domain[0], domain[1]);
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [];
  const span = max - min;
  if (span === 0) return [min];

  const targetCount = Math.max(2, Math.floor(count));
  const rawStep = span / targetCount;
  const exp = Math.floor(Math.log10(rawStep));
  const mag = 10 ** exp;
  const norm = rawStep / mag;

  let niceNorm: number;
  if (norm <= 1) niceNorm = 1;
  else if (norm <= 2) niceNorm = 2;
  else if (norm <= 5) niceNorm = 5;
  else niceNorm = 10;

  const step = niceNorm * mag;
  const start = Math.ceil(min / step) * step;
  const end = Math.floor(max / step) * step;

  const ticks: number[] = [];
  const epsilon = step * 1e-9;
  for (let v = start; v <= end + epsilon; v += step) {
    const rounded = Math.abs(v) < epsilon ? 0 : Number(v.toPrecision(12));
    ticks.push(rounded);
    if (ticks.length > 100) break;
  }
  return ticks;
}
