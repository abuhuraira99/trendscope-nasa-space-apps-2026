/**
 * Ordinary least-squares straight line x = a + b t with the classical inference for the slope
 * (Student-t test with n - 2 degrees of freedom; e.g. Wilks, D. S. (2011). Statistical Methods in
 * the Atmospheric Sciences, 3rd ed., section 7.2).
 */

import { studentTQuantile, twoSidedStudentP } from './normal.ts';
import { compact, type MaybeNumber } from './util.ts';

export interface OlsResult {
  n: number;
  /** Least-squares slope b per time unit. */
  slope: number;
  /** Intercept a, the fitted value at t = 0. */
  intercept: number;
  /** Standard error of the slope, sqrt(s^2 / Sxx) with s^2 = SSE / (n - 2). */
  se: number;
  /** t statistic b / se. */
  tStat: number;
  /** Degrees of freedom n - 2. */
  df: number;
  /** Two-sided p-value of H0: b = 0. */
  p: number;
  /** Confidence interval of the slope, b -/+ t_(1-alpha/2, n-2) * se. */
  ci: [number, number];
  /** Coefficient of determination 1 - SSE / SST (0 when the series is constant). */
  r2: number;
  /** Residual standard deviation s = sqrt(SSE / (n - 2)). */
  residualStd: number;
}

/**
 * Least-squares fit of `x` on `t`. Pairs with a missing value or time are dropped.
 * Never throws: with fewer than 3 valid pairs (or constant t) the inferential fields are NaN.
 */
export function ols(t: ArrayLike<MaybeNumber>, x: ArrayLike<MaybeNumber>, alpha = 0.05): OlsResult {
  const c = compact(x, t);
  const n = c.x.length;
  const nan: OlsResult = {
    n, slope: NaN, intercept: NaN, se: NaN, tStat: NaN, df: n - 2, p: NaN, ci: [NaN, NaN], r2: NaN, residualStd: NaN,
  };
  if (n < 2) return nan;
  let mt = 0;
  let mx = 0;
  for (let i = 0; i < n; i++) {
    mt += c.t[i];
    mx += c.x[i];
  }
  mt /= n;
  mx /= n;
  let sxx = 0;
  let sxy = 0;
  let sst = 0;
  for (let i = 0; i < n; i++) {
    const dt = c.t[i] - mt;
    const dx = c.x[i] - mx;
    sxx += dt * dt;
    sxy += dt * dx;
    sst += dx * dx;
  }
  if (!(sxx > 0)) return nan;
  const slope = sxy / sxx;
  const intercept = mx - slope * mt;
  let sse = 0;
  for (let i = 0; i < n; i++) {
    const r = c.x[i] - (intercept + slope * c.t[i]);
    sse += r * r;
  }
  const r2 = sst > 0 ? 1 - sse / sst : 0;
  const df = n - 2;
  if (df < 1) return { ...nan, slope, intercept, r2 };
  const residualStd = Math.sqrt(sse / df);
  const se = residualStd / Math.sqrt(sxx);
  let tStat: number;
  let p: number;
  if (se > 0) {
    tStat = slope / se;
    p = twoSidedStudentP(tStat, df);
  } else {
    tStat = slope === 0 ? 0 : slope > 0 ? Infinity : -Infinity;
    p = slope === 0 ? 1 : 0;
  }
  const a = alpha > 0 && alpha < 1 ? alpha : 0.05;
  const tc = studentTQuantile(1 - a / 2, df);
  return { n, slope, intercept, se, tStat, df, p, ci: [slope - tc * se, slope + tc * se], r2, residualStd };
}
