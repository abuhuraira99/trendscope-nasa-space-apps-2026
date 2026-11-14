/**
 * Pettitt change-point test.
 *
 * Pettitt, A. N. (1979). A non-parametric approach to the change-point problem.
 * Journal of the Royal Statistical Society, Series C (Applied Statistics) 28(2), 126-135.
 *
 * U_t = sum_{i<=t} sum_{j>t} sign(x_i - x_j) for t = 1..n-1, computed with average ranks r as
 * U_t = 2 sum_{i<=t} r_i - t (n + 1). K = max_t |U_t| and the approximate two-sided significance is
 * p = 2 exp(-6 K^2 / (n^3 + n^2)), capped at 1.
 */

import { compact, mean, rankAverage, type MaybeNumber } from './util.ts';

export interface PettittResult {
  /** Number of valid values. */
  n: number;
  /**
   * 0-based index, in the valid (missing-dropped) series, of the first value after the change:
   * the first segment is [0, index), the second [index, n). -1 when n < 3.
   */
  index: number;
  /** Pettitt statistic K = max |U_t|. */
  U: number;
  /** Signed U_t at the change point: positive when the first segment is higher. */
  Ut: number;
  /** Approximate two-sided p-value. */
  p: number;
  significant: boolean;
  meanBefore: number;
  meanAfter: number;
  /** Time (from `t`, default the array index) of the first value after the change; NaN when none. */
  time: number;
}

/** Pettitt test on `x` (missing values dropped). Never throws. */
export function pettitt(x: ArrayLike<MaybeNumber>, options: { t?: ArrayLike<MaybeNumber>; alpha?: number } = {}): PettittResult {
  const alpha = options.alpha !== undefined && options.alpha > 0 && options.alpha < 1 ? options.alpha : 0.05;
  const c = compact(x, options.t);
  const n = c.x.length;
  if (n < 3) {
    return { n, index: -1, U: 0, Ut: 0, p: 1, significant: false, meanBefore: NaN, meanAfter: NaN, time: NaN };
  }
  const r = rankAverage(c.x);
  let cum = 0;
  let best = -1;
  let bestAbs = -1;
  let bestU = 0;
  for (let t = 1; t < n; t++) {
    cum += r[t - 1];
    const u = 2 * cum - t * (n + 1);
    if (Math.abs(u) > bestAbs) {
      bestAbs = Math.abs(u);
      best = t;
      bestU = u;
    }
  }
  const K = bestAbs;
  const p = Math.min(1, 2 * Math.exp((-6 * K * K) / (n * n * n + n * n)));
  return {
    n,
    index: best,
    U: K,
    Ut: bestU,
    p,
    significant: p < alpha,
    meanBefore: mean(c.x.slice(0, best)),
    meanAfter: mean(c.x.slice(best)),
    time: c.t[best],
  };
}
