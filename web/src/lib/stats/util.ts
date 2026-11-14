/**
 * Small numeric helpers shared by the statistics modules.
 *
 * Missing values: `null`, `undefined`, `NaN`, +/-Infinity and the NASA POWER fill value -999 are all
 * treated as missing everywhere in this library.
 */

/** A value that may be missing. */
export type MaybeNumber = number | null | undefined;

/** NASA POWER fill value for missing data. */
export const POWER_FILL = -999;

/** True when `v` is a usable number (finite and not the POWER fill value). */
export function isValid(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v !== POWER_FILL;
}

/** Safe length of something that should be array-like; 0 for anything else. */
export function safeLength(a: unknown): number {
  if (a == null) return 0;
  const len = (a as { length?: unknown }).length;
  return typeof len === 'number' && Number.isFinite(len) && len > 0 ? Math.floor(len) : 0;
}

/**
 * Drop missing values but keep each value's time position.
 *
 * With no `t`, the time of element i is i (the index in the original array, so gaps keep the time axis
 * correct, as pymannkendall does when it is given NaN). Pairs with a missing time are dropped too.
 */
export function compact(
  values: ArrayLike<MaybeNumber>,
  t?: ArrayLike<MaybeNumber>,
): { x: number[]; t: number[] } {
  const n = safeLength(values);
  const tn = t === undefined ? n : Math.min(n, safeLength(t));
  const xs: number[] = [];
  const ts: number[] = [];
  for (let i = 0; i < tn; i++) {
    const v = values[i];
    const ti = t === undefined ? i : t[i];
    if (isValid(v) && typeof ti === 'number' && Number.isFinite(ti)) {
      xs.push(v);
      ts.push(ti);
    }
  }
  return { x: xs, t: ts };
}

/** Ascending numeric sort of a copy. */
export function sortedCopy(a: ArrayLike<number>): Float64Array {
  const out = Float64Array.from(a as ArrayLike<number>);
  out.sort();
  return out;
}

/** Median of an already sorted array (mean of the two middle values when the length is even). */
export function medianSorted(s: ArrayLike<number>): number {
  const n = s.length;
  if (n === 0) return NaN;
  const h = n >> 1;
  return n % 2 === 1 ? s[h] : (s[h - 1] + s[h]) / 2;
}

/** Median, same definition as `numpy.median`. NaN for an empty input. */
export function median(a: ArrayLike<number>): number {
  return medianSorted(sortedCopy(a));
}

/** Arithmetic mean; NaN for an empty input. */
export function mean(a: ArrayLike<number>): number {
  const n = a.length;
  if (n === 0) return NaN;
  let s = 0;
  for (let i = 0; i < n; i++) s += a[i];
  return s / n;
}

/** Sample standard deviation (n - 1 in the denominator); NaN when n < 2. */
export function sampleStd(a: ArrayLike<number>): number {
  const n = a.length;
  if (n < 2) return NaN;
  const m = mean(a);
  let ss = 0;
  for (let i = 0; i < n; i++) {
    const d = a[i] - m;
    ss += d * d;
  }
  return Math.sqrt(ss / (n - 1));
}

/**
 * Linear interpolation into a sorted array at a fractional 0-based position, clamped to the ends
 * (same as `numpy.interp(pos, arange(n), sorted)`).
 */
export function interpSorted(s: ArrayLike<number>, pos: number): number {
  const n = s.length;
  if (n === 0 || Number.isNaN(pos)) return NaN;
  if (pos <= 0) return s[0];
  if (pos >= n - 1) return s[n - 1];
  const i = Math.floor(pos);
  const f = pos - i;
  return f === 0 ? s[i] : s[i] + f * (s[i + 1] - s[i]);
}

/** Average ranks (1-based) with ties sharing the mean rank, like `scipy.stats.rankdata`. */
export function rankAverage(x: ArrayLike<number>): number[] {
  const n = x.length;
  const idx = Array.from({ length: n }, (_, i) => i);
  idx.sort((a, b) => x[a] - x[b]);
  const ranks = new Array<number>(n);
  let i = 0;
  while (i < n) {
    let j = i;
    while (j + 1 < n && x[idx[j + 1]] === x[idx[i]]) j++;
    const r = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) ranks[idx[k]] = r;
    i = j + 1;
  }
  return ranks;
}

/**
 * Sample autocorrelation function for lags 0..maxLag, with the biased (divide by n) autocovariance
 * normalised by the lag-0 value. This is the estimator pymannkendall uses internally (`__acf`).
 * Returns zeros (and 1 at lag 0) when the series has no variance.
 */
export function acf(x: ArrayLike<number>, maxLag: number): number[] {
  const n = x.length;
  const L = Math.max(0, Math.min(Math.floor(maxLag), n - 1));
  const out = new Array<number>(L + 1).fill(0);
  if (n === 0) return out;
  const m = mean(x);
  const y = new Float64Array(n);
  for (let i = 0; i < n; i++) y[i] = x[i] - m;
  let c0 = 0;
  for (let i = 0; i < n; i++) c0 += y[i] * y[i];
  out[0] = 1;
  if (!(c0 > 0)) return out;
  for (let k = 1; k <= L; k++) {
    let c = 0;
    for (let i = 0; i + k < n; i++) c += y[i] * y[i + k];
    out[k] = c / c0;
  }
  return out;
}

/** Sign function returning -1, 0 or 1. */
export function sign(v: number): number {
  return v > 0 ? 1 : v < 0 ? -1 : 0;
}

/** Minimum number of valid values for a trend analysis. */
export const MIN_POINTS = 4;

/** Typed result returned instead of an analysis when there is too little data. */
export interface InsufficientData {
  ok: false;
  reason: 'insufficient-data';
  /** Number of valid values (or years, for seasonal analyses) that were available. */
  n: number;
  /** Minimum needed. */
  minimum: number;
  message: string;
}

export function insufficient(n: number, minimum = MIN_POINTS, what = 'values'): InsufficientData {
  return {
    ok: false,
    reason: 'insufficient-data',
    n,
    minimum,
    message: `Need at least ${minimum} ${what} with data, found ${n}.`,
  };
}
