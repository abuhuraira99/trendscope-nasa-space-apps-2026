/**
 * Mann-Kendall trend test with tie correction and two autocorrelation corrections of Var(S).
 *
 * - Mann, H. B. (1945). Nonparametric tests against trend. Econometrica 13(3), 245-259.
 * - Kendall, M. G. (1975). Rank Correlation Methods, 4th ed. Charles Griffin.
 * - Gilbert, R. O. (1987). Statistical Methods for Environmental Pollution Monitoring. Van Nostrand
 *   Reinhold
 *   (tie-corrected variance and continuity-corrected z).
 * - Yue, S. & Wang, C. (2004). The Mann-Kendall test modified by effective sample size to detect
 *   trend in serially correlated hydrological series. Water Resources Management 18, 201-218.
 * - Hamed, K. H. & Rao, A. R. (1998). A modified Mann-Kendall trend test for autocorrelated data.
 *   Journal of Hydrology 204(1-4), 182-196.
 *
 * The numbers match pymannkendall 1.4.3 (Hussain & Mahmud 2019, JOSS 4(39), 1556):
 * `original_test`, `hamed_rao_modification_test(x)` and, with `yueWangVariant: 'pymk'`,
 * `yue_wang_modification_test(x, lag=1)`. The default Yue-Wang variant is 'conservative', which
 * never shrinks Var(S) (see `YueWangVariant` for why). Where pymannkendall departs from the
 * textbook method, the comments below say so.
 */

import { normalQuantile, twoSidedNormalP } from './normal.ts';
import { sensSlope } from './sen.ts';
import { acf, compact, rankAverage, sign, type MaybeNumber } from './util.ts';

export type VarianceCorrection = 'none' | 'yue-wang' | 'hamed-rao';
/**
 * Which form of the Yue & Wang (2004) correction to use. r1 is the lag-1 autocorrelation of the
 * Sen-detrended series (true time axis).
 * - 'conservative' (default): correct only for significant positive autocorrelation,
 *   r1 > 0 and r1 > 1.96 / sqrt(n), with the full AR(1) factor
 *   n/n* = 1 + 2 sum_{k=1}^{n-1} (1 - k/n) r1^k, never below 1. See `yueWangFactorConservative`.
 * - 'pymk': pymannkendall `yue_wang_modification_test(x, lag=1)`, n/n* = 1 + 2 (1 - 1/n) r1,
 *   applied whatever the size or sign of r1.
 * - 'gated-ar1': the original build-spec text, the full AR(1) factor applied when
 *   |r1| > 1.96 / sqrt(n), for either sign.
 *
 * Why 'conservative' is the default: with negative r1 the other two forms give n/n* < 1, which
 * shrinks Var(S) and inflates |z|. Short or noisy series often show a negative sample r1 (its
 * expected value is about -1/n even for white noise), so those forms report trends in pure noise:
 * in the test fixtures a white-noise series of 30 values goes from p = 0.23 (original test) to
 * p = 0.0012 with 'pymk'. Negative autocorrelation makes the original test conservative, so
 * leaving Var(S) unchanged in that case is the safe choice; positive (red-noise) autocorrelation,
 * which makes the original test too liberal, is still corrected.
 */
export type YueWangVariant = 'conservative' | 'pymk' | 'gated-ar1';
export type TrendDirection = 'increasing' | 'decreasing' | 'no trend';

export interface MannKendallOptions {
  /**
   * Autocorrelation correction of Var(S): 'none' (default, the original test), 'yue-wang'
   * (Yue & Wang 2004, lag 1) or 'hamed-rao' (Hamed & Rao 1998).
   */
  correction?: VarianceCorrection;
  /** Apply the tie correction to Var(S). Default true. */
  ties?: boolean;
  /** Significance level for `significant`, `trend` and the Hamed-Rao lag screening. Default 0.05. */
  alpha?: number;
  /** Time of each value (default: array index). Used for Sen's slope and for detrending. */
  t?: ArrayLike<MaybeNumber>;
  /** Hamed-Rao only: number of lags to screen (default n - 1, all lags, as pymannkendall). */
  lag?: number;
  /** Yue-Wang only: 'conservative' (default), 'pymk' or 'gated-ar1'. See `YueWangVariant`. */
  yueWangVariant?: YueWangVariant;
}

export interface MannKendallResult {
  /** Number of valid values. */
  n: number;
  /** Mann-Kendall score S = sum over i < j of sign(x_j - x_i). */
  S: number;
  /** Var(S) used for z, after any autocorrelation correction. */
  varS: number;
  /** Var(S) before the autocorrelation correction (tie-corrected unless `ties: false`). */
  varSUncorrected: number;
  /** Variance inflation factor n / n* applied to Var(S) (1 when no correction is applied). */
  nStar: number;
  /** Whether an autocorrelation correction changed Var(S). */
  correctionApplied: boolean;
  /** Lag-1 autocorrelation of the Sen-detrended series (NaN when n < 3). */
  r1: number;
  /** Continuity-corrected standard normal score. */
  z: number;
  /** Two-sided p-value. */
  p: number;
  /** Kendall's tau = S / (n (n - 1) / 2). */
  tau: number;
  significant: boolean;
  trend: TrendDirection;
  /** Sen's slope per time unit. */
  slope: number;
  /** Intercept of the Sen line at t = 0. */
  intercept: number;
  correction: VarianceCorrection;
}

/** Mann-Kendall score S of compacted values (O(n^2)). */
export function mkScore(x: ArrayLike<number>): number {
  const n = x.length;
  let s = 0;
  for (let i = 0; i < n - 1; i++) {
    const xi = x[i];
    for (let j = i + 1; j < n; j++) s += sign(x[j] - xi);
  }
  return s;
}

/**
 * Var(S) under H0: [n(n-1)(2n+5) - sum_g t_g(t_g-1)(2t_g+5)] / 18, where t_g is the size of each
 * group of exactly equal values (Kendall 1975). With `ties = false` the tie term is dropped.
 */
export function varianceS(x: ArrayLike<number>, ties = true): number {
  const n = x.length;
  let v = n * (n - 1) * (2 * n + 5);
  if (ties && n > 1) {
    const s = Float64Array.from(x as ArrayLike<number>).sort();
    let i = 0;
    while (i < n) {
      let j = i;
      while (j + 1 < n && s[j + 1] === s[i]) j++;
      const tp = j - i + 1;
      if (tp > 1) v -= tp * (tp - 1) * (2 * tp + 5);
      i = j + 1;
    }
  }
  return v / 18;
}

/** z = (S - sign(S)) / sqrt(Var(S)), with z = 0 when S = 0. */
export function mkZ(S: number, varS: number): number {
  if (S === 0) return 0;
  const sd = Math.sqrt(varS);
  return S > 0 ? (S - 1) / sd : (S + 1) / sd;
}

/** Detrended series x_k - (t_k + 1) * slope, the exact form pymannkendall uses (it detrends with 1..n). */
function detrend(x: readonly number[], t: readonly number[], slope: number): number[] {
  const s = Number.isFinite(slope) ? slope : 0;
  return x.map((v, k) => v - (t[k] + 1) * s);
}

/**
 * Full AR(1) variance factor of Yue & Wang (2004): n/n* = 1 + 2 sum_{k=1}^{n-1} (1 - k/n) r1^k.
 */
export function ar1VarianceFactor(r1: number, n: number): number {
  let sum = 0;
  let rk = 1;
  for (let k = 1; k < n; k++) {
    rk *= r1;
    sum += (1 - k / n) * rk;
  }
  return 1 + 2 * sum;
}

/**
 * The TrendScope default Yue-Wang factor (the 'conservative' variant), as a plain function of r1
 * and n so the Python pipeline can mirror it line by line:
 *
 *   if n >= 3 and r1 > 0 and r1 > 1.96 / sqrt(n):
 *       factor = max(1, 1 + 2 * sum_{k=1}^{n-1} (1 - k/n) * r1**k)
 *   else:
 *       factor = 1
 *   Var*(S) = Var(S) * factor
 *
 * r1 is the lag-1 autocorrelation (biased estimator, as `acf`) of x_k - slope * t_k, with Sen's
 * slope and each value's true time t_k (a constant offset in the detrending does not change r1). Var(S) is never shrunk: negative r1 would otherwise
 * deflate the variance and produce false positives (see `YueWangVariant`).
 */
export function yueWangFactorConservative(r1: number, n: number): number {
  if (!(n >= 3) || !(r1 > 0) || !(r1 > 1.96 / Math.sqrt(n))) return 1;
  const f = ar1VarianceFactor(r1, n);
  return Number.isFinite(f) ? Math.max(1, f) : 1;
}

/**
 * Yue & Wang (2004) variance factor n/n* for the chosen variant.
 *
 * Textbook form: Yue & Wang (2004) use n/n* = 1 + 2 sum_{k=1}^{n-1} (1 - k/n) r_k (with
 * r_k = r1^k for AR(1) noise) and correct only when r1 is significant. pymannkendall with `lag=1`
 * keeps only the k = 1 term, n/n* = 1 + 2 (1 - 1/n) r1, and applies it whatever the size or sign
 * of r1 ('pymk'). 'gated-ar1' is the textbook form for either sign of r1. 'conservative' (the
 * default) is the textbook form for significant positive r1 only, never below 1.
 */
function yueWangFactor(detrended: readonly number[], variant: YueWangVariant): { factor: number; r1: number } {
  const n = detrended.length;
  if (n < 3) return { factor: 1, r1: NaN };
  const r1 = acf(detrended, 1)[1];
  if (variant === 'pymk') return { factor: 1 + 2 * (1 - 1 / n) * r1, r1 };
  if (variant === 'gated-ar1') {
    return { factor: Math.abs(r1) > 1.96 / Math.sqrt(n) ? ar1VarianceFactor(r1, n) : 1, r1 };
  }
  return { factor: yueWangFactorConservative(r1, n), r1 };
}

/**
 * Hamed & Rao (1998) variance factor as pymannkendall implements it:
 * n/n*_s = 1 + 2 / (n(n-1)(n-2)) * sum_i (n-i)(n-i-1)(n-i-2) rho_s(i), where rho_s(i) is the
 * lag-i autocorrelation of the ranks of the Sen-detrended series and only lags with
 * |rho_s(i)| > z_(1-alpha/2) / sqrt(n) are kept.
 */
function hamedRaoFactor(detrended: readonly number[], alpha: number, lag?: number): number {
  const n = detrended.length;
  if (n < 3) return 1;
  const maxLag = lag === undefined || !Number.isFinite(lag) ? n - 1 : Math.max(0, Math.min(Math.floor(lag), n - 1));
  const r = acf(rankAverage(detrended), maxLag);
  const bound = normalQuantile(1 - alpha / 2) / Math.sqrt(n);
  let sum = 0;
  for (let i = 1; i <= maxLag; i++) {
    if (r[i] > bound || r[i] < -bound) sum += (n - i) * (n - i - 1) * (n - i - 2) * r[i];
  }
  return 1 + (2 / (n * (n - 1) * (n - 2))) * sum;
}

/**
 * Mann-Kendall test. Missing values (null, NaN, -999) are dropped; time positions are kept for
 * Sen's slope and the detrending step. Never throws: with n < 2 it returns S = 0, p = 1.
 *
 * If a correction gives a factor that is not a positive finite number (possible with strongly
 * negative autocorrelation, where pymannkendall returns NaN), the uncorrected Var(S) is used and
 * `correctionApplied` is false. For a constant series pymannkendall reports Var(S) = NaN for the
 * corrected tests; here r1 = 0, the factor is 1 and Var(S) = 0, with the same z = 0 and p = 1.
 */
export function mannKendall(values: ArrayLike<MaybeNumber>, options: MannKendallOptions = {}): MannKendallResult {
  const correction: VarianceCorrection = options.correction ?? 'none';
  const alpha = options.alpha !== undefined && options.alpha > 0 && options.alpha < 1 ? options.alpha : 0.05;
  const { x, t } = compact(values, options.t);
  const n = x.length;
  const S = mkScore(x);
  const varSUncorrected = varianceS(x, options.ties ?? true);
  const sen = sensSlope(x, t);

  let factor = 1;
  let r1 = NaN;
  if (n >= 3) {
    const d = detrend(x, t, sen.slope);
    const yw = yueWangFactor(d, options.yueWangVariant ?? 'conservative');
    r1 = yw.r1;
    if (correction === 'yue-wang') factor = yw.factor;
    else if (correction === 'hamed-rao') factor = hamedRaoFactor(d, alpha, options.lag);
  }
  let correctionApplied = correction !== 'none' && factor !== 1;
  if (!(Number.isFinite(factor) && factor > 0)) {
    factor = 1;
    correctionApplied = false;
  }
  const varS = varSUncorrected * factor;
  const z = mkZ(S, varS);
  const p = S === 0 ? 1 : twoSidedNormalP(z);
  const tau = n > 1 ? S / (0.5 * n * (n - 1)) : 0;
  const significant = p < alpha;
  return {
    n,
    S,
    varS,
    varSUncorrected,
    nStar: factor,
    correctionApplied,
    r1,
    z,
    p,
    tau,
    significant,
    trend: significant ? (z > 0 ? 'increasing' : 'decreasing') : 'no trend',
    slope: sen.slope,
    intercept: sen.intercept,
    correction,
  };
}

/**
 * Mann-Kendall test with the Yue & Wang (2004) variance correction. Default variant
 * 'conservative'; pass `yueWangVariant: 'pymk'` for pymannkendall `yue_wang_modification_test(x, lag=1)`.
 */
export function yueWang(values: ArrayLike<MaybeNumber>, options: Omit<MannKendallOptions, 'correction'> = {}): MannKendallResult {
  return mannKendall(values, { ...options, correction: 'yue-wang' });
}

/** Mann-Kendall test with the Hamed & Rao (1998) variance correction (pymannkendall default, all lags). */
export function hamedRao(values: ArrayLike<MaybeNumber>, options: Omit<MannKendallOptions, 'correction'> = {}): MannKendallResult {
  return mannKendall(values, { ...options, correction: 'hamed-rao' });
}
