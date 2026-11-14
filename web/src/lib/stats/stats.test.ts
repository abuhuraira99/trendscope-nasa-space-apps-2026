import { describe, expect, it } from 'vitest';
import raw from './__fixtures__/pymk.json?raw';
import {
  ar1VarianceFactor,
  analyzeAnnual,
  analyzeMonthly,
  annualMeans,
  bhMask,
  bhThreshold,
  confidenceFromP,
  deseasonalize,
  detection,
  detectionYears,
  erf,
  erfc,
  hamedRao,
  lag1Autocorr,
  mannKendall,
  monthlyTrends,
  normalCdf,
  normalQuantile,
  normalSf,
  ols,
  pettitt,
  residuals,
  seasonalMK,
  seasonalSensSlope,
  sensSlope,
  sensSlopeWithCI,
  significanceCodes,
  studentTCdf,
  studentTQuantile,
  twoSidedStudentP,
  yueWang,
  yueWangFactorConservative,
  type AnnualAnalysis,
  type MonthlyPoint,
} from './index.ts';

// ------------------------------------------------------------------------------------------------
// Fixture types (written by pipeline/make_stats_fixtures.py)

type N = number | null;

interface MkRef {
  trend: string;
  h: boolean;
  p: N;
  z: N;
  tau: N;
  s: N;
  var_s: N;
  slope: N;
  intercept: N;
}

interface CorrRef {
  p: N;
  z: N;
  var_s: N;
  n_star: N;
  factor_invalid: boolean;
  r1?: N;
}

interface AnnualCase {
  name: string;
  note: string;
  gapped: boolean;
  x: N[];
  original: MkRef;
  sens: { slope: N; intercept: N };
  yue_wang: CorrRef;
  yue_wang_pymk: MkRef;
  yue_wang_gated: CorrRef;
  yue_wang_conservative: CorrRef;
  hamed_rao: CorrRef;
  hamed_rao_pymk: MkRef;
  gilbert_ci: { original: [N, N]; yue_wang: [N, N]; yue_wang_conservative: [N, N] };
  ols?: { slope: N; intercept: N; se: N; t: N; df: number; p: N; ci: [N, N]; r2: N };
  pettitt?: { index: number; U: number; p: number; time: number; mean_before: number; mean_after: number };
  detection?: { years: N; year: number | null; sigma: N; phi: N };
}

interface MonthlyCase {
  name: string;
  note: string;
  stat: 'mean' | 'sum';
  points: [number, number, N][];
  seasonal: MkRef;
  months: (MkRef & { month: number; n: number })[];
  annual: {
    years: number[];
    values: N[];
    yue_wang: CorrRef;
    sens: { slope: N; intercept: N };
    gilbert_ci: [N, N];
    yue_wang_conservative: CorrRef;
    gilbert_ci_conservative: [N, N];
  };
}

interface Fixtures {
  first_year: number;
  annual: AnnualCase[];
  monthly: MonthlyCase[];
  distributions: {
    normal: { x: number; cdf: number; sf: number }[];
    erf: { x: number; erf: number; erfc: number }[];
    normal_ppf: { p: number; x: number }[];
    t_cdf: { t: number; df: number; cdf: number; p2: number }[];
    t_ppf: { p: number; df: number; x: number }[];
  };
}

const fx = JSON.parse(raw) as Fixtures;

// ------------------------------------------------------------------------------------------------
// Tolerances (contract: p within 1e-6 absolute, slopes within 1e-9 relative)

const P_ABS = 1e-6;
const REL = 1e-9;

function near(actual: number, expected: N, label: string, rel = REL, abs = 1e-12): void {
  if (expected === null) throw new Error(`${label}: expected value is missing in the fixture`);
  if (!Number.isFinite(expected)) {
    expect(actual, label).toBe(expected);
    return;
  }
  const tol = Math.max(abs, rel * Math.abs(expected));
  expect(Math.abs(actual - expected), `${label}: got ${actual}, expected ${expected}`).toBeLessThanOrEqual(tol);
}

function nearP(actual: number, expected: N, label: string): void {
  near(actual, expected, label, 0, P_ABS);
}

function toPoints(c: MonthlyCase): MonthlyPoint[] {
  return c.points.map(([year, month, value]) => ({ year, month, value }));
}

// ------------------------------------------------------------------------------------------------
// pymannkendall fixtures: annual (1-D) series

describe('fixtures are present', () => {
  it('has about 40 annual and several monthly cases', () => {
    expect(fx.annual.length).toBeGreaterThanOrEqual(40);
    expect(fx.monthly.length).toBeGreaterThanOrEqual(5);
  });
});

describe.each(fx.annual.map((c) => [c.name, c] as const))('annual fixture %s', (_name, c) => {
  it('original_test', () => {
    const r = mannKendall(c.x);
    const e = c.original;
    expect(r.S).toBe(e.s);
    near(r.varS, e.var_s, 'var_s');
    near(r.z, e.z, 'z');
    nearP(r.p, e.p, 'p');
    near(r.tau, e.tau, 'tau');
    near(r.slope, e.slope, 'slope', REL, 1e-14);
    near(r.intercept, e.intercept, 'intercept', REL, 1e-12);
    expect(r.trend).toBe(e.trend);
  });

  it('yue_wang_modification_test(lag=1) with variant pymk', () => {
    const r = yueWang(c.x, { yueWangVariant: 'pymk' });
    const e = c.yue_wang;
    near(r.varS, e.var_s, 'var_s');
    near(r.z, e.z, 'z');
    nearP(r.p, e.p, 'p');
    if (e.r1 !== null && e.r1 !== undefined) near(r.r1, e.r1, 'r1', REL, 1e-12);
    if (e.factor_invalid) {
      expect(r.correctionApplied).toBe(false);
      expect(r.nStar).toBe(1);
      expect(r.p).toBe(mannKendall(c.x).p);
    } else {
      near(r.nStar, e.n_star, 'n_star');
    }
    expect(mannKendall(c.x, { correction: 'yue-wang', yueWangVariant: 'pymk' }).p).toBe(r.p);
    // Gap-free series with a valid factor: compare with the package output itself.
    const pk = c.yue_wang_pymk;
    if (!c.gapped && !e.factor_invalid && pk.p !== null) {
      nearP(r.p, pk.p, 'pymk p');
      near(r.z, pk.z, 'pymk z');
      if (pk.var_s !== null) near(r.varS, pk.var_s, 'pymk var_s');
      expect(r.trend).toBe(pk.trend);
      near(r.slope, pk.slope, 'pymk slope', REL, 1e-14);
    }
  });

  it('Yue-Wang conservative variant (default)', () => {
    const r = yueWang(c.x);
    const e = c.yue_wang_conservative;
    near(r.varS, e.var_s, 'var_s');
    near(r.z, e.z, 'z');
    nearP(r.p, e.p, 'p');
    near(r.nStar, e.n_star, 'n_star');
    if (e.r1 !== null && e.r1 !== undefined) near(r.r1, e.r1, 'r1', REL, 1e-12);
    expect(r.nStar).toBeGreaterThanOrEqual(1);
    expect(r.varS).toBeGreaterThanOrEqual(r.varSUncorrected);
    expect(r.nStar).toBe(Number.isNaN(r.r1) ? 1 : yueWangFactorConservative(r.r1, r.n));
    expect(mannKendall(c.x, { correction: 'yue-wang' }).p).toBe(r.p);
  });

  it('Yue-Wang gated AR(1) variant (build-spec text)', () => {
    const r = mannKendall(c.x, { correction: 'yue-wang', yueWangVariant: 'gated-ar1' });
    const e = c.yue_wang_gated;
    near(r.varS, e.var_s, 'var_s');
    nearP(r.p, e.p, 'p');
    if (!e.factor_invalid) near(r.nStar, e.n_star, 'n_star');
  });

  it('hamed_rao_modification_test', () => {
    const r = hamedRao(c.x);
    const e = c.hamed_rao;
    near(r.varS, e.var_s, 'var_s');
    near(r.z, e.z, 'z');
    nearP(r.p, e.p, 'p');
    if (!e.factor_invalid) near(r.nStar, e.n_star, 'n_star');
    const pk = c.hamed_rao_pymk;
    if (!c.gapped && !e.factor_invalid && pk.p !== null) {
      nearP(r.p, pk.p, 'pymk p');
      expect(r.trend).toBe(pk.trend);
    }
  });

  it('sens_slope', () => {
    const r = sensSlope(c.x);
    near(r.slope, c.sens.slope, 'slope', REL, 1e-14);
    near(r.intercept, c.sens.intercept, 'intercept', REL, 1e-12);
  });

  it('Gilbert confidence interval', () => {
    const r0 = mannKendall(c.x);
    const ci0 = sensSlopeWithCI(c.x, r0.varSUncorrected).ci;
    near(ci0.lower, c.gilbert_ci.original[0], 'lower (original)', REL, 1e-14);
    near(ci0.upper, c.gilbert_ci.original[1], 'upper (original)', REL, 1e-14);
    const ry = yueWang(c.x, { yueWangVariant: 'pymk' });
    const ci1 = sensSlopeWithCI(c.x, ry.varS).ci;
    near(ci1.lower, c.gilbert_ci.yue_wang[0], 'lower (yue-wang pymk)', REL, 1e-14);
    near(ci1.upper, c.gilbert_ci.yue_wang[1], 'upper (yue-wang pymk)', REL, 1e-14);
    expect(ci1.lower).toBeLessThanOrEqual(ry.slope);
    expect(ci1.upper).toBeGreaterThanOrEqual(ry.slope);
    const rc = yueWang(c.x);
    const ci2 = sensSlopeWithCI(c.x, rc.varS).ci;
    near(ci2.lower, c.gilbert_ci.yue_wang_conservative[0], 'lower (conservative)', REL, 1e-14);
    near(ci2.upper, c.gilbert_ci.yue_wang_conservative[1], 'upper (conservative)', REL, 1e-14);
    // Never narrower than the uncorrected interval.
    expect(ci2.lower).toBeLessThanOrEqual(ci0.lower);
    expect(ci2.upper).toBeGreaterThanOrEqual(ci0.upper);
  });

  it('OLS', () => {
    const e = c.ols;
    if (!e) return;
    const t = c.x.map((_, i) => i);
    const r = ols(t, c.x);
    near(r.slope, e.slope, 'slope', REL, 1e-14);
    near(r.intercept, e.intercept, 'intercept', 1e-9, 1e-12);
    near(r.se, e.se, 'se', 1e-8, 1e-14);
    if (e.t !== null) near(r.tStat, e.t, 't', 1e-8, 1e-10);
    expect(r.df).toBe(e.df);
    nearP(r.p, e.p, 'p');
    near(r.ci[0], e.ci[0], 'ci lower', 1e-8, 1e-13);
    near(r.ci[1], e.ci[1], 'ci upper', 1e-8, 1e-13);
    near(r.r2, e.r2, 'r2', 0, 1e-9);
  });

  it('Pettitt', () => {
    const e = c.pettitt;
    if (!e) return;
    const r = pettitt(c.x);
    expect(r.index).toBe(e.index);
    near(r.U, e.U, 'U');
    nearP(r.p, e.p, 'p');
    expect(r.time).toBe(e.time);
    near(r.meanBefore, e.mean_before, 'mean before');
    near(r.meanAfter, e.mean_after, 'mean after');
  });

  it('analyzeAnnual matches the conservative Yue-Wang test, Gilbert CI, OLS, Pettitt and detection', () => {
    const years = c.x.map((_, i) => fx.first_year + i);
    const a = analyzeAnnual(years, c.x);
    expect(a.ok).toBe(true);
    const r = a as AnnualAnalysis;
    const firstIdx = c.x.findIndex((v) => v !== null);
    const lastIdx = c.x.length - 1 - [...c.x].reverse().findIndex((v) => v !== null);
    expect(r.n).toBe(c.x.filter((v) => v !== null).length);
    expect(r.firstYear).toBe(fx.first_year + firstIdx);
    expect(r.lastYear).toBe(fx.first_year + lastIdx);
    expect(r.S).toBe(c.original.s);
    near(r.varS, c.yue_wang_conservative.var_s, 'var_s');
    nearP(r.p, c.yue_wang_conservative.p, 'p');
    near(r.nStar, c.yue_wang_conservative.n_star, 'n_star');
    nearP(r.pUncorrected, c.original.p, 'p uncorrected');
    near(r.slopePerDecade, (c.sens.slope as number) * 10, 'slope per decade', REL, 1e-13);
    const ciC = c.gilbert_ci.yue_wang_conservative;
    near(r.ciPerDecade[0], (ciC[0] as number) * 10, 'ci lower', REL, 1e-13);
    near(r.ciPerDecade[1], (ciC[1] as number) * 10, 'ci upper', REL, 1e-13);
    // The other forms stay available as options.
    const pk = analyzeAnnual(years, c.x, { yueWangVariant: 'pymk' }) as AnnualAnalysis;
    nearP(pk.p, c.yue_wang.p, 'pymk p');
    near(pk.varS, c.yue_wang.var_s, 'pymk var_s');
    near(pk.ciPerDecade[0], (c.gilbert_ci.yue_wang[0] as number) * 10, 'pymk ci lower', REL, 1e-13);
    const gt = analyzeAnnual(years, c.x, { yueWangVariant: 'gated-ar1' }) as AnnualAnalysis;
    nearP(gt.p, c.yue_wang_gated.p, 'gated p');
    // Intercept is reported at firstYear; pymannkendall reports it at index 0.
    near(r.intercept, (c.sens.intercept as number) + (c.sens.slope as number) * firstIdx, 'intercept', 1e-9, 1e-10);
    near(r.totalChange, r.slopePerYear * (r.lastYear - r.firstYear), 'total change');
    expect(r.significant).toBe(r.p < 0.05);
    expect(r.confidence).toBe(confidenceFromP(r.p));
    if (c.ols) {
      near(r.ols.slopePerDecade, (c.ols.slope as number) * 10, 'ols slope', 1e-9, 1e-13);
      nearP(r.ols.p, c.ols.p, 'ols p');
      near(r.ols.r2, c.ols.r2, 'ols r2', 0, 1e-9);
    }
    if (c.pettitt) {
      expect(r.pettitt.year).toBe(fx.first_year + c.pettitt.time);
      nearP(r.pettitt.p, c.pettitt.p, 'pettitt p');
    }
    if (c.detection) {
      const d = c.detection;
      if (d.years === null) {
        expect(r.detection.years).toBe(Infinity);
        expect(r.detection.year).toBeNull();
      } else {
        near(r.detection.years, d.years, 'detection years', 1e-8, 1e-10);
        expect(r.detection.year).toBe(d.year);
      }
      if (d.sigma !== null) near(r.detection.sigma, d.sigma, 'sigma', 1e-9, 1e-14);
    }
  });
});

// ------------------------------------------------------------------------------------------------
// pymannkendall fixtures: monthly series

describe.each(fx.monthly.map((c) => [c.name, c] as const))('monthly fixture %s', (_name, c) => {
  const pts = toPoints(c);

  it('seasonal_test(period=12)', () => {
    const r = seasonalMK(pts);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const e = c.seasonal;
    expect(r.S).toBe(e.s);
    near(r.varS, e.var_s, 'var_s');
    near(r.z, e.z, 'z');
    nearP(r.p, e.p, 'p');
    near(r.tau, e.tau, 'tau');
    near(r.slopePerYear, e.slope, 'slope', REL, 1e-14);
    near(r.intercept, e.intercept, 'intercept', 1e-9, 1e-12);
    expect(r.trend).toBe(e.trend);
    const s = seasonalSensSlope(pts);
    near(s.slope, e.slope, 'seasonal_sens_slope slope', REL, 1e-14);
    near(s.intercept, e.intercept, 'seasonal_sens_slope intercept', 1e-9, 1e-12);
  });

  it('monthly trends match original_test per calendar month', () => {
    const months = monthlyTrends(pts);
    expect(months).toHaveLength(12);
    for (const e of c.months) {
      const r = months[e.month - 1];
      expect(r.month).toBe(e.month);
      if (e.n < 4) {
        expect(r.ok).toBe(false);
        continue;
      }
      expect(r.ok).toBe(true);
      if (!r.ok) continue;
      const lbl = `month ${e.month}`;
      expect(r.S).toBe(e.s);
      near(r.varS, e.var_s, `${lbl} var_s`);
      nearP(r.p, e.p, `${lbl} p`);
      near(r.z, e.z, `${lbl} z`);
      near(r.tau, e.tau, `${lbl} tau`);
      near(r.slopePerYear, e.slope, `${lbl} slope`, REL, 1e-14);
      near(r.intercept, e.intercept, `${lbl} intercept`, 1e-9, 1e-12);
    }
  });

  it('annual aggregation', () => {
    const a = annualMeans(pts, 10, c.stat);
    expect(a.years).toEqual(c.annual.years);
    expect(a.values.length).toBe(c.annual.values.length);
    a.values.forEach((v, i) => {
      const e = c.annual.values[i];
      if (e === null) expect(v).toBeNull();
      else near(v as number, e, `annual value ${a.years[i]}`, 1e-12, 1e-12);
    });
  });

  it('analyzeMonthly annual part matches the conservative Yue-Wang test', () => {
    const r = analyzeMonthly(pts, { stat: c.stat });
    expect(r.annual.ok).toBe(true);
    expect(r.seasonal.ok).toBe(true);
    expect(r.months).toHaveLength(12);
    if (!r.annual.ok) return;
    const e = c.annual.yue_wang_conservative;
    nearP(r.annual.p, e.p, 'p');
    near(r.annual.varS, e.var_s, 'var_s');
    near(r.annual.nStar, e.n_star, 'n_star');
    near(r.annual.slopePerYear, c.annual.sens.slope, 'slope', REL, 1e-14);
    near(r.annual.intercept, c.annual.sens.intercept, 'intercept', 1e-9, 1e-10);
    const ci = c.annual.gilbert_ci_conservative;
    near(r.annual.ciPerDecade[0], (ci[0] as number) * 10, 'ci lower', REL, 1e-13);
    near(r.annual.ciPerDecade[1], (ci[1] as number) * 10, 'ci upper', REL, 1e-13);
  });

  it('analyzeMonthly with the pymk variant matches pymannkendall', () => {
    const r = analyzeMonthly(pts, { stat: c.stat, yueWangVariant: 'pymk' });
    if (!r.annual.ok) throw new Error('expected an annual analysis');
    nearP(r.annual.p, c.annual.yue_wang.p, 'p');
    near(r.annual.varS, c.annual.yue_wang.var_s, 'var_s');
    near(r.annual.ciPerDecade[0], (c.annual.gilbert_ci[0] as number) * 10, 'ci lower', REL, 1e-13);
    near(r.annual.ciPerDecade[1], (c.annual.gilbert_ci[1] as number) * 10, 'ci upper', REL, 1e-13);
  });
});

// ------------------------------------------------------------------------------------------------
// Distributions against scipy

describe('normal and Student-t distributions (scipy references)', () => {
  const d = fx.distributions;

  it('normal CDF and upper tail', () => {
    for (const e of d.normal) {
      near(normalCdf(e.x), e.cdf, `cdf(${e.x})`, 1e-12, 1e-300);
      near(normalSf(e.x), e.sf, `sf(${e.x})`, 1e-12, 1e-300);
    }
  });

  it('erf and erfc', () => {
    for (const e of d.erf) {
      near(erf(e.x), e.erf, `erf(${e.x})`, 1e-13, 1e-300);
      near(erfc(e.x), e.erfc, `erfc(${e.x})`, 1e-13, 1e-300);
    }
  });

  it('normal quantile', () => {
    for (const e of d.normal_ppf) near(normalQuantile(e.p), e.x, `ppf(${e.p})`, 1e-12, 1e-15);
    expect(normalQuantile(0)).toBe(-Infinity);
    expect(normalQuantile(1)).toBe(Infinity);
    expect(normalQuantile(1.5)).toBeNaN();
  });

  it('Student-t CDF and two-sided p', () => {
    for (const e of d.t_cdf) {
      near(studentTCdf(e.t, e.df), e.cdf, `cdf(${e.t}, ${e.df})`, 1e-10, 1e-300);
      near(twoSidedStudentP(e.t, e.df), e.p2, `p2(${e.t}, ${e.df})`, 1e-10, 1e-300);
    }
  });

  it('Student-t quantile', () => {
    for (const e of d.t_ppf) near(studentTQuantile(e.p, e.df), e.x, `t ppf(${e.p}, ${e.df})`, 1e-10, 1e-12);
  });
});

// ------------------------------------------------------------------------------------------------
// Unit tests

describe('Benjamini-Hochberg FDR', () => {
  it('uses the step-up rule (a p above its own rank line can still pass)', () => {
    const p = [0.9, 0.05, 0.015, 0.079, 0.059];
    // sorted: 0.015, 0.05, 0.059, 0.079, 0.9 against q k / m = 0.02, 0.04, 0.06, 0.08, 0.10
    expect(bhThreshold(p, 0.1)).toBe(0.079);
    expect(bhMask(p, 0.1)).toEqual([false, true, true, true, true]);
  });

  it('ignores NaN cells and counts only valid p-values in m', () => {
    const p = [0.01, 0.04, NaN, 0.03, 0.005, 0.5];
    expect(bhThreshold(p, 0.1)).toBe(0.04);
    expect(bhMask(p, 0.1)).toEqual([true, true, false, true, true, false]);
  });

  it('returns 0 and an empty mask when nothing passes', () => {
    expect(bhThreshold([0.5, 0.6, 0.7], 0.1)).toBe(0);
    expect(bhMask([0.5, 0.6, 0.7], 0.1)).toEqual([false, false, false]);
    expect(bhThreshold([], 0.1)).toBe(0);
    expect(bhMask([0, 0.9], 0.1)).toEqual([true, false]);
  });

  it('accepts typed arrays and writes grid significance codes', () => {
    const p = Float32Array.from([0.001, 0.045, 0.6, 0.7, 0.8, 0.9]);
    const codes = significanceCodes(p, 0.1, 0.05);
    expect(Array.from(codes)).toEqual([2, 1, 0, 0, 0, 0]);
    const withNaN = significanceCodes([0.001, 0.04, 0.3, NaN]);
    expect(Array.from(withNaN.subarray(0, 3))).toEqual([2, 2, 0]);
    expect(withNaN[3]).toBeNaN();
  });
});

/** Small deterministic pseudo-noise in [-0.5, 0.5). */
function noise(n: number, seed = 1): number[] {
  let s = seed;
  return Array.from({ length: n }, () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647 - 0.5;
  });
}

describe('conservative Yue-Wang correction (TrendScope default)', () => {
  const byName = (name: string): AnnualCase => {
    const c = fx.annual.find((a) => a.name === name);
    if (!c) throw new Error(`fixture ${name} missing`);
    return c;
  };

  it('does not turn white noise with negative r1 into a trend', () => {
    const c = byName('noise_n30_a');
    const pymk = yueWang(c.x, { yueWangVariant: 'pymk' });
    const cons = yueWang(c.x);
    expect(pymk.r1).toBeLessThan(0);
    expect(pymk.significant).toBe(true); // the false positive the default avoids
    expect(cons.significant).toBe(false);
    expect(cons.nStar).toBe(1);
    expect(cons.p).toBe(mannKendall(c.x).p);
    const a = analyzeAnnual(c.x.map((_, i) => 1981 + i), c.x) as AnnualAnalysis;
    expect(a.significant).toBe(false);
    expect(a.trend).toBe('no trend');
  });

  it('inflates Var(S) for red noise (AR(1), phi = 0.6)', () => {
    const c = byName('red_noise_phi06_n45');
    const r = yueWang(c.x);
    expect(r.r1).toBeGreaterThan(1.96 / Math.sqrt(r.n));
    expect(r.nStar).toBeGreaterThan(1);
    expect(r.correctionApplied).toBe(true);
    expect(r.p).toBeGreaterThan(mannKendall(c.x).p);
    // The same on a series generated here.
    const x: number[] = [];
    let prev = 0;
    for (const v of noise(60, 5)) {
      prev = 0.6 * prev + v;
      x.push(prev);
    }
    const g = yueWang(x);
    expect(g.r1).toBeGreaterThan(1.96 / Math.sqrt(60));
    expect(g.nStar).toBeGreaterThan(1);
    expect(g.varS).toBeGreaterThan(g.varSUncorrected);
  });

  it('never shrinks Var(S) on any fixture', () => {
    for (const c of fx.annual) {
      const r = yueWang(c.x);
      expect(r.nStar, c.name).toBeGreaterThanOrEqual(1);
      expect(r.p, c.name).toBeGreaterThanOrEqual(mannKendall(c.x).p);
    }
  });

  it('yueWangFactorConservative follows its definition', () => {
    expect(yueWangFactorConservative(-0.4, 30)).toBe(1);
    expect(yueWangFactorConservative(0, 30)).toBe(1);
    expect(yueWangFactorConservative(0.3, 30)).toBe(1); // 0.3 < 1.96 / sqrt(30) = 0.358
    expect(yueWangFactorConservative(0.5, 2)).toBe(1);
    expect(yueWangFactorConservative(NaN, 30)).toBe(1);
    const n = 45;
    const r1 = 0.5;
    let sum = 0;
    for (let k = 1; k < n; k++) sum += (1 - k / n) * Math.pow(r1, k);
    expect(yueWangFactorConservative(r1, n)).toBeCloseTo(1 + 2 * sum, 12);
    expect(ar1VarianceFactor(r1, n)).toBeCloseTo(1 + 2 * sum, 12);
    // Tends to (1 + r1) / (1 - r1) = 3 for long series.
    expect(yueWangFactorConservative(r1, 1000)).toBeCloseTo(3, 2);
  });
});

describe('Pettitt change point', () => {
  it('finds a step and its size', () => {
    const e = noise(40, 7);
    const x = e.map((v, i) => (i < 15 ? 0 : 2) + 0.3 * v);
    const r = pettitt(x);
    expect(r.index).toBe(15);
    expect(r.p).toBeLessThan(0.001);
    expect(r.significant).toBe(true);
    expect(r.meanAfter - r.meanBefore).toBeGreaterThan(1.8);
    expect(r.meanAfter - r.meanBefore).toBeLessThan(2.2);
    expect(r.Ut).toBeLessThan(0); // first segment is lower
    const a = analyzeAnnual(x.map((_, i) => 1990 + i), x) as AnnualAnalysis;
    expect(a.pettitt.year).toBe(2005);
    expect(a.pettitt.shift).toBeGreaterThan(1.8);
  });

  it('is not significant for noise, and handles tiny input', () => {
    expect(pettitt(noise(40, 3)).p).toBeGreaterThan(0.05);
    const tiny = pettitt([1, 2]);
    expect(tiny.index).toBe(-1);
    expect(tiny.p).toBe(1);
  });
});

describe('Weatherhead detection years', () => {
  it('follows the formula', () => {
    // (3.3 * 1 / 0.1)^(2/3) with phi = 0
    expect(detectionYears(0.1, 1, 0)).toBeCloseTo(Math.pow(33, 2 / 3), 12);
    const phi = 0.5;
    expect(detectionYears(0.1, 1, phi)).toBeCloseTo(Math.pow(33 * Math.sqrt(1.5 / 0.5), 2 / 3), 12);
  });

  it('behaves sensibly', () => {
    expect(detectionYears(0, 1, 0)).toBe(Infinity);
    expect(detectionYears(-0.1, 1, 0.2)).toBe(detectionYears(0.1, 1, 0.2));
    expect(detectionYears(0.2, 1, 0.2)).toBeLessThan(detectionYears(0.1, 1, 0.2));
    expect(detectionYears(0.1, 2, 0.2)).toBeGreaterThan(detectionYears(0.1, 1, 0.2));
    expect(detectionYears(0.1, 1, 0.6)).toBeGreaterThan(detectionYears(0.1, 1, 0.2));
    expect(Number.isFinite(detectionYears(0.1, 1, 1))).toBe(true); // phi clamped
    expect(detectionYears(0.1, NaN, 0)).toBeNaN();
  });

  it('projects the calendar year', () => {
    const fast = detection(0.1, 1, 0, { firstYear: 1981, lastYear: 2025 });
    expect(fast.year).toBe(1981 + Math.ceil(fast.years) - 1);
    expect(fast.year).toBe(1991);
    expect(fast.withinRecord).toBe(true);
    expect(fast.yearsToGo).toBe(0);
    const slow = detection(0.001, 1, 0, { firstYear: 1981, lastYear: 2025 });
    expect(slow.year).toBe(1981 + Math.ceil(Math.pow(3300, 2 / 3)) - 1);
    expect(slow.withinRecord).toBe(false);
    expect(slow.yearsToGo).toBe((slow.year as number) - 2025);
    const none = detection(0, 1, 0, { firstYear: 1981, lastYear: 2025 });
    expect(none.year).toBeNull();
    expect(none.withinRecord).toBe(false);
  });
});

function monthly(y0: number, y1: number, f: (year: number, month: number) => number | null): MonthlyPoint[] {
  const out: MonthlyPoint[] = [];
  for (let y = y0; y <= y1; y++) for (let m = 1; m <= 12; m++) out.push({ year: y, month: m, value: f(y, m) });
  return out;
}

describe('annualMeans', () => {
  it('needs 10 of 12 months, keeps gaps as null and drops an incomplete final year', () => {
    const pts = monthly(1990, 1994, (y, m) => {
      if (y === 1991 && (m === 3 || m === 4)) return null; // 10 valid: kept
      if (y === 1992 && m <= 3) return null; // 9 valid: null
      if (y === 1994 && m > 6) return null; // record ends in June: dropped
      return y + m / 100;
    });
    const a = annualMeans(pts);
    expect(a.years).toEqual([1990, 1991, 1992, 1993]);
    expect(a.counts).toEqual([12, 10, 9, 12]);
    expect(a.values[0]).toBeCloseTo(1990.065, 12);
    const m1991 = [1, 2, 5, 6, 7, 8, 9, 10, 11, 12].reduce((s, m) => s + 1991 + m / 100, 0) / 10;
    expect(a.values[1]).toBeCloseTo(m1991, 12);
    expect(a.values[2]).toBeNull();
    expect(a.values[3]).toBeCloseTo(1993.065, 12);
  });

  it('treats NaN and the POWER fill value -999 as missing and trims leading empty years', () => {
    const pts = monthly(2000, 2003, (y, m) => (y === 2000 ? (m < 5 ? 1 : -999) : y === 2001 && m === 7 ? NaN : 5));
    const a = annualMeans(pts);
    expect(a.years).toEqual([2001, 2002, 2003]);
    expect(a.values).toEqual([5, 5, 5]);
    expect(a.counts[0]).toBe(11);
  });

  it('sums monthly totals and scales a year with gaps', () => {
    const pts = monthly(2010, 2011, (y, m) => (y === 2010 && m === 1 ? null : 10));
    const a = annualMeans(pts, 10, 'sum');
    expect(a.values).toEqual([120, 120]);
  });

  it('accepts unsorted points and keeps the last duplicate', () => {
    const pts = monthly(2001, 2004, () => 1).reverse();
    pts.push({ year: 2002, month: 6, value: 13 });
    const a = annualMeans(pts);
    expect(a.years).toEqual([2001, 2002, 2003, 2004]);
    expect(a.values[1]).toBeCloseTo(2, 12);
  });

  it('drops a final year with no December even when 10 months are present', () => {
    const pts = monthly(2001, 2005, (y, m) => (y === 2005 && m > 10 ? null : 1));
    expect(annualMeans(pts).years).toEqual([2001, 2002, 2003, 2004]);
  });
});

describe('series helpers', () => {
  it('deseasonalize gives zero-mean anomalies for each calendar month', () => {
    const pts = monthly(2001, 2010, (y, m) => 10 * Math.sin(m) + 0.1 * (y - 2001));
    const anom = deseasonalize(pts);
    for (let m = 1; m <= 12; m++) {
      const vals = anom.filter((p) => p.month === m).map((p) => p.value as number);
      expect(Math.abs(vals.reduce((s, v) => s + v, 0))).toBeLessThan(1e-9);
    }
  });

  it('residuals and lag-1 autocorrelation', () => {
    expect(residuals([0, 1, 2], [1, null, 5], 2, 1)).toEqual([0, null, 0]);
    expect(lag1Autocorr([1, 1, 1, 1])).toBe(0);
    expect(lag1Autocorr([1, 2])).toBeNaN();
    // Alternating series is strongly negatively autocorrelated.
    expect(lag1Autocorr([1, -1, 1, -1, 1, -1, 1, -1])).toBeLessThan(-0.8);
  });
});

describe('robustness', () => {
  it('returns a typed insufficient-data result for n < 4', () => {
    const a = analyzeAnnual([2000, 2001, 2002], [1, 2, 3]);
    expect(a.ok).toBe(false);
    if (!a.ok) {
      expect(a.reason).toBe('insufficient-data');
      expect(a.n).toBe(3);
      expect(a.minimum).toBe(4);
    }
    expect(analyzeAnnual([2000, 2001, 2002, 2003, 2004], [1, null, NaN, 3, -999]).ok).toBe(false);
    expect(seasonalMK(monthly(2001, 2003, () => 1)).ok).toBe(false);
  });

  it('never throws on bad input', () => {
    const junk = undefined as unknown as number[];
    expect(analyzeAnnual(junk, junk).ok).toBe(false);
    expect(analyzeAnnual([1, 2], [1]).ok).toBe(false);
    expect(() => analyzeMonthly([])).not.toThrow();
    expect(() => analyzeMonthly(null as unknown as MonthlyPoint[])).not.toThrow();
    expect(() => monthlyTrends([{ year: 2000, month: 13, value: 1 }])).not.toThrow();
    const mk = mannKendall([]);
    expect(mk.p).toBe(1);
    expect(mk.S).toBe(0);
    expect(Number.isNaN(sensSlope([1]).slope)).toBe(true);
    expect(Number.isNaN(ols([1, 2], [3, 4]).p)).toBe(true);
  });

  it('keeps the time axis when years are missing', () => {
    const years = [2000, 2001, 2003, 2004, 2006, 2007];
    const vals = [1.0, 1.3, 1.1, 1.9, 2.2, 2.0];
    const dense: (number | null)[] = [1.0, 1.3, null, 1.1, 1.9, null, 2.2, 2.0];
    const a = analyzeAnnual(years, vals) as AnnualAnalysis;
    expect(a.ok).toBe(true);
    expect(a.slopePerYear).toBe(sensSlope(dense).slope);
    expect(a.missing).toBe(2);
    // Unsorted input gives the same answer.
    const b = analyzeAnnual([...years].reverse(), [...vals].reverse()) as AnnualAnalysis;
    expect(b.slopePerYear).toBe(a.slopePerYear);
    expect(b.p).toBe(a.p);
  });

  it('falls back to the uncorrected variance when the pymk Yue-Wang factor is not positive', () => {
    const x = Array.from({ length: 20 }, (_, i) => (i % 2 === 0 ? 1 : -1) + 0.01 * i);
    const r = yueWang(x, { yueWangVariant: 'pymk' });
    expect(r.r1).toBeLessThan(-0.5);
    expect(r.correctionApplied).toBe(false);
    expect(r.p).toBe(mannKendall(x).p);
  });

  it('labels confidence by p', () => {
    expect(confidenceFromP(0.0005)).toBe('very strong');
    expect(confidenceFromP(0.005)).toBe('strong');
    expect(confidenceFromP(0.03)).toBe('moderate');
    expect(confidenceFromP(0.07)).toBe('weak');
    expect(confidenceFromP(0.5)).toBe('none');
    expect(confidenceFromP(NaN)).toBe('none');
  });

  it('reports a clear increasing trend', () => {
    const e = noise(45, 11);
    const years = e.map((_, i) => 1981 + i);
    const x = e.map((v, i) => 15 + 0.03 * i + 0.2 * v);
    const a = analyzeAnnual(years, x) as AnnualAnalysis;
    expect(a.trend).toBe('increasing');
    expect(a.significant).toBe(true);
    expect(a.slopePerDecade).toBeGreaterThan(0.25);
    expect(a.slopePerDecade).toBeLessThan(0.35);
    expect(a.ciPerDecade[0]).toBeLessThan(a.slopePerDecade);
    expect(a.ciPerDecade[1]).toBeGreaterThan(a.slopePerDecade);
    expect(a.detection.withinRecord).toBe(true);
    expect(a.ols.slopePerDecade).toBeGreaterThan(0.25);
  });
});
