/**
 * Years of data needed to detect a trend.
 *
 * Weatherhead, E. C. et al. (1998). Factors affecting the detection of trends: statistical
 * considerations and applications to environmental data. Journal of Geophysical Research 103(D14),
 * 17149-17161, equation (3):
 *
 *   n* = [ (3.3 sigma_N / |omega_0|) * sqrt((1 + phi) / (1 - phi)) ]^(2/3)
 *
 * the number of years for a linear trend omega_0 (per year) in AR(1) noise with standard deviation
 * sigma_N and lag-1 autocorrelation phi to be detected with probability 0.90 at the 5% level.
 */

export interface DetectionResult {
  /** Years of record needed, n*; Infinity when the slope is 0 or not finite. */
  years: number;
  /**
   * Projected calendar year by which the record is long enough: firstYear + ceil(n*) - 1
   * (equivalently lastYear + ceil(n*) - recordLength). Null when n* is infinite.
   */
  year: number | null;
  /** True when that year is not after the last year of the series (already detectable). */
  withinRecord: boolean;
  /** Years still needed beyond the end of the series (0 when already within the record). */
  yearsToGo: number;
  sigma: number;
  /** Autocorrelation used, after clamping to [-0.99, 0.99]. */
  phi: number;
}

const PHI_LIMIT = 0.99;

/**
 * Weatherhead et al. (1998) detection time n* in years. `slopePerYear` is the trend per year,
 * `residualStd` the standard deviation and `phi` the lag-1 autocorrelation of the residuals of the
 * series the slope was fitted on. phi is clamped to [-0.99, 0.99] (NaN counts as 0).
 * Returns Infinity when the slope is 0, NaN when sigma is missing or negative.
 */
export function detectionYears(slopePerYear: number, residualStd: number, phi: number): number {
  if (!Number.isFinite(slopePerYear) || slopePerYear === 0) return Infinity;
  if (!(residualStd >= 0) || !Number.isFinite(residualStd)) return NaN;
  const f = clampPhi(phi);
  const base = ((3.3 * residualStd) / Math.abs(slopePerYear)) * Math.sqrt((1 + f) / (1 - f));
  return Math.pow(base, 2 / 3);
}

function clampPhi(phi: number): number {
  if (!Number.isFinite(phi)) return Number.isNaN(phi) ? 0 : Math.sign(phi) * PHI_LIMIT;
  return Math.max(-PHI_LIMIT, Math.min(PHI_LIMIT, phi));
}

/**
 * Detection time plus the projected calendar year, for a series that runs from `firstYear` to
 * `lastYear` (inclusive).
 */
export function detection(
  slopePerYear: number,
  residualStd: number,
  phi: number,
  span: { firstYear: number; lastYear: number },
): DetectionResult {
  const years = detectionYears(slopePerYear, residualStd, phi);
  const sigma = residualStd;
  const usedPhi = clampPhi(phi);
  if (!Number.isFinite(years) || !Number.isFinite(span.firstYear) || !Number.isFinite(span.lastYear)) {
    return { years, year: null, withinRecord: false, yearsToGo: Infinity, sigma, phi: usedPhi };
  }
  const year = span.firstYear + Math.max(1, Math.ceil(years)) - 1;
  const withinRecord = year <= span.lastYear;
  return { years, year, withinRecord, yearsToGo: Math.max(0, year - span.lastYear), sigma, phi: usedPhi };
}
