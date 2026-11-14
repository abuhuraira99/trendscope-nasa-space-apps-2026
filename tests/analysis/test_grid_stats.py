import time

import numpy as np
import pymannkendall as mk
import pymannkendall.pymannkendall as mk_impl
import pytest
from scipy.stats import false_discovery_control, norm

from trendscope.analysis.grid_stats import bh_fdr, grid_trends, n_star_factor, sig_codes

N_YEARS = 45
mk_acf = vars(mk_impl)["__acf"]  # pymannkendall's own autocorrelation estimator


def _random_cells(n_cells: int, n_years: int, seed: int) -> np.ndarray:
    """Trend plus AR(1) noise, with a mix of strengths, autocorrelation and ties."""
    rng = np.random.default_rng(seed)
    t = np.arange(n_years)
    out = np.empty((n_cells, n_years))
    for c in range(n_cells):
        phi = rng.uniform(-0.5, 0.9)
        e = np.empty(n_years)
        e[0] = rng.normal()
        for k in range(1, n_years):
            e[k] = phi * e[k - 1] + rng.normal()
        out[c] = rng.normal(0, 0.05) * t + e * rng.uniform(0.2, 2.0) + rng.normal(0, 10)
        if c % 4 == 0:  # coarse rounding creates tied values
            out[c] = np.round(out[c], 0)
    return out


def _direct(x: np.ndarray) -> dict:
    """Plain, one-series evaluation of the conservative Yue-Wang method."""
    t = np.arange(x.size, dtype=float)
    ok = np.isfinite(x)
    n = int(ok.sum())
    base = mk.original_test(x)  # S and tie-corrected Var(S), skipping missing years
    slope = mk.sens_slope(x).slope
    d = x - slope * t
    y = d - np.nanmean(d)
    both = ok[:-1] & ok[1:]
    den = np.nansum(y**2)
    r1 = np.sum(y[:-1][both] * y[1:][both]) / den if den > 0 else 0.0
    factor = 1.0
    if r1 > 0 and r1 > 1.96 / np.sqrt(n):
        factor = 1.0 + 2.0 * sum((1 - k / n) * r1**k for k in range(1, n))
    var_s = base.var_s * factor
    s = base.s
    z = 0.0 if s == 0 else (s - np.sign(s)) / np.sqrt(var_s)
    return {
        "p": 2 * norm.sf(abs(z)),
        "s": s,
        "var_s": var_s,
        "r1": r1,
        "factor": factor,
        "slope": slope,
        "base_p": base.p,
    }


def _check(x: np.ndarray) -> tuple[int, int]:
    res = grid_trends(x)
    ref = [_direct(row) for row in x]
    p_direct = np.array([r["p"] for r in ref])
    p_plain = np.array([r["base_p"] for r in ref])
    factor = np.array([r["factor"] for r in ref])
    corrected = factor > 1

    np.testing.assert_array_equal(res.corrected, corrected)
    np.testing.assert_allclose(res.n_star, factor, rtol=1e-12)
    np.testing.assert_allclose(res.r1, [r["r1"] for r in ref], rtol=1e-9, atol=1e-12)
    np.testing.assert_allclose(res.s, [r["s"] for r in ref], atol=0)
    np.testing.assert_allclose(res.var_s, [r["var_s"] for r in ref], rtol=1e-9)
    np.testing.assert_allclose(res.slope_per_year, [r["slope"] for r in ref], rtol=1e-9, atol=1e-12)
    # no correction: identical to pymannkendall's plain Mann-Kendall test
    np.testing.assert_allclose(res.p[~corrected], p_plain[~corrected], atol=1e-6, rtol=0)
    # correction applied: identical to the formula evaluated directly
    np.testing.assert_allclose(res.p[corrected], p_direct[corrected], atol=1e-6, rtol=0)
    # the correction never makes a trend look more significant
    assert np.all(res.p >= p_plain - 1e-12)
    return int((~corrected).sum()), int(corrected.sum())


def test_matches_reference_complete_series() -> None:
    plain, corrected = _check(_random_cells(200, N_YEARS, seed=1))
    assert plain > 20 and corrected > 20  # both branches are exercised


def test_matches_reference_with_gaps() -> None:
    x = _random_cells(200, N_YEARS, seed=2)
    rng = np.random.default_rng(3)
    for row in x:
        row[rng.choice(N_YEARS, size=rng.integers(0, 12), replace=False)] = np.nan
    plain, corrected = _check(x)
    assert plain > 20 and corrected > 20


def test_r1_equals_pymannkendall_acf_for_complete_series() -> None:
    x = _random_cells(50, N_YEARS, seed=8) + 0.001 * np.arange(N_YEARS)  # no constant rows
    res = grid_trends(x)
    t = np.arange(N_YEARS)
    for row, r1 in zip(x, res.r1, strict=True):
        detrended = row - mk.sens_slope(row).slope * t
        assert r1 == pytest.approx(mk_acf(detrended, nlags=1)[1], abs=1e-12)


def test_negative_autocorrelation_is_not_corrected() -> None:
    x = np.tile([0.0, 1.0], 23)[:N_YEARS] + 0.01 * np.arange(N_YEARS)
    res = grid_trends(x[None, :])
    assert res.r1[0] < -0.9
    assert res.n_star[0] == 1.0
    assert res.p[0] == pytest.approx(mk.original_test(x).p, abs=1e-6)


def test_n_star_factor_formula() -> None:
    r1, n = 0.4, 30
    expected = 1 + 2 * sum((1 - k / n) * r1**k for k in range(1, n))
    assert n_star_factor(np.array([r1]), np.array([n]))[0] == pytest.approx(expected, rel=1e-12)


def test_short_and_empty_cells_are_nan() -> None:
    x = _random_cells(4, N_YEARS, seed=4)
    x[0, 14:] = np.nan  # 14 valid years: below the minimum
    x[1, 15:] = np.nan  # 15 valid years: allowed
    x[2, :] = np.nan  # empty
    res = grid_trends(x)
    assert np.isnan(res.slope_per_year[0]) and np.isnan(res.p[0]) and np.isnan(res.mean[0])
    assert np.isfinite(res.slope_per_year[1]) and np.isfinite(res.p[1])
    assert np.isnan(res.slope_per_year[2]) and np.isnan(res.p[2])
    assert np.isfinite(res.p[3])
    assert res.n.tolist() == [14, 15, 0, 45]


def test_constant_series() -> None:
    x = np.full((1, N_YEARS), 3.0)
    res = grid_trends(x)
    assert res.slope_per_year[0] == 0
    assert res.s[0] == 0
    assert res.p[0] == 1.0  # S = 0, as in pymannkendall
    assert mk.original_test(x[0]).p == 1.0


def test_strong_trend_is_detected_with_ci() -> None:
    t = np.arange(N_YEARS, dtype=float)
    x = (0.03 * t + np.random.default_rng(5).normal(0, 0.1, N_YEARS))[None, :]
    res = grid_trends(x)
    assert res.p[0] < 1e-6
    assert res.ci_low[0] < res.slope_per_year[0] < res.ci_high[0]
    assert res.ci_low[0] < 0.03 < res.ci_high[0]
    assert res.mean[0] == pytest.approx(x.mean())


def test_bh_matches_scipy() -> None:
    rng = np.random.default_rng(6)
    p = np.concatenate([rng.uniform(0, 1, 3000), rng.uniform(0, 0.002, 300)])
    p[::97] = np.nan
    ok = np.isfinite(p)
    expected = np.zeros(p.shape, bool)
    expected[ok] = false_discovery_control(p[ok], method="bh") <= 0.10
    np.testing.assert_array_equal(bh_fdr(p, 0.10), expected)


def test_sig_codes() -> None:
    p = np.array([1e-9, 0.04, 0.5, np.nan] + [0.9] * 50)
    code = sig_codes(p)
    assert code[0] == 2
    assert code[1] == 1  # p < 0.05 but not FDR-significant with 53 tests
    assert code[2] == 0
    assert np.isnan(code[3])


def test_full_grid_is_fast() -> None:
    rng = np.random.default_rng(7)
    x = rng.normal(size=(52128, N_YEARS)).astype(np.float32)
    x[::50, :20] = np.nan
    t0 = time.perf_counter()
    res = grid_trends(x)
    elapsed = time.perf_counter() - t0
    assert np.isfinite(res.p).sum() > 50000
    assert elapsed < 30, f"took {elapsed:.1f}s"
