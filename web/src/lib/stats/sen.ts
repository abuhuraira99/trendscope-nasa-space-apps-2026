/**
 * Theil-Sen slope estimator with the Conover intercept, and its Gilbert (1987) confidence interval.
 *
 * - Theil, H. (1950). A rank-invariant method of linear and polynomial regression analysis.
 *   Proc. Koninklijke Nederlandse Akademie van Wetenschappen 53.
 * - Sen, P. K. (1968). Estimates of the regression coefficient based on Kendall's tau.
 *   Journal of the American Statistical Association 63(324), 1379-1389.
 * - Conover, W. J. (1980). Practical Nonparametric Statistics, 2nd ed. Wiley (intercept).
 * - Gilbert, R. O. (1987). Statistical Methods for Environmental Pollution Monitoring.
 *   Van Nostrand Reinhold, section 16.5 (confidence interval).
 *
 * Matches `pymannkendall.sens_slope`: slope = median of (x_j - x_i) / (t_j - t_i) over all pairs
 * i < j of valid values, intercept = median(x) - median(t) * slope. When `t` is omitted the time of
 * element i is its index i, so missing values (null / NaN) are skipped without shifting time.
 */

import { normalQuantile } from './normal.ts';
import { compact, interpSorted, median, medianSorted, type MaybeNumber } from './util.ts';

export interface SensSlopeResult {
  /** Median pairwise slope, in value units per time unit. NaN with fewer than 2 valid points. */
  slope: number;
  /** Intercept of the Kendall-Theil line at t = 0: median(x) - median(t) * slope. */
  intercept: number;
  /** Number of valid points used. */
  n: number;
  /** Number of pairwise slopes. */
  nSlopes: number;
}

export interface SensSlopeCI {
  lower: number;
  upper: number;
  /** Confidence level, e.g. 0.95. */
  level: number;
}

/** All pairwise slopes (x_j - x_i) / (t_j - t_i), i < j, of already compacted data, sorted ascending. */
export function pairwiseSlopes(x: readonly number[], t: readonly number[]): Float64Array {
  const n = Math.min(x.length, t.length);
  const out = new Float64Array((n * (n - 1)) / 2);
  let k = 0;
  for (let i = 0; i < n - 1; i++) {
    for (let j = i + 1; j < n; j++) {
      const dt = t[j] - t[i];
      if (dt !== 0) out[k++] = (x[j] - x[i]) / dt;
    }
  }
  const s = out.subarray(0, k);
  s.sort();
  return s;
}

function fromCompact(x: number[], t: number[], slopes: Float64Array): SensSlopeResult {
  const slope = medianSorted(slopes);
  const intercept = x.length > 0 && Number.isFinite(slope) ? median(x) - median(t) * slope : NaN;
  return { slope, intercept, n: x.length, nSlopes: slopes.length };
}

/**
 * Sen's slope and intercept of `values` against time `t` (default: the array index).
 * Never throws; returns NaN slope and intercept when fewer than two valid points remain.
 */
export function sensSlope(values: ArrayLike<MaybeNumber>, t?: ArrayLike<MaybeNumber>): SensSlopeResult {
  const c = compact(values, t);
  return fromCompact(c.x, c.t, pairwiseSlopes(c.x, c.t));
}

/**
 * Gilbert (1987) confidence interval of Sen's slope from the sorted pairwise slopes and Var(S).
 *
 * C = z_(1-alpha/2) * sqrt(Var(S)), M1 = (N' - C) / 2, M2 = (N' + C) / 2, where N' is the number of
 * pairwise slopes. The lower limit is the M1-th and the upper limit the (M2 + 1)-th smallest slope
 * (1-based ranks). Non-integer ranks are linearly interpolated between neighbouring slopes and ranks
 * are clamped to [1, N']. Pass the autocorrelation-corrected Var(S) to widen the interval when the
 * series is serially correlated. A missing or negative Var(S) gives a zero-width rank band.
 */
export function gilbertCI(sortedSlopes: ArrayLike<number>, varS: number, alpha = 0.05): SensSlopeCI {
  const level = 1 - alpha;
  const nPrime = sortedSlopes.length;
  if (nPrime === 0) return { lower: NaN, upper: NaN, level };
  const z = normalQuantile(1 - alpha / 2);
  const c = Number.isFinite(varS) && varS > 0 ? z * Math.sqrt(varS) : 0;
  const m1 = (nPrime - c) / 2;
  const m2 = (nPrime + c) / 2;
  // 1-based rank r sits at 0-based position r - 1.
  return {
    lower: interpSorted(sortedSlopes, m1 - 1),
    upper: interpSorted(sortedSlopes, m2),
    level,
  };
}

/** Sen's slope, intercept and Gilbert confidence interval in one pass. */
export function sensSlopeWithCI(
  values: ArrayLike<MaybeNumber>,
  varS: number,
  options: { t?: ArrayLike<MaybeNumber>; alpha?: number } = {},
): SensSlopeResult & { ci: SensSlopeCI } {
  const c = compact(values, options.t);
  const slopes = pairwiseSlopes(c.x, c.t);
  return { ...fromCompact(c.x, c.t, slopes), ci: gilbertCI(slopes, varS, options.alpha ?? 0.05) };
}
