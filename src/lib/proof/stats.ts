export function median(values: number[]): number {
  if (values.length === 0) throw new Error('median of empty array');
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid];
}

/** Standard normal CDF (Abramowitz & Stegun 7.1.26, error < 1.5e-7). */
export function normalCdf(z: number): number {
  const t = 1 / (1 + 0.3275911 * (Math.abs(z) / Math.SQRT2));
  const poly =
    t *
    (0.254829592 +
      t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
  const erf = 1 - poly * Math.exp(-(z * z) / 2);
  return z >= 0 ? (1 + erf) / 2 : (1 - erf) / 2;
}

/**
 * One-sided Mann-Whitney U test using normal approximation with tie and continuity correction.
 * H1: values in `greater` are stochastically larger than values in `smaller`.
 * Returns pValue = 1 when there is zero variance.
 */
export function mannWhitneyGreater(
  greater: number[],
  smaller: number[]
): { u: number; z: number; pValue: number } {
  const n1 = greater.length;
  const n2 = smaller.length;
  if (n1 === 0 || n2 === 0) throw new Error('mannWhitneyGreater needs two non-empty samples');
  const all = [
    ...greater.map((v) => ({ v, g: 1 })),
    ...smaller.map((v) => ({ v, g: 2 })),
  ].sort((a, b) => a.v - b.v);
  const ranks = new Array<number>(all.length);
  let tieSum = 0;
  for (let i = 0; i < all.length; ) {
    let j = i;
    while (j + 1 < all.length && all[j + 1].v === all[i].v) j++;
    const avg = (i + j + 2) / 2; // 1-based ranks
    for (let k = i; k <= j; k++) ranks[k] = avg;
    const t = j - i + 1;
    tieSum += t * t * t - t;
    i = j + 1;
  }
  let r1 = 0;
  all.forEach((x, idx) => {
    if (x.g === 1) r1 += ranks[idx];
  });
  const u = r1 - (n1 * (n1 + 1)) / 2;
  const n = n1 + n2;
  const mean = (n1 * n2) / 2;
  const variance = ((n1 * n2) / 12) * (n + 1 - tieSum / (n * (n - 1)));
  if (variance <= 0) return { u, z: 0, pValue: 1 };
  const z = (u - mean - 0.5) / Math.sqrt(variance); // continuity correction
  return { u, z, pValue: 1 - normalCdf(z) };
}
