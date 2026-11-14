/**
 * Normal and Student-t distributions, with no dependencies.
 *
 * - `erf` / `erfc`: Maclaurin-type series erf(x) = (2/sqrt(pi)) e^(-x^2) sum_k 2^k x^(2k+1) / (2k+1)!!
 *   (all terms positive, so no cancellation) for |x| < 2, and the Laplace continued fraction for
 *   erfc evaluated with the modified Lentz algorithm for x >= 2 (Abramowitz & Stegun 1964, 7.1.6 and
 *   7.1.14; Press et al. 2007, Numerical Recipes 3rd ed., section 5.2). Relative accuracy is about
 *   1e-15, also deep in the tail, so tiny p-values keep their digits.
 * - `normalQuantile`: Abramowitz & Stegun 26.2.23 starting value polished with Halley steps on the
 *   accurate CDF (full double precision).
 * - Student-t CDF through the regularized incomplete beta function, I_x(a, b) by its continued
 *   fraction (Numerical Recipes 6.4), with the Lanczos (1964) log-gamma.
 */

const SQRT2 = Math.SQRT2;
const SQRT_PI = Math.sqrt(Math.PI);
const SQRT_2PI = Math.sqrt(2 * Math.PI);
const TINY = 1e-300;
const EPS = 1e-16;

/** erf(x) by its positive-term series; good for |x| < ~3. */
function erfSeries(x: number): number {
  const x2 = x * x;
  let term = x;
  let sum = x;
  for (let k = 1; k < 200; k++) {
    term *= (2 * x2) / (2 * k + 1);
    sum += term;
    if (term < EPS * sum) break;
  }
  return ((2 / SQRT_PI) * Math.exp(-x2)) * sum;
}

/** erfc(x) for x >= ~2 by the continued fraction e^(-x^2)/sqrt(pi) / (x + (1/2)/(x + 1/(x + (3/2)/(x + ...)))). */
function erfcContinuedFraction(x: number): number {
  // Modified Lentz for b0 + a1/(b1 + a2/(b2 + ...)) with b_k = x, a_k = k/2.
  let f = x;
  let c = x;
  let d = 0;
  for (let k = 1; k < 5000; k++) {
    const a = k / 2;
    d = x + a * d;
    if (Math.abs(d) < TINY) d = TINY;
    c = x + a / c;
    if (Math.abs(c) < TINY) c = TINY;
    d = 1 / d;
    const delta = c * d;
    f *= delta;
    if (Math.abs(delta - 1) < EPS) break;
  }
  return Math.exp(-x * x) / SQRT_PI / f;
}

/** Complementary error function erfc(x) = 1 - erf(x), accurate in relative terms for large x. */
export function erfc(x: number): number {
  if (Number.isNaN(x)) return NaN;
  if (x < 0) return 2 - erfc(-x);
  if (x === Infinity) return 0;
  if (x < 2) return 1 - erfSeries(x);
  if (x > 27.3) return 0; // underflows double precision
  return erfcContinuedFraction(x);
}

/** Error function erf(x). */
export function erf(x: number): number {
  if (Number.isNaN(x)) return NaN;
  if (x < 0) return -erf(-x);
  if (x < 2) return erfSeries(x);
  return 1 - erfc(x);
}

/** Standard normal density. */
export function normalPdf(x: number): number {
  return Math.exp(-0.5 * x * x) / SQRT_2PI;
}

/** Standard normal CDF, Phi(x). */
export function normalCdf(x: number): number {
  return 0.5 * erfc(-x / SQRT2);
}

/** Standard normal upper tail, 1 - Phi(x), without cancellation for large x. */
export function normalSf(x: number): number {
  return 0.5 * erfc(x / SQRT2);
}

/** Two-sided normal p-value 2 * (1 - Phi(|z|)). NaN in, NaN out. */
export function twoSidedNormalP(z: number): number {
  if (Number.isNaN(z)) return NaN;
  return Math.min(1, erfc(Math.abs(z) / SQRT2));
}

/**
 * Inverse of the standard normal CDF (the quantile, `scipy.stats.norm.ppf`).
 * Returns -Infinity for p = 0, Infinity for p = 1 and NaN outside [0, 1].
 */
export function normalQuantile(p: number): number {
  if (Number.isNaN(p) || p < 0 || p > 1) return NaN;
  if (p === 0) return -Infinity;
  if (p === 1) return Infinity;
  if (p === 0.5) return 0;
  // Work in the lower tail, q <= 0.5, where the CDF has full relative precision.
  const q = p < 0.5 ? p : 1 - p;
  const t = Math.sqrt(-2 * Math.log(q));
  // Abramowitz & Stegun 26.2.23 (|error| < 4.5e-4).
  let x =
    -(t - (2.515517 + 0.802853 * t + 0.010328 * t * t) /
      (1 + 1.432788 * t + 0.189269 * t * t + 0.001308 * t * t * t));
  // Halley's method on f(x) = Phi(x) - q converges cubically.
  for (let i = 0; i < 6; i++) {
    const e = normalCdf(x) - q;
    const u = e * SQRT_2PI * Math.exp(0.5 * x * x);
    const step = u / (1 + 0.5 * x * u);
    if (!Number.isFinite(step)) break;
    x -= step;
    if (Math.abs(step) <= 1e-17 * Math.max(1, Math.abs(x))) break;
  }
  return p < 0.5 ? x : -x;
}

const LANCZOS_G = 7;
const LANCZOS = [
  0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
  -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6,
  1.5056327351493116e-7,
];

/** Natural log of the gamma function for x > 0 (Lanczos approximation, g = 7, 9 terms). */
export function lnGamma(x: number): number {
  if (Number.isNaN(x)) return NaN;
  if (x <= 0 && Number.isInteger(x)) return Infinity;
  if (x < 0.5) {
    // Reflection: Gamma(x) Gamma(1 - x) = pi / sin(pi x)
    return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * x))) - lnGamma(1 - x);
  }
  const z = x - 1;
  let a = LANCZOS[0];
  const tt = z + LANCZOS_G + 0.5;
  for (let i = 1; i < LANCZOS.length; i++) a += LANCZOS[i] / (z + i);
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(tt) - tt + Math.log(a);
}

/** Continued fraction for the incomplete beta function (Numerical Recipes `betacf`, modified Lentz). */
function betaContinuedFraction(a: number, b: number, x: number): number {
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < TINY) d = TINY;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= 10000; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < TINY) d = TINY;
    c = 1 + aa / c;
    if (Math.abs(c) < TINY) c = TINY;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < TINY) d = TINY;
    c = 1 + aa / c;
    if (Math.abs(c) < TINY) c = TINY;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return h;
}

/**
 * Regularized incomplete beta function I_x(a, b) for a, b > 0 and 0 <= x <= 1.
 * `y` may be passed as 1 - x computed without cancellation (it is used for the symmetric branch).
 */
export function regularizedBeta(x: number, a: number, b: number, y: number = 1 - x): number {
  if (Number.isNaN(x) || Number.isNaN(a) || Number.isNaN(b) || !(a > 0) || !(b > 0)) return NaN;
  if (x <= 0) return 0;
  if (x >= 1 || y <= 0) return 1;
  const lnFront = lnGamma(a + b) - lnGamma(a) - lnGamma(b) + a * Math.log(x) + b * Math.log(y);
  const front = Math.exp(lnFront);
  if (x < (a + 1) / (a + b + 2)) return (front * betaContinuedFraction(a, b, x)) / a;
  return 1 - (front * betaContinuedFraction(b, a, y)) / b;
}

/** Upper tail P(T > |t|) of Student's t with `df` degrees of freedom (one tail, for |t|). */
function studentTailAbs(t: number, df: number): number {
  const t2 = t * t;
  const x = df / (df + t2);
  const y = t2 / (df + t2);
  return 0.5 * regularizedBeta(x, df / 2, 0.5, y);
}

/** Student-t CDF P(T <= t). `df` may be fractional; df = Infinity gives the normal CDF. */
export function studentTCdf(t: number, df: number): number {
  if (Number.isNaN(t) || Number.isNaN(df) || !(df > 0)) return NaN;
  if (df === Infinity) return normalCdf(t);
  if (t === Infinity) return 1;
  if (t === -Infinity) return 0;
  const tail = studentTailAbs(t, df);
  return t > 0 ? 1 - tail : tail;
}

/** Two-sided Student-t p-value 2 * P(T > |t|). */
export function twoSidedStudentP(t: number, df: number): number {
  if (Number.isNaN(t) || Number.isNaN(df) || !(df > 0)) return NaN;
  if (df === Infinity) return twoSidedNormalP(t);
  if (!Number.isFinite(t)) return 0;
  return Math.min(1, 2 * studentTailAbs(t, df));
}

/** Student-t density. */
export function studentTPdf(t: number, df: number): number {
  if (!(df > 0)) return NaN;
  if (df === Infinity) return normalPdf(t);
  const lnc = lnGamma((df + 1) / 2) - lnGamma(df / 2) - 0.5 * Math.log(df * Math.PI);
  return Math.exp(lnc - ((df + 1) / 2) * Math.log1p((t * t) / df));
}

/**
 * Student-t quantile (inverse CDF, `scipy.stats.t.ppf`). Newton's method on the CDF, safeguarded by
 * bisection, from a Cornish-Fisher starting value.
 */
export function studentTQuantile(p: number, df: number): number {
  if (Number.isNaN(p) || Number.isNaN(df) || !(df > 0) || p < 0 || p > 1) return NaN;
  if (p === 0) return -Infinity;
  if (p === 1) return Infinity;
  if (p === 0.5) return 0;
  if (df === Infinity) return normalQuantile(p);
  if (p < 0.5) return -studentTQuantile(1 - p, df);
  if (df === 1) return Math.tan(Math.PI * (p - 0.5));
  // Upper tail target: P(T > t) = 1 - p, solved on the tail for precision.
  const target = 1 - p;
  const z = normalQuantile(p);
  const z3 = z * z * z;
  let t = z + (z3 + z) / (4 * df) + (5 * z3 * z * z + 16 * z3 + 3 * z) / (96 * df * df);
  if (!(t > 0) || !Number.isFinite(t)) t = z > 0 ? z : 1;
  // Bracket the root.
  let lo = 0;
  let hi = t;
  while (studentTailAbs(hi, df) > target) {
    lo = hi;
    hi *= 2;
    if (hi > 1e300) return Infinity;
  }
  t = Math.min(Math.max(t, lo), hi);
  for (let i = 0; i < 200; i++) {
    const f = target - studentTailAbs(t, df); // increasing in t
    if (f === 0) return t;
    if (f < 0) lo = t;
    else hi = t;
    const pdf = studentTPdf(t, df);
    let next = t - f / pdf;
    if (!(next > lo && next < hi) || !Number.isFinite(next)) next = 0.5 * (lo + hi);
    if (Math.abs(next - t) <= 1e-15 * Math.abs(next)) return next;
    t = next;
  }
  return t;
}
