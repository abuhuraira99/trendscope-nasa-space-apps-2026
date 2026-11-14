"""Vectorised trend statistics for many grid cells at once.

Input is a 2-D array ``x`` of shape ``[cells, years]`` holding one annual series per cell, with NaN
for missing years. Every cell is tested independently:

1. Sen's slope: the median of all pairwise slopes ``(x[j] - x[i]) / (j - i)`` over valid pairs.
2. Mann-Kendall S and its variance with the tie correction.
3. A conservative Yue and Wang (2004) variance correction for lag-1 autocorrelation (below).
4. Two-sided p-value from ``z = (S - sign(S)) / sqrt(Var(S))``; ``S = 0`` gives ``p = 1``.
5. Gilbert (1987) 95% confidence interval for Sen's slope, using the corrected variance.

Field significance over a whole map uses the Benjamini-Hochberg false discovery rate (``bh_fdr``),
and ``sig_codes`` turns p-values into the 0/1/2 codes the web app draws. The browser library
(``web/src/lib/stats``) implements the same method, so the map and a single-cell verdict agree.

Autocorrelation correction
--------------------------
1. Detrend the series with its Sen slope on the true time axis: ``d_t = x_t - slope * t``, where a
   year after a gap keeps its real position ``t``.
2. ``r1 = sum((d_t - m)(d_{t+1} - m)) / sum((d_t - m)^2)`` with ``m`` the mean of the valid
   ``d_t``. The numerator runs over pairs of consecutive years that both have data, the denominator
   over all valid years. For a complete series this is exactly pymannkendall's ``__acf`` at lag 1.
3. Only when ``r1 > 0`` and ``r1 > 1.96 / sqrt(n)`` (``n`` = valid years), multiply Var(S) by
   ``n* = 1 + 2 * sum_{k=1}^{n-1} (1 - k/n) * r1^k``. Otherwise Var(S) is unchanged, so the
   factor is never below 1.

This differs on purpose from ``pymannkendall.yue_wang_modification_test(x, lag=1)``, which uses
``1 + 2 (1 - 1/n) r1`` with no screen and therefore shrinks Var(S) when ``r1 < 0``, turning noise
into false trends (it even returns NaN when that factor goes negative). Where the correction is not
applied, the results equal ``pymannkendall.original_test``.

Cells with fewer than ``min_years`` valid values (15 by default) get NaN everywhere.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from scipy.special import erfc

MIN_YEARS = 15
FDR_Q = 0.10
ALPHA = 0.05
Z_95 = 1.959963984540054  # norm.ppf(0.975), also the r1 screen

__all__ = [
    "ALPHA",
    "FDR_Q",
    "MIN_YEARS",
    "GridTrend",
    "bh_fdr",
    "grid_trends",
    "sig_codes",
]


@dataclass(frozen=True)
class GridTrend:
    """Per-cell results. Every field is a float64 array of shape ``[cells]``.

    ``var_s`` is the corrected variance, ``n_star`` the factor applied to it (1 when the
    autocorrelation correction was not applied).
    """

    slope_per_year: np.ndarray
    p: np.ndarray
    s: np.ndarray
    var_s: np.ndarray
    z: np.ndarray
    r1: np.ndarray
    n_star: np.ndarray
    n: np.ndarray
    mean: np.ndarray
    ci_low: np.ndarray
    ci_high: np.ndarray

    @property
    def slope_per_decade(self) -> np.ndarray:
        return self.slope_per_year * 10.0

    @property
    def valid(self) -> np.ndarray:
        return np.isfinite(self.slope_per_year)

    @property
    def corrected(self) -> np.ndarray:
        return self.n_star > 1.0


def _pairs(n_years: int) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    i, j = np.triu_indices(n_years, k=1)
    incidence = np.zeros((i.size, n_years), dtype=np.float64)
    rows = np.arange(i.size)
    incidence[rows, i] = 1.0
    incidence[rows, j] = 1.0
    return i, j, incidence


def _rank_value(sorted_vals: np.ndarray, rank: np.ndarray) -> np.ndarray:
    """Value at a 1-based, possibly fractional rank, with linear interpolation."""
    m = sorted_vals.shape[1]
    r = np.clip(rank - 1.0, 0.0, None)
    lo = np.minimum(np.floor(r).astype(np.int64), m - 1)
    hi = np.minimum(lo + 1, m - 1)
    frac = r - lo
    v_lo = np.take_along_axis(sorted_vals, lo[:, None], axis=1)[:, 0]
    v_hi = np.take_along_axis(sorted_vals, hi[:, None], axis=1)[:, 0]
    # hi may point past the valid pairs (NaN); fall back to the low value there
    v_hi = np.where(np.isfinite(v_hi), v_hi, v_lo)
    return v_lo + frac * (v_hi - v_lo)


def n_star_factor(r1: np.ndarray, n: np.ndarray) -> np.ndarray:
    """``1 + 2 * sum_{k=1}^{n-1} (1 - k/n) * r1^k`` for arrays of r1 and n (vectorised)."""
    r1 = np.asarray(r1, dtype=np.float64)
    n = np.asarray(n, dtype=np.float64)
    n_max = int(np.nanmax(n)) if n.size and np.isfinite(n).any() else 1
    k = np.arange(1, max(n_max, 2), dtype=np.float64)[None, :]
    nn = n[:, None]
    terms = np.where(k < nn, (1.0 - k / nn) * r1[:, None] ** k, 0.0)
    return 1.0 + 2.0 * terms.sum(axis=1)


def _chunk(x: np.ndarray, pairs, min_years: int) -> dict[str, np.ndarray]:
    i_idx, j_idx, incidence = pairs
    _, n_years = x.shape
    valid = np.isfinite(x)
    n = valid.sum(axis=1).astype(np.float64)

    d = x[:, j_idx] - x[:, i_idx]  # [c, pairs], NaN when either year is missing
    dt = (j_idx - i_idx).astype(np.float64)

    # Mann-Kendall S
    s = np.nansum(np.sign(d), axis=1)

    # Tie correction: for each value, count how many values in the cell equal it (itself included).
    # Summing (t - 1)(2t + 5) over values equals summing t(t - 1)(2t + 5) over tie groups.
    eq = (d == 0).astype(np.float64)
    t = 1.0 + eq @ incidence
    tie_term = np.sum(np.where(valid, (t - 1.0) * (2.0 * t + 5.0), 0.0), axis=1)
    var_s0 = (n * (n - 1.0) * (2.0 * n + 5.0) - tie_term) / 18.0

    # Sen's slope: median of the valid pairwise slopes. np.sort puts NaN last.
    slopes = np.sort(d / dt, axis=1)
    m = (n * (n - 1.0) / 2.0).astype(np.int64)
    m_safe = np.maximum(m, 1)
    lo = ((m_safe - 1) // 2)[:, None]
    hi = (m_safe // 2)[:, None]
    slope = 0.5 * (
        np.take_along_axis(slopes, lo, axis=1)[:, 0] + np.take_along_axis(slopes, hi, axis=1)[:, 0]
    )

    with np.errstate(invalid="ignore", divide="ignore"):
        # Lag-1 autocorrelation of the Sen-detrended series on the true time axis.
        tt = np.arange(n_years, dtype=np.float64)
        det = x - slope[:, None] * tt[None, :]
        det_mean = np.nansum(det, axis=1) / n
        y = det - det_mean[:, None]
        acov0 = np.nansum(y * y, axis=1)
        acov1 = np.nansum(y[:, :-1] * y[:, 1:], axis=1)  # NaN pairs (gaps) drop out
        r1 = np.where(acov0 > 0, acov1 / acov0, 0.0)

        apply = (r1 > 0) & (r1 > Z_95 / np.sqrt(n))
        n_star = np.ones_like(r1)
        if apply.any():
            n_star[apply] = n_star_factor(r1[apply], n[apply])
        var_s = var_s0 * n_star

        z = np.where(s > 0, s - 1.0, np.where(s < 0, s + 1.0, 0.0)) / np.sqrt(
            np.where(var_s > 0, var_s, np.nan)
        )
        z = np.where(s == 0, 0.0, z)  # S = 0 means no trend (p = 1), also for a constant series
        p = erfc(np.abs(z) / np.sqrt(2.0))

        # Gilbert (1987) confidence interval
        c_alpha = Z_95 * np.sqrt(np.where(var_s > 0, var_s, np.nan))
        m1 = (m - c_alpha) / 2.0
        m2 = (m + c_alpha) / 2.0
        ok = np.isfinite(c_alpha)
        ci_low = np.where(ok, _rank_value(slopes, np.where(ok, m1, 1.0)), np.nan)
        ci_high = np.where(ok, _rank_value(slopes, np.where(ok, m2 + 1.0, 1.0)), np.nan)

        mean = np.nansum(np.where(valid, x, 0.0), axis=1) / n

    out = {
        "slope_per_year": slope,
        "p": p,
        "s": s,
        "var_s": var_s,
        "z": z,
        "r1": r1,
        "n_star": n_star,
        "n": n,
        "mean": mean,
        "ci_low": ci_low,
        "ci_high": ci_high,
    }
    too_short = n < min_years
    for key, arr in out.items():
        if key != "n":
            arr[too_short] = np.nan
    return out


def grid_trends(x: np.ndarray, min_years: int = MIN_YEARS, chunk_size: int = 4096) -> GridTrend:
    """Run Sen's slope and the corrected Mann-Kendall test on every row of ``x``.

    ``x`` has shape ``[cells, years]`` with evenly spaced years and NaN for missing values.
    """
    x = np.asarray(x, dtype=np.float64)
    if x.ndim == 1:
        x = x[None, :]
    if x.ndim != 2:
        raise ValueError("x must have shape [cells, years]")
    cells, n_years = x.shape
    if n_years < 2:
        raise ValueError("need at least two years")
    pairs = _pairs(n_years)
    parts = [_chunk(x[a : a + chunk_size], pairs, min_years) for a in range(0, cells, chunk_size)]
    merged = {key: np.concatenate([p[key] for p in parts]) for key in parts[0]}
    return GridTrend(**merged)


def bh_fdr(p: np.ndarray, q: float = FDR_Q) -> np.ndarray:
    """Benjamini-Hochberg: boolean mask of discoveries at false discovery rate ``q``.

    NaN p-values are ignored (they count neither as tests nor as discoveries).
    """
    p = np.asarray(p, dtype=np.float64)
    out = np.zeros(p.shape, dtype=bool)
    ok = np.isfinite(p)
    m = int(ok.sum())
    if m == 0:
        return out
    ps = np.sort(p[ok])
    below = ps <= q * np.arange(1, m + 1) / m
    if not below.any():
        return out
    threshold = ps[np.nonzero(below)[0][-1]]
    out[ok] = p[ok] <= threshold
    return out


def sig_codes(p: np.ndarray, q: float = FDR_Q, alpha: float = ALPHA) -> np.ndarray:
    """2 = FDR-significant, 1 = only p < alpha, 0 = neither, NaN = no test."""
    p = np.asarray(p, dtype=np.float64)
    fdr = bh_fdr(p, q)
    code = np.where(fdr, 2.0, np.where(p < alpha, 1.0, 0.0))
    code[~np.isfinite(p)] = np.nan
    return code
