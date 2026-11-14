/**
 * High-level trend analysis used by the TrendScope verdict panel (build spec, "Statistics").
 *
 * Primary test on the annual series: Sen's slope (Sen 1968) per decade, Mann-Kendall with tie
 * correction and the Yue & Wang (2004) variance correction, continuity-corrected two-sided p, and
 * the Gilbert (1987) confidence interval of the slope from the corrected Var(S). Alongside: ordinary
 * least squares, the Pettitt (1979) change point and the Weatherhead et al. (1998) detection time.
 *
 * The Yue-Wang correction uses the 'conservative' variant by default: Var(S) is inflated by the
 * full AR(1) factor only when the lag-1 autocorrelation r1 of the Sen-detrended series is positive
 * and significant (r1 > 1.96 / sqrt(n)), and it is never shrunk. Shrinking it for negative r1, as
 * pymannkendall does, turns noise into "significant" trends (see `YueWangVariant`).
 */

import { detection, type DetectionResult } from './detection.ts';
import { mannKendall, mkZ, type TrendDirection, type YueWangVariant } from './mannKendall.ts';
import { twoSidedNormalP } from './normal.ts';
import { ols } from './ols.ts';
import { pettitt } from './pettitt.ts';
import { monthlyTrends, seasonalMK, type MonthTrend, type SeasonalMKResult } from './seasonal.ts';
import { gilbertCI, pairwiseSlopes } from './sen.ts';
import { annualMeans, type AnnualSeries, type AnnualStat, type MonthlyPoint } from './series.ts';
import {
  acf,
  insufficient,
  isValid,
  mean,
  MIN_POINTS,
  safeLength,
  sampleStd,
  type InsufficientData,
  type MaybeNumber,
} from './util.ts';

export type Confidence = 'very strong' | 'strong' | 'moderate' | 'weak' | 'none';

/** Plain-language strength of evidence from a p-value: <0.001, <0.01, <0.05, <0.1, else none. */
export function confidenceFromP(p: number): Confidence {
  if (!(p >= 0)) return 'none';
  if (p < 0.001) return 'very strong';
  if (p < 0.01) return 'strong';
  if (p < 0.05) return 'moderate';
  if (p < 0.1) return 'weak';
  return 'none';
}

export interface OlsSummary {
  slopePerYear: number;
  slopePerDecade: number;
  /** Fitted value in `firstYear`. */
  intercept: number;
  /** Standard error of the slope per year. */
  se: number;
  tStat: number;
  df: number;
  p: number;
  ciPerDecade: [number, number];
  r2: number;
}

export interface PettittSummary {
  /** First year of the new regime (the first year after the change point); null when none. */
  year: number | null;
  /** Index of that year in the valid-year series. */
  index: number;
  U: number;
  p: number;
  significant: boolean;
  meanBefore: number;
  meanAfter: number;
  /** meanAfter - meanBefore. */
  shift: number;
}

export interface AnnualAnalysis {
  ok: true;
  /** Number of years with data. */
  n: number;
  firstYear: number;
  lastYear: number;
  /** Years between firstYear and lastYear without data. */
  missing: number;
  mean: number;
  /** Sen's slope per year. */
  slopePerYear: number;
  slopePerDecade: number;
  /** Gilbert (1987) confidence interval of Sen's slope per decade, from the corrected Var(S). */
  ciPerDecade: [number, number];
  /** Sen line value in `firstYear`: fitted(year) = intercept + slopePerYear * (year - firstYear). */
  intercept: number;
  /** slopePerYear * (lastYear - firstYear). */
  totalChange: number;
  /** Two-sided p-value of the Yue-Wang corrected Mann-Kendall test. */
  p: number;
  /** p-value of the original (uncorrected) Mann-Kendall test. */
  pUncorrected: number;
  z: number;
  tau: number;
  S: number;
  /** Corrected Var(S). */
  varS: number;
  /** Variance inflation factor applied to Var(S) by the Yue-Wang correction. */
  nStar: number;
  /** p < alpha (0.05 by default). */
  significant: boolean;
  trend: TrendDirection;
  confidence: Confidence;
  /** Lag-1 autocorrelation of the Sen-detrended series. */
  r1: number;
  ols: OlsSummary;
  pettitt: PettittSummary;
  detection: DetectionResult;
}

export type AnnualResult = AnnualAnalysis | InsufficientData;

export interface AnalyzeOptions {
  /** Significance level. Default 0.05. */
  alpha?: number;
  /**
   * Form of the Yue-Wang correction: 'conservative' (default, never shrinks Var(S)), 'pymk'
   * (pymannkendall `yue_wang_modification_test(x, lag=1)`) or 'gated-ar1'.
   */
  yueWangVariant?: YueWangVariant;
}

/**
 * Full trend analysis of an annual series. Missing values (null, NaN, -999) are dropped and each
 * value keeps its own year, so gaps do not distort the time axis. Pairs are sorted by year; for a
 * repeated year the last value wins. Fewer than 4 valid years give an insufficient-data result.
 * Never throws.
 */
export function analyzeAnnual(
  years: ArrayLike<MaybeNumber>,
  values: ArrayLike<MaybeNumber>,
  options: AnalyzeOptions = {},
): AnnualResult {
  const alpha = options.alpha !== undefined && options.alpha > 0 && options.alpha < 1 ? options.alpha : 0.05;
  const len = Math.min(safeLength(years), safeLength(values));
  const byYear = new Map<number, number>();
  for (let i = 0; i < len; i++) {
    const y = years[i];
    const v = values[i];
    if (typeof y !== 'number' || !Number.isFinite(y)) continue;
    if (isValid(v)) byYear.set(y, v);
    else byYear.delete(y);
  }
  const ys = [...byYear.keys()].sort((a, b) => a - b);
  const n = ys.length;
  if (n < MIN_POINTS) return insufficient(n, MIN_POINTS, 'years');
  const x = ys.map((y) => byYear.get(y) as number);
  const firstYear = ys[0];
  const lastYear = ys[n - 1];
  const t = ys.map((y) => y - firstYear);

  const mk = mannKendall(x, { t, correction: 'yue-wang', alpha, yueWangVariant: options.yueWangVariant });
  const slope = mk.slope;
  const ci = gilbertCI(pairwiseSlopes(x, t), mk.varS, alpha);
  const pUncorrected = mk.S === 0 ? 1 : twoSidedNormalP(mkZ(mk.S, mk.varSUncorrected));

  const fit = ols(t, x, alpha);
  const pt = pettitt(x, { t: ys, alpha });

  const res = x.map((v, i) => v - (mk.intercept + slope * t[i]));
  const sigma = sampleStd(res);
  const phi = acf(res, 1)[1];
  const det = detection(slope, sigma, phi, { firstYear, lastYear });

  return {
    ok: true,
    n,
    firstYear,
    lastYear,
    missing: Number.isInteger(firstYear) && Number.isInteger(lastYear) ? Math.max(0, lastYear - firstYear + 1 - n) : 0,
    mean: mean(x),
    slopePerYear: slope,
    slopePerDecade: slope * 10,
    ciPerDecade: [ci.lower * 10, ci.upper * 10],
    intercept: mk.intercept,
    totalChange: slope * (lastYear - firstYear),
    p: mk.p,
    pUncorrected,
    z: mk.z,
    tau: mk.tau,
    S: mk.S,
    varS: mk.varS,
    nStar: mk.nStar,
    significant: mk.significant,
    trend: mk.trend,
    confidence: confidenceFromP(mk.p),
    r1: mk.r1,
    ols: {
      slopePerYear: fit.slope,
      slopePerDecade: fit.slope * 10,
      intercept: fit.intercept,
      se: fit.se,
      tStat: fit.tStat,
      df: fit.df,
      p: fit.p,
      ciPerDecade: [fit.ci[0] * 10, fit.ci[1] * 10],
      r2: fit.r2,
    },
    pettitt: {
      year: pt.index >= 0 ? pt.time : null,
      index: pt.index,
      U: pt.U,
      p: pt.p,
      significant: pt.significant,
      meanBefore: pt.meanBefore,
      meanAfter: pt.meanAfter,
      shift: pt.meanAfter - pt.meanBefore,
    },
    detection: det,
  };
}

export interface MonthlyAnalysis {
  /** Annual series derived from the monthly points (build spec rules). */
  annualSeries: AnnualSeries;
  /** Primary analysis of the annual series. */
  annual: AnnualResult;
  /** Hirsch seasonal Mann-Kendall test with the seasonal Sen's slope. */
  seasonal: SeasonalMKResult | InsufficientData;
  /** Trend of each calendar month (January first). */
  months: MonthTrend[];
}

export interface AnalyzeMonthlyOptions extends AnalyzeOptions {
  /** How monthly values combine into a year: 'mean' (default) or 'sum' (e.g. degree days). */
  stat?: AnnualStat;
  /** Months needed for a year to count. Default 10. */
  minMonths?: number;
}

/** Annual analysis plus the seasonal Mann-Kendall test and the 12 monthly trends. Never throws. */
export function analyzeMonthly(points: readonly MonthlyPoint[], options: AnalyzeMonthlyOptions = {}): MonthlyAnalysis {
  const annualSeries = annualMeans(points, options.minMonths ?? 10, options.stat ?? 'mean');
  return {
    annualSeries,
    annual: analyzeAnnual(annualSeries.years, annualSeries.values, options),
    seasonal: seasonalMK(points, options),
    months: monthlyTrends(points, options),
  };
}
