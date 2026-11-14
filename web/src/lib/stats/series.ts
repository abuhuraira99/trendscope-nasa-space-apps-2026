/**
 * Time-series preparation: annual aggregation, deseasonalising, residuals and lag-1 autocorrelation.
 */

import { acf, isValid, safeLength, type MaybeNumber } from './util.ts';

/** One monthly value. `month` is 1 to 12. A missing value is null (NaN and -999 also count as missing). */
export interface MonthlyPoint {
  year: number;
  month: number;
  value: number | null;
}

/** An annual series on a contiguous year axis; years without enough data hold null. */
export interface AnnualSeries {
  years: number[];
  values: (number | null)[];
  /** Number of valid months behind each year. */
  counts: number[];
}

export type AnnualStat = 'mean' | 'sum';

/** Valid monthly points, deduplicated by (year, month) with the last occurrence winning, sorted by time. */
export function cleanMonthly(monthly: readonly MonthlyPoint[]): { year: number; month: number; value: number | null }[] {
  const n = safeLength(monthly);
  const byKey = new Map<number, { year: number; month: number; value: number | null }>();
  for (let i = 0; i < n; i++) {
    const p = monthly[i];
    if (p == null || typeof p !== 'object') continue;
    const { year, month } = p;
    if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) continue;
    byKey.set(year * 12 + (month - 1), { year, month, value: isValid(p.value) ? p.value : null });
  }
  return [...byKey.entries()].sort((a, b) => a[0] - b[0]).map((e) => e[1]);
}

/**
 * Annual values from monthly values (TrendScope build spec, "Variables").
 *
 * A year gets a value when at least `minMonths` of its 12 months are valid, else null.
 * `stat = 'mean'` averages the valid months. `stat = 'sum'` adds monthly totals (for example cooling
 * degree days); when a year has fewer than 12 valid months the sum is scaled up as mean * 12 so that
 * gaps do not bias it low (identical to the plain sum when all 12 months are present).
 *
 * Only complete calendar years are used: the last year of the record is dropped unless it has a
 * valid December, and leading or trailing years without a value are trimmed. Inner years without
 * enough data stay in the result as null so the time axis remains correct.
 */
export function annualMeans(
  monthly: readonly MonthlyPoint[],
  minMonths = 10,
  stat: AnnualStat = 'mean',
): AnnualSeries {
  const pts = cleanMonthly(monthly);
  const empty: AnnualSeries = { years: [], values: [], counts: [] };
  if (pts.length === 0) return empty;
  const need = Math.max(1, Math.min(12, Number.isFinite(minMonths) ? Math.ceil(minMonths) : 10));
  const y0 = pts[0].year;
  const y1 = pts[pts.length - 1].year;
  const sums = new Array<number>(y1 - y0 + 1).fill(0);
  const counts = new Array<number>(y1 - y0 + 1).fill(0);
  const hasDec = new Array<boolean>(y1 - y0 + 1).fill(false);
  for (const p of pts) {
    if (p.value === null) continue;
    const k = p.year - y0;
    sums[k] += p.value;
    counts[k] += 1;
    if (p.month === 12) hasDec[k] = true;
  }
  let values: (number | null)[] = sums.map((s, k) => {
    if (counts[k] < need) return null;
    const m = s / counts[k];
    return stat === 'sum' ? (counts[k] === 12 ? s : m * 12) : m;
  });
  let years = values.map((_, k) => y0 + k);
  let cnt = counts.slice();
  // Drop an incomplete final calendar year.
  if (!hasDec[hasDec.length - 1]) {
    values = values.slice(0, -1);
    years = years.slice(0, -1);
    cnt = cnt.slice(0, -1);
  }
  let a = 0;
  let b = values.length - 1;
  while (a <= b && values[a] === null) a++;
  while (b >= a && values[b] === null) b--;
  if (a > b) return empty;
  return { years: years.slice(a, b + 1), values: values.slice(a, b + 1), counts: cnt.slice(a, b + 1) };
}

/** Mean of each calendar month over all years (index 0 = January); NaN for a month with no data. */
export function monthlyClimatology(monthly: readonly MonthlyPoint[]): number[] {
  const sums = new Array<number>(12).fill(0);
  const counts = new Array<number>(12).fill(0);
  for (const p of cleanMonthly(monthly)) {
    if (p.value === null) continue;
    sums[p.month - 1] += p.value;
    counts[p.month - 1] += 1;
  }
  return sums.map((s, m) => (counts[m] > 0 ? s / counts[m] : NaN));
}

/**
 * Anomalies against the month-of-year mean (the climatology of the whole record).
 * Returns the cleaned, time-sorted points with each value replaced by value - climatology[month].
 */
export function deseasonalize(monthly: readonly MonthlyPoint[]): MonthlyPoint[] {
  const clim = monthlyClimatology(monthly);
  return cleanMonthly(monthly).map((p) => ({
    year: p.year,
    month: p.month,
    value: p.value === null ? null : p.value - clim[p.month - 1],
  }));
}

/** Residuals x_i - (intercept + slope * t_i); missing values stay null. */
export function residuals(
  t: ArrayLike<MaybeNumber>,
  x: ArrayLike<MaybeNumber>,
  slope: number,
  intercept: number,
): (number | null)[] {
  const n = Math.min(safeLength(t), safeLength(x));
  const out: (number | null)[] = [];
  for (let i = 0; i < n; i++) {
    const ti = t[i];
    const xi = x[i];
    out.push(isValid(xi) && typeof ti === 'number' && Number.isFinite(ti) ? xi - (intercept + slope * ti) : null);
  }
  return out;
}

/**
 * Lag-1 autocorrelation r1 = sum (y_i - m)(y_(i+1) - m) / sum (y_i - m)^2 of the valid values in
 * order (missing values are dropped first). This is the estimator pymannkendall uses. Returns 0 for
 * a constant series and NaN for fewer than 3 valid values.
 */
export function lag1Autocorr(x: ArrayLike<MaybeNumber>): number {
  const v: number[] = [];
  const n = safeLength(x);
  for (let i = 0; i < n; i++) {
    const xi = x[i];
    if (isValid(xi)) v.push(xi);
  }
  if (v.length < 3) return NaN;
  return acf(v, 1)[1];
}
