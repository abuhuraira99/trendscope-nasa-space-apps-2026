/**
 * Field significance with the Benjamini-Hochberg false discovery rate.
 *
 * - Benjamini, Y. & Hochberg, Y. (1995). Controlling the false discovery rate: a practical and
 *   powerful approach to multiple testing. Journal of the Royal Statistical Society B 57(1), 289-300.
 * - Wilks, D. S. (2016). "The stippling shows statistically significant grid points": how research
 *   results are routinely overstated and overinterpreted, and what to do about it. Bulletin of the
 *   American Meteorological Society 97(12), 2263-2273 (recommends alpha_FDR = 2 alpha_global, q = 0.10).
 *
 * Only finite p-values in [0, 1] take part; NaN cells (no data) are ignored and never significant.
 */

function validP(p: number): boolean {
  return Number.isFinite(p) && p >= 0 && p <= 1;
}

/**
 * Benjamini-Hochberg threshold p*: the largest sorted p_(k) with p_(k) <= q k / m, where m is the
 * number of valid p-values. A test is FDR-significant when p <= p*. Returns 0 when no p-value
 * qualifies (every valid p is then above q / m > 0, so `p <= 0` selects nothing).
 */
export function bhThreshold(pvalues: ArrayLike<number>, q = 0.1): number {
  const vals: number[] = [];
  const len = pvalues?.length ?? 0;
  for (let i = 0; i < len; i++) {
    const p = pvalues[i];
    if (validP(p)) vals.push(p);
  }
  const m = vals.length;
  if (m === 0 || !(q > 0)) return 0;
  const s = Float64Array.from(vals).sort();
  for (let k = m; k >= 1; k--) {
    if (s[k - 1] <= (q * k) / m) return s[k - 1];
  }
  return 0;
}

/** Boolean mask of FDR-significant tests (same order as the input). */
export function bhMask(pvalues: ArrayLike<number>, q = 0.1): boolean[] {
  const thr = bhThreshold(pvalues, q);
  const len = pvalues?.length ?? 0;
  const out = new Array<boolean>(len);
  for (let i = 0; i < len; i++) {
    const p = pvalues[i];
    out[i] = validP(p) && p <= thr;
  }
  return out;
}

/**
 * Significance codes per cell as in the TrendScope grid files: 2 = FDR-significant at `q`,
 * 1 = only locally significant (p < alpha), 0 = neither; NaN where the p-value is missing.
 */
export function significanceCodes(pvalues: ArrayLike<number>, q = 0.1, alpha = 0.05): Float32Array {
  const mask = bhMask(pvalues, q);
  const len = mask.length;
  const out = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    const p = pvalues[i];
    out[i] = !validP(p) ? NaN : mask[i] ? 2 : p < alpha ? 1 : 0;
  }
  return out;
}
