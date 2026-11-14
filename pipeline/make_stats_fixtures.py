"""Generate reference values for the TypeScript statistics library (web/src/lib/stats).

The expected outputs come from pymannkendall (original_test, yue_wang_modification_test with lag=1,
hamed_rao_modification_test, sens_slope, seasonal_test with period=12) and from scipy.stats for the
normal and Student-t distributions. OLS, the Gilbert (1987) confidence interval of Sen's slope,
the Pettitt test, the Weatherhead et al. (1998) detection time and the annual aggregation rule are
computed here with plain numpy, written independently of the TypeScript code.

Two places where the reference deliberately differs from calling pymannkendall as-is:

* Series with gaps (NaN): pymannkendall detrends the gap-free series with 1..n, which shifts every
  value after a gap in time. The TypeScript library detrends with each value's true time. For
  gapped series the corrected-test references below use pymannkendall's own formulas with true-time
  detrending (`*_ref` functions). For gap-free series those functions are asserted to reproduce
  pymannkendall exactly, so they are the same code path.
* A variance factor n/n* <= 0 (strong negative autocorrelation) makes pymannkendall return NaN.
  The TypeScript library then falls back to the uncorrected variance; the reference does the same
  and marks the case with "factor_invalid": true.

The TrendScope default Yue-Wang variant is "conservative" (`yue_wang_factor_conservative` below,
mirrored by `yueWangFactorConservative` in mannKendall.ts): the full AR(1) factor, applied only for
significant positive r1 and never below 1. pymannkendall's lag=1 form also shrinks Var(S) when r1 is
negative, which turns white noise into "significant" trends. The pymannkendall and build-spec
("gated") forms stay in the fixtures as options.

Run from the repository root:
    .venv/Scripts/python.exe -I pipeline/make_stats_fixtures.py
"""

from __future__ import annotations

import json
import math
import warnings
from pathlib import Path

import numpy as np
import pymannkendall as mk
import scipy
from scipy import special, stats

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "web" / "src" / "lib" / "stats" / "__fixtures__" / "pymk.json"
FIRST_YEAR = 1981
Z975 = float(stats.norm.ppf(0.975))

warnings.filterwarnings("ignore", category=RuntimeWarning)


# ----------------------------------------------------------------------------------------------
# Helpers


def num(v):
    """JSON-safe float: NaN and infinities become None."""
    if v is None:
        return None
    v = float(v)
    return v if math.isfinite(v) else None


def series_list(x):
    return [num(v) for v in x]


def acf(x, nlags):
    """pymannkendall's __acf (biased autocovariance normalised by lag 0)."""
    y = x - x.mean()
    n = len(x)
    d = n * np.ones(2 * n - 1)
    acov = (np.correlate(y, y, "full") / d)[n - 1 :]
    return acov[: nlags + 1] / acov[0]


def z_score(s, var_s):
    if s > 0:
        return (s - 1) / np.sqrt(var_s)
    if s < 0:
        return (s + 1) / np.sqrt(var_s)
    return 0.0


def p_two_sided(z):
    return 2 * (1 - stats.norm.cdf(abs(z)))


def valid_parts(x_old):
    x_old = np.asarray(x_old, dtype=float)
    t_all = np.arange(len(x_old), dtype=float)
    ok = ~np.isnan(x_old)
    return x_old[ok], t_all[ok]


def mk_dict(r):
    return {
        "trend": r.trend,
        "h": bool(r.h),
        "p": num(r.p),
        "z": num(r.z),
        "tau": num(r.Tau),
        "s": num(r.s),
        "var_s": num(r.var_s),
        "slope": num(r.slope),
        "intercept": num(r.intercept),
    }


# ----------------------------------------------------------------------------------------------
# Corrected tests: pymannkendall's formulas, with true-time detrending


def yue_wang_ref(x_old):
    """yue_wang_modification_test(x, lag=1) with the detrend x_k - (t_k + 1) * slope."""
    orig = mk.original_test(x_old)
    x, t = valid_parts(x_old)
    n = len(x)
    slope = mk.sens_slope(x_old).slope
    detrended = x - (t + 1) * slope
    r1 = float(acf(detrended, 1)[1])
    factor = 1 + 2 * (1 - 1 / n) * r1
    invalid = not (math.isfinite(factor) and factor > 0)
    var_s = orig.var_s * (1.0 if invalid else factor)
    z = z_score(orig.s, var_s)
    p = p_two_sided(z)
    return {
        "p": num(p),
        "z": num(z),
        "var_s": num(var_s),
        "r1": num(r1),
        "n_star": num(factor),
        "factor_invalid": invalid,
        "s": num(orig.s),
        "tau": num(orig.Tau),
    }


def hamed_rao_ref(x_old, alpha=0.05):
    """hamed_rao_modification_test(x) (all lags) with the detrend x_k - (t_k + 1) * slope."""
    orig = mk.original_test(x_old)
    x, t = valid_parts(x_old)
    n = len(x)
    slope = mk.sens_slope(x_old).slope
    detrended = x - (t + 1) * slope
    ranks = stats.rankdata(detrended)
    r = acf(ranks, nlags=n - 1)
    bound = stats.norm.ppf(1 - alpha / 2) / np.sqrt(n)
    sni = 0.0
    for i in range(1, n):
        if not (-bound <= r[i] <= bound):
            sni += (n - i) * (n - i - 1) * (n - i - 2) * r[i]
    factor = 1 + (2 / (n * (n - 1) * (n - 2))) * sni
    invalid = not (math.isfinite(factor) and factor > 0)
    var_s = orig.var_s * (1.0 if invalid else factor)
    z = z_score(orig.s, var_s)
    return {
        "p": num(p_two_sided(z)),
        "z": num(z),
        "var_s": num(var_s),
        "n_star": num(factor),
        "factor_invalid": invalid,
    }


def yue_wang_gated_ref(x_old):
    """Build-spec text form: n/n* = 1 + 2 sum_k (1 - k/n) r1^k, only when |r1| > 1.96 / sqrt(n)."""
    orig = mk.original_test(x_old)
    x, t = valid_parts(x_old)
    n = len(x)
    slope = mk.sens_slope(x_old).slope
    r1 = float(acf(x - (t + 1) * slope, 1)[1])
    if abs(r1) > 1.96 / math.sqrt(n):
        k = np.arange(1, n, dtype=float)
        factor = float(1 + 2 * np.sum((1 - k / n) * r1**k))
    else:
        factor = 1.0
    invalid = not (math.isfinite(factor) and factor > 0)
    var_s = orig.var_s * (1.0 if invalid else factor)
    z = z_score(orig.s, var_s)
    return {
        "p": num(p_two_sided(z)),
        "z": num(z),
        "var_s": num(var_s),
        "n_star": num(factor),
        "factor_invalid": invalid,
    }


def yue_wang_factor_conservative(r1, n):
    """TrendScope default factor; the pipeline should copy this function as is."""
    if not (n >= 3 and r1 > 0 and r1 > 1.96 / math.sqrt(n)):
        return 1.0
    total = 0.0
    rk = 1.0
    for k in range(1, n):
        rk *= r1
        total += (1 - k / n) * rk
    factor = 1 + 2 * total
    return max(1.0, factor) if math.isfinite(factor) else 1.0


def yue_wang_conservative_ref(x_old):
    """Var(S) * yue_wang_factor_conservative(r1, n), r1 of the Sen-detrended series (true time)."""
    orig = mk.original_test(x_old)
    x, t = valid_parts(x_old)
    n = len(x)
    slope = mk.sens_slope(x_old).slope
    r1 = float(acf(x - (t + 1) * slope, 1)[1])
    factor = yue_wang_factor_conservative(r1, n)
    var_s = orig.var_s * factor
    z = z_score(orig.s, var_s)
    return {
        "p": num(p_two_sided(z)),
        "z": num(z),
        "var_s": num(var_s),
        "n_star": num(factor),
        "r1": num(r1),
        "factor_invalid": False,
    }


def same(a, b, rel=1e-12):
    if a is None or b is None:
        return a is None and b is None
    return abs(a - b) <= rel * max(1.0, abs(a), abs(b))


# ----------------------------------------------------------------------------------------------
# Independent references


def ols_ref(x_old):
    y, t = valid_parts(x_old)
    n = len(y)
    tm, ym = t.mean(), y.mean()
    sxx = float(((t - tm) ** 2).sum())
    sxy = float(((t - tm) * (y - ym)).sum())
    sst = float(((y - ym) ** 2).sum())
    slope = sxy / sxx
    intercept = ym - slope * tm
    sse = float(((y - (intercept + slope * t)) ** 2).sum())
    df = n - 2
    s = math.sqrt(sse / df)
    se = s / math.sqrt(sxx)
    if se > 0:
        tstat = slope / se
        p = float(2 * stats.t.sf(abs(tstat), df))
    else:
        tstat = 0.0 if slope == 0 else math.copysign(math.inf, slope)
        p = 1.0 if slope == 0 else 0.0
    tc = float(stats.t.ppf(0.975, df))
    r2 = 1 - sse / sst if sst > 0 else 0.0
    if sst > 0 and n > 2:
        lr = stats.linregress(t, y)
        assert same(lr.slope, slope, 1e-9) and same(lr.intercept, intercept, 1e-9)
        assert same(lr.rvalue**2, r2, 1e-9) and same(lr.stderr, se, 1e-7)
    return {
        "slope": num(slope),
        "intercept": num(intercept),
        "se": num(se),
        "t": num(tstat),
        "df": df,
        "p": num(p),
        "ci": [num(slope - tc * se), num(slope + tc * se)],
        "r2": num(r2),
    }


def sorted_slopes(x_old):
    x, t = valid_parts(x_old)
    out = []
    for i in range(len(x) - 1):
        out.extend((x[i + 1 :] - x[i]) / (t[i + 1 :] - t[i]))
    return np.sort(np.asarray(out, dtype=float))


def gilbert_ref(x_old, var_s, alpha=0.05):
    s = sorted_slopes(x_old)
    n_prime = len(s)
    z = stats.norm.ppf(1 - alpha / 2)
    c = z * math.sqrt(var_s) if var_s is not None and math.isfinite(var_s) and var_s > 0 else 0.0
    m1 = (n_prime - c) / 2
    m2 = (n_prime + c) / 2
    pos = np.arange(n_prime, dtype=float)
    return [num(np.interp(m1 - 1, pos, s)), num(np.interp(m2, pos, s))]


def pettitt_ref(x_old):
    x, t = valid_parts(x_old)
    n = len(x)
    r = stats.rankdata(x)
    u = 2 * np.cumsum(r[:-1]) - np.arange(1, n) * (n + 1)
    k = int(np.argmax(np.abs(u)))
    k_stat = float(abs(u[k]))
    p = min(1.0, 2 * math.exp(-6 * k_stat**2 / (n**3 + n**2)))
    index = k + 1
    return {
        "index": index,
        "U": k_stat,
        "p": p,
        "time": float(t[index]),
        "mean_before": float(x[:index].mean()),
        "mean_after": float(x[index:].mean()),
    }


def detection_ref(x_old, slope, intercept):
    x, t = valid_parts(x_old)
    res = x - (intercept + slope * t)
    sigma = float(np.std(res, ddof=1))
    phi = float(acf(res, 1)[1])
    phi_c = min(0.99, max(-0.99, phi))
    if slope == 0:
        years = math.inf
    else:
        years = ((3.3 * sigma / abs(slope)) * math.sqrt((1 + phi_c) / (1 - phi_c))) ** (2 / 3)
    first_year = FIRST_YEAR + int(t[0])
    year = first_year + max(1, math.ceil(years)) - 1 if math.isfinite(years) else None
    return {"years": num(years), "year": year, "sigma": num(sigma), "phi": num(phi)}


# ----------------------------------------------------------------------------------------------
# Annual (1-D) cases


def annual_case(name, x, note=""):
    x = np.asarray(x, dtype=float)
    gapped = bool(np.isnan(x).any())
    orig = mk.original_test(x)
    sen = mk.sens_slope(x)
    yw_pkg = mk.yue_wang_modification_test(x, lag=1)
    hr_pkg = mk.hamed_rao_modification_test(x)
    yw = yue_wang_ref(x)
    hr = hamed_rao_ref(x)
    if not gapped:
        # The reference must be pymannkendall itself when there are no gaps.
        for ref, pkg in ((yw, yw_pkg), (hr, hr_pkg)):
            if not ref["factor_invalid"]:
                assert same(ref["p"], num(pkg.p)), (name, ref["p"], pkg.p)
                assert same(ref["var_s"], num(pkg.var_s)), (name, ref["var_s"], pkg.var_s)
    var_for_ci = yw["var_s"]
    case = {
        "name": name,
        "note": note,
        "gapped": gapped,
        "x": series_list(x),
        "original": mk_dict(orig),
        "sens": {"slope": num(sen.slope), "intercept": num(sen.intercept)},
        "yue_wang": yw,
        "yue_wang_pymk": mk_dict(yw_pkg),
        "yue_wang_gated": yue_wang_gated_ref(x),
        "yue_wang_conservative": yue_wang_conservative_ref(x),
        "hamed_rao": hr,
        "hamed_rao_pymk": mk_dict(hr_pkg),
        "gilbert_ci": {
            "original": gilbert_ref(x, num(orig.var_s)),
            "yue_wang": gilbert_ref(x, var_for_ci),
            "yue_wang_conservative": gilbert_ref(x, yue_wang_conservative_ref(x)["var_s"]),
        },
    }
    n = int((~np.isnan(x)).sum())
    if n >= 3:
        case["ols"] = ols_ref(x)
        case["pettitt"] = pettitt_ref(x)
        case["detection"] = detection_ref(x, float(sen.slope), float(sen.intercept))
    return case


def ar1(rng, n, phi, sigma=1.0):
    e = rng.normal(0, sigma, n + 50)
    out = np.zeros(n + 50)
    for i in range(1, n + 50):
        out[i] = phi * out[i - 1] + e[i]
    return out[50:]


def build_annual(rng):
    cases = []
    t = lambda n: np.arange(n, dtype=float)  # noqa: E731

    cases.append(annual_case("noise_n30_a", 10 + rng.normal(0, 1, 30)))
    cases.append(annual_case("noise_n30_b", rng.normal(0, 2, 30)))
    cases.append(annual_case("noise_n45", 25 + rng.normal(0, 0.5, 45)))
    cases.append(annual_case("trend_up_n45", 14 + 0.03 * t(45) + rng.normal(0, 0.4, 45)))
    cases.append(annual_case("trend_down_n45", 2.5 - 0.01 * t(45) + rng.normal(0, 0.15, 45)))
    cases.append(annual_case("trend_weak_n30", 0.01 * t(30) + rng.normal(0, 1, 30)))
    cases.append(annual_case("trend_strong_n20", 0.5 * t(20) + rng.normal(0, 1, 20)))
    cases.append(
        annual_case("ties_round1_n40", np.round(20 + 0.02 * t(40) + rng.normal(0, 0.3, 40), 1))
    )
    cases.append(
        annual_case("ties_round0_n30", np.round(5 + 0.05 * t(30) + rng.normal(0, 1.5, 30)))
    )
    cases.append(
        annual_case("ties_small_integers_n25", rng.integers(0, 4, 25).astype(float) + (t(25) > 12))
    )
    cases.append(annual_case("ties_heavy_n35", rng.choice([1.0, 1.5, 2.0], 35)))
    cases.append(annual_case("ar1_phi05_trend_n45", 0.02 * t(45) + ar1(rng, 45, 0.5)))
    cases.append(annual_case("ar1_phi08_n45", ar1(rng, 45, 0.8)))
    cases.append(annual_case("ar1_phi08_trend_n60", 0.05 * t(60) + ar1(rng, 60, 0.8)))
    cases.append(annual_case("ar1_phi03_n30", ar1(rng, 30, 0.3, 0.7)))
    cases.append(annual_case("ar1_neg04_n40", 0.01 * t(40) + ar1(rng, 40, -0.4)))
    alternating = (
        np.array([(-1.0) ** k for k in range(20)]) + rng.normal(0, 0.05, 20) + 0.01 * t(20)
    )
    cases.append(
        annual_case("alternating_n20", alternating, "factor <= 0: uncorrected variance is used")
    )
    cases.append(annual_case("short_n8_a", 1 + 0.2 * t(8) + rng.normal(0, 0.3, 8)))
    cases.append(annual_case("short_n8_b", rng.normal(0, 1, 8)))
    cases.append(annual_case("short_n8_ties", np.array([3.0, 4.0, 4.0, 5.0, 4.0, 6.0, 6.0, 7.0])))
    cases.append(annual_case("n4", np.array([1.2, 0.7, 1.9, 2.4])))
    cases.append(annual_case("n5", np.array([10.0, 12.5, 11.0, 13.25, 14.0])))
    cases.append(annual_case("n6", rng.normal(0, 1, 6)))
    cases.append(annual_case("long_n60_noise", rng.normal(5, 1, 60)))
    cases.append(annual_case("long_n60_trend", 288 + 0.04 * t(60) + rng.normal(0, 0.6, 60)))
    cases.append(annual_case("long_n60_ar1", 0.015 * t(60) + ar1(rng, 60, 0.6, 0.5)))
    cases.append(
        annual_case(
            "flat_n30",
            np.full(30, 3.0),
            "pymannkendall reports var_s = NaN for the corrected tests",
        )
    )
    step = np.r_[np.zeros(20), np.ones(20)] + rng.normal(0, 0.2, 40)
    cases.append(annual_case("step_n40", step))
    cases.append(annual_case("monotone_n25", np.cumsum(rng.uniform(0.1, 1.0, 25))))
    g = 0.03 * t(40) + rng.normal(0, 0.5, 40)
    g[[5, 6, 17, 30]] = np.nan
    cases.append(annual_case("gap_inner_n40", g))
    g = 1 + 0.02 * t(35) + ar1(rng, 35, 0.5, 0.3)
    g[:3] = np.nan
    cases.append(annual_case("gap_leading_n35", g))
    g = 7 - 0.05 * t(35) + rng.normal(0, 0.8, 35)
    g[-2:] = np.nan
    cases.append(annual_case("gap_trailing_n35", g))
    g = np.round(12 + 0.03 * t(45) + rng.normal(0, 0.5, 45), 1)
    g[[0, 9, 10, 11, 25, 44]] = np.nan
    cases.append(annual_case("gap_mixed_ties_n45", g))
    cases.append(annual_case("cdd_scale_n45", 3000 + 15 * t(45) + rng.normal(0, 120, 45)))
    cases.append(annual_case("aod_scale_n25", 0.15 - 0.001 * t(25) + rng.normal(0, 0.01, 25)))
    cases.append(annual_case("ozone_ties_n45", np.round(280 + rng.normal(0, 3, 45))))
    ice = np.clip(rng.normal(0.05, 0.1, 45) - 0.002 * t(45), 0, None)
    cases.append(annual_case("seaice_zeros_n45", ice))
    cases.append(annual_case("quadratic_n45", 0.002 * (t(45) - 22) ** 2 + rng.normal(0, 0.2, 45)))
    o = rng.normal(0, 1, 30) + 0.03 * t(30)
    o[12] = 40.0
    cases.append(annual_case("outlier_n30", o))
    cases.append(annual_case("negative_values_n30", -5 - 0.04 * t(30) + rng.normal(0, 0.5, 30)))
    cases.append(annual_case("long_n100", 0.01 * t(100) + ar1(rng, 100, 0.4)))
    cases.append(annual_case("red_noise_phi06_n45", 0.01 * t(45) + ar1(rng, 45, 0.6)))
    return cases


# ----------------------------------------------------------------------------------------------
# Monthly cases


def annual_from_monthly_ref(points, min_months=10, stat="mean"):
    """Annual values by the build-spec rule (see annualMeans in series.ts)."""
    years = sorted({p[0] for p in points})
    y0, y1 = years[0], years[-1]
    sums = {y: 0.0 for y in range(y0, y1 + 1)}
    counts = {y: 0 for y in range(y0, y1 + 1)}
    has_dec = {y: False for y in range(y0, y1 + 1)}
    for y, m, v in points:
        if v is None:
            continue
        sums[y] += v
        counts[y] += 1
        if m == 12:
            has_dec[y] = True
    ys = list(range(y0, y1 + 1))
    vals = []
    for y in ys:
        if counts[y] < min_months:
            vals.append(None)
        elif stat == "sum":
            vals.append(sums[y] if counts[y] == 12 else sums[y] / counts[y] * 12)
        else:
            vals.append(sums[y] / counts[y])
    if not has_dec[y1]:
        ys, vals = ys[:-1], vals[:-1]
    while vals and vals[0] is None:
        ys, vals = ys[1:], vals[1:]
    while vals and vals[-1] is None:
        ys, vals = ys[:-1], vals[:-1]
    return ys, vals


def monthly_case(name, start, values, stat="mean", note=""):
    """`start` = (year, month) of values[0]; values is the dense monthly vector (NaN = missing)."""
    values = np.asarray(values, dtype=float)
    y0, m0 = start
    points = []
    for k, v in enumerate(values):
        absm = y0 * 12 + (m0 - 1) + k
        points.append([absm // 12, absm % 12 + 1, num(v)])
    sea = mk.seasonal_test(values, period=12)
    ssl = mk.seasonal_sens_slope(values, period=12)
    assert same(num(ssl.slope), num(sea.slope)) and same(num(ssl.intercept), num(sea.intercept))
    first_year = points[0][0]
    last_year = points[-1][0]
    months = []
    for m in range(1, 13):
        vec = np.full(last_year - first_year + 1, np.nan)
        for y, mm, v in points:
            if mm == m and v is not None:
                vec[y - first_year] = v
        n = int((~np.isnan(vec)).sum())
        r = mk.original_test(vec)
        d = mk_dict(r)
        d["month"] = m
        d["n"] = n
        months.append(d)
    ys, vals = annual_from_monthly_ref(points, 10, stat)
    ann = np.array([np.nan if v is None else v for v in vals], dtype=float)
    annual = {
        "years": ys,
        "values": vals,
        "yue_wang": yue_wang_ref(ann),
        "sens": {
            "slope": num(mk.sens_slope(ann).slope),
            "intercept": num(mk.sens_slope(ann).intercept),
        },
        "gilbert_ci": gilbert_ref(ann, yue_wang_ref(ann)["var_s"]),
        "yue_wang_conservative": yue_wang_conservative_ref(ann),
        "gilbert_ci_conservative": gilbert_ref(ann, yue_wang_conservative_ref(ann)["var_s"]),
    }
    return {
        "name": name,
        "note": note,
        "stat": stat,
        "points": points,
        "seasonal": mk_dict(sea),
        "months": months,
        "annual": annual,
    }


def build_monthly(rng):
    cases = []
    k = np.arange(240)
    cyc = 10 * np.sin(2 * np.pi * (k % 12) / 12)
    cases.append(
        monthly_case(
            "monthly_20y_trend", (2001, 1), 15 + cyc + 0.03 * k / 12 + rng.normal(0, 0.8, 240)
        )
    )
    cases.append(
        monthly_case("monthly_20y_noise", (2001, 1), 3 + 0.5 * cyc + rng.normal(0, 1, 240))
    )
    cases.append(
        monthly_case(
            "monthly_20y_ties",
            (2001, 1),
            np.round(5 + 0.4 * cyc + 0.05 * k / 12 + rng.normal(0, 1, 240)),
        )
    )
    g = 2 + 0.2 * cyc - 0.02 * k / 12 + rng.normal(0, 0.5, 240)
    g[rng.random(240) < 0.08] = np.nan
    cases.append(monthly_case("monthly_20y_gaps", (2001, 1), g))
    k2 = np.arange(232)  # April 2001 .. July 2020
    cyc2 = 8 * np.cos(2 * np.pi * ((k2 + 3) % 12) / 12)
    cases.append(
        monthly_case(
            "monthly_start_april_partial_end",
            (2001, 4),
            20 + cyc2 + 0.04 * k2 / 12 + rng.normal(0, 0.7, 232),
            note="starts in April; the final year ends in July and is dropped",
        )
    )
    k3 = np.arange(540)  # 1981 .. 2025
    cyc3 = 12 * np.sin(2 * np.pi * ((k3 % 12) - 3) / 12)
    noise = ar1(rng, 540, 0.3, 0.9)
    cases.append(
        monthly_case("monthly_45y_power_like", (1981, 1), 24 + cyc3 + 0.025 * k3 / 12 + noise)
    )
    k4 = np.arange(480)  # 1981 .. 2020
    cdd = np.clip(
        150
        + 140 * np.sin(2 * np.pi * ((k4 % 12) - 3) / 12)
        + 0.4 * k4 / 12
        + rng.normal(0, 20, 480),
        0,
        None,
    )
    cdd[[5, 100, 101, 102, 250, 251, 252, 253]] = (
        np.nan
    )  # 1981 has 11 months, 1989 has 9, 2001 has 8
    cases.append(
        monthly_case("monthly_sum_cdd", (1981, 1), cdd, stat="sum", note="annual stat = sum")
    )
    return cases


# ----------------------------------------------------------------------------------------------
# Distributions


def build_distributions():
    zs = [
        -37.0,
        -20.0,
        -8.0,
        -5.0,
        -3.0,
        -1.959963984540054,
        -1.0,
        -0.5,
        -1e-9,
        0.0,
        1e-9,
        0.3,
        0.6744897501960817,
        1.0,
        1.5,
        2.0,
        2.5,
        2.8,
        3.0,
        4.0,
        5.0,
        6.0,
        8.0,
        10.0,
        15.0,
        20.0,
        30.0,
        37.0,
    ]
    normal = [{"x": z, "cdf": float(stats.norm.cdf(z)), "sf": float(stats.norm.sf(z))} for z in zs]
    erf = [
        {"x": x, "erf": float(special.erf(x)), "erfc": float(special.erfc(x))}
        for x in [
            -3.0,
            -1.0,
            -0.1,
            0.0,
            1e-6,
            0.2,
            0.5,
            1.0,
            1.4,
            1.9999,
            2.0,
            2.0001,
            2.5,
            3.5,
            5.0,
            10.0,
            26.0,
        ]
    ]
    ps = [
        1e-300,
        1e-100,
        1e-15,
        1e-10,
        1e-6,
        1e-3,
        0.01,
        0.025,
        0.05,
        0.1,
        0.25,
        0.4,
        0.5,
        0.6,
        0.75,
        0.9,
        0.95,
        0.975,
        0.99,
        0.999,
        1 - 1e-6,
        1 - 1e-10,
    ]
    ppf = [{"p": p, "x": float(stats.norm.ppf(p))} for p in ps]
    dfs = [1, 2, 3, 5, 8, 10, 18, 28, 43, 58, 98, 1000]
    ts = [-20.0, -5.0, -2.0, -0.5, 0.0, 0.7, 1.5, 2.0, 2.7, 3.0, 6.0, 20.0, 100.0]
    tcdf = [
        {
            "t": tv,
            "df": df,
            "cdf": float(stats.t.cdf(tv, df)),
            "p2": float(2 * stats.t.sf(abs(tv), df)),
        }
        for df in dfs
        for tv in ts
    ]
    tppf = [
        {"p": p, "df": df, "x": float(stats.t.ppf(p, df))}
        for df in dfs
        for p in [0.005, 0.05, 0.9, 0.975, 0.995]
    ]
    return {"normal": normal, "erf": erf, "normal_ppf": ppf, "t_cdf": tcdf, "t_ppf": tppf}


def main():
    rng = np.random.default_rng(20261114)
    annual = build_annual(rng)
    monthly = build_monthly(rng)
    data = {
        "generator": "pipeline/make_stats_fixtures.py",
        "versions": {
            "pymannkendall": getattr(mk, "__version__", "unknown"),
            "numpy": np.__version__,
            "scipy": scipy.__version__,
        },
        "first_year": FIRST_YEAR,
        "z975": Z975,
        "annual": annual,
        "monthly": monthly,
        "distributions": build_distributions(),
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(
        json.dumps(data, allow_nan=False, separators=(",", ":")) + "\n", encoding="utf-8"
    )
    print(f"wrote {OUT.relative_to(ROOT)}: {len(annual)} annual and {len(monthly)} monthly cases")


if __name__ == "__main__":
    main()
