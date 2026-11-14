/**
 * Seasonal Mann-Kendall test, seasonal Sen's slope and per-calendar-month trends.
 *
 * - Hirsch, R. M., Slack, J. R. & Smith, R. A. (1982). Techniques of trend analysis for monthly
 *   water quality data. Water Resources Research 18(1), 107-121.
 * - Hirsch, R. M. & Slack, J. R. (1984). A nonparametric trend test for seasonal data with serial
 *   dependence. Water Resources Research 20(6), 727-732.
 * - Hipel, K. W. & McLeod, A. I. (1994). Time Series Modelling of Water Resources and Environmental
 *   Systems. Elsevier (seasonal Sen's slope).
 *
 * Matches `pymannkendall.seasonal_test(x, period=12)` and `seasonal_sens_slope(x, 12)` when x is the
 * monthly vector that starts at the earliest point given (missing months as NaN): S and Var(S)
 * (tie-corrected) are summed over the 12 calendar months, tau = S / sum_m n_m (n_m - 1) / 2, and the
 * slope is the median of all within-month pairwise slopes in value units per year.
 */

import { mannKendall, mkScore, mkZ, varianceS, type TrendDirection } from './mannKendall.ts';
import { twoSidedNormalP } from './normal.ts';
import { pairwiseSlopes } from './sen.ts';
import { cleanMonthly, type MonthlyPoint } from './series.ts';
import { insufficient, MIN_POINTS, median, medianSorted, type InsufficientData } from './util.ts';

interface MonthColumns {
  /** Year of the earliest point (the time origin). */
  y0: number;
  /** Absolute month index (year * 12 + month - 1) of the earliest point. */
  origin: number;
  /** For each calendar month (0 = January): valid values in time order and their years since y0. */
  cols: { x: number[]; t: number[] }[];
  /** All valid values and their month positions since the origin. */
  all: number[];
  positions: number[];
  years: number;
}

function columns(monthly: readonly MonthlyPoint[]): MonthColumns {
  const pts = cleanMonthly(monthly);
  const cols = Array.from({ length: 12 }, () => ({ x: [] as number[], t: [] as number[] }));
  const all: number[] = [];
  const positions: number[] = [];
  const yearsWithData = new Set<number>();
  const y0 = pts.length > 0 ? pts[0].year : 0;
  const origin = pts.length > 0 ? pts[0].year * 12 + pts[0].month - 1 : 0;
  for (const p of pts) {
    if (p.value === null) continue;
    cols[p.month - 1].x.push(p.value);
    cols[p.month - 1].t.push(p.year - y0);
    all.push(p.value);
    positions.push(p.year * 12 + p.month - 1 - origin);
    yearsWithData.add(p.year);
  }
  return { y0, origin, cols, all, positions, years: yearsWithData.size };
}

export interface SeasonalSensSlope {
  /** Median within-month pairwise slope, value units per year. */
  slope: number;
  /**
   * Intercept as pymannkendall defines it: median(x) - median(position) / 12 * slope, with position
   * counted in months from the earliest point (so the line is in "years since the first month").
   */
  intercept: number;
}

function seasonalSlopeOf(c: MonthColumns): SeasonalSensSlope {
  const parts: Float64Array[] = c.cols.map((col) => pairwiseSlopes(col.x, col.t));
  const total = parts.reduce((s, a) => s + a.length, 0);
  const all = new Float64Array(total);
  let k = 0;
  for (const a of parts) {
    all.set(a, k);
    k += a.length;
  }
  all.sort();
  const slope = medianSorted(all);
  const intercept = c.all.length > 0 && Number.isFinite(slope) ? median(c.all) - (median(c.positions) / 12) * slope : NaN;
  return { slope, intercept };
}

/** Seasonal Sen's slope (Hipel & McLeod 1994) of monthly points, per year. */
export function seasonalSensSlope(monthly: readonly MonthlyPoint[]): SeasonalSensSlope {
  return seasonalSlopeOf(columns(monthly));
}

export interface SeasonalMKResult {
  ok: true;
  /** Number of valid monthly values. */
  n: number;
  /** Number of distinct years with at least one valid month. */
  years: number;
  S: number;
  varS: number;
  z: number;
  p: number;
  tau: number;
  significant: boolean;
  trend: TrendDirection;
  slopePerYear: number;
  slopePerDecade: number;
  intercept: number;
}

/**
 * Hirsch seasonal Mann-Kendall test with the seasonal Sen's slope (period 12, calendar months).
 * Returns an insufficient-data result when fewer than 4 years hold data.
 */
export function seasonalMK(
  monthly: readonly MonthlyPoint[],
  options: { alpha?: number } = {},
): SeasonalMKResult | InsufficientData {
  const alpha = options.alpha !== undefined && options.alpha > 0 && options.alpha < 1 ? options.alpha : 0.05;
  const c = columns(monthly);
  if (c.years < MIN_POINTS) return insufficient(c.years, MIN_POINTS, 'years');
  let S = 0;
  let varS = 0;
  let denom = 0;
  for (const col of c.cols) {
    const n = col.x.length;
    S += mkScore(col.x);
    varS += varianceS(col.x, true);
    denom += 0.5 * n * (n - 1);
  }
  const z = mkZ(S, varS);
  const p = S === 0 ? 1 : twoSidedNormalP(z);
  const significant = p < alpha;
  const sen = seasonalSlopeOf(c);
  return {
    ok: true,
    n: c.all.length,
    years: c.years,
    S,
    varS,
    z,
    p,
    tau: denom > 0 ? S / denom : 0,
    significant,
    trend: significant ? (z > 0 ? 'increasing' : 'decreasing') : 'no trend',
    slopePerYear: sen.slope,
    slopePerDecade: sen.slope * 10,
    intercept: sen.intercept,
  };
}

export interface MonthTrendOk {
  ok: true;
  /** Calendar month, 1 to 12. */
  month: number;
  n: number;
  slopePerYear: number;
  slopePerDecade: number;
  /** Sen line value in the earliest year of the record (t = 0). */
  intercept: number;
  S: number;
  varS: number;
  z: number;
  p: number;
  tau: number;
  significant: boolean;
  trend: TrendDirection;
}

export type MonthTrend = MonthTrendOk | (InsufficientData & { month: number });

/**
 * Sen's slope and Mann-Kendall p (original test, tie-corrected) for each calendar month across the
 * years: the seasonal fingerprint of a trend. Time is in years since the earliest year of the record.
 * Always returns 12 entries (January first); months with fewer than 4 values are insufficient.
 */
export function monthlyTrends(monthly: readonly MonthlyPoint[], options: { alpha?: number } = {}): MonthTrend[] {
  const c = columns(monthly);
  return c.cols.map((col, m) => {
    const month = m + 1;
    if (col.x.length < MIN_POINTS) return { ...insufficient(col.x.length, MIN_POINTS, 'years'), month };
    const r = mannKendall(col.x, { t: col.t, alpha: options.alpha });
    return {
      ok: true,
      month,
      n: r.n,
      slopePerYear: r.slope,
      slopePerDecade: r.slope * 10,
      intercept: r.intercept,
      S: r.S,
      varS: r.varS,
      z: r.z,
      p: r.p,
      tau: r.tau,
      significant: r.significant,
      trend: r.trend,
    };
  });
}
