"""Turn NASA POWER annual grids into the web app's global trend grids.

Reads the files that pipeline/fetch_power_zarr.py saves from the public NASA POWER Zarr archive on
AWS, one per parameter: data/raw/power_zarr/<PARAM>.annual.npz (arrays years, lat, lon, annual,
count, units). Annual values are already computed there from monthly data (at least 10 months,
complete calendar years only, degree days as annual totals).

MERRA-2 parameters come on the native 0.5 x 0.625 degree grid and are subsampled (native points, no
averaging) to the web grid of docs/build-spec.md: 1 x 1.25 degrees, 181 x 288 cells. CERES SYN1deg
parameters keep their native 1 x 1 degree grid, which is written into the variable's "grid" entry.

For every variable the script converts units to the ones in the spec, runs the trend test on every
cell and writes:

    web/public/data/grid/<id>.trend.bin.gz    slope per decade, p-value, mean, significance code
    web/public/data/grid/<id>.series.bin.gz   annual series as scaled int16
    web/public/data/vars.json                 metadata, merged by id (other entries are kept)

The formats are defined in docs/build-spec.md ("Web data products"). Variables whose outputs are
newer than their .npz input (and than the statistics code and this script) are skipped, so running
the script again only builds what is new.

Usage:
    python pipeline/build_power_grids.py              # build every variable whose input exists
    python pipeline/build_power_grids.py t2m precip   # only these ids
    python pipeline/build_power_grids.py --force      # rebuild even if up to date
    python pipeline/build_power_grids.py --list       # show input and output status
"""

from __future__ import annotations

import argparse
import gzip
import json
import math
import sys
import time
import warnings
from datetime import UTC, datetime
from pathlib import Path

import numpy as np

from trendscope.analysis import grid_stats
from trendscope.analysis.grid_stats import ALPHA, FDR_Q, MIN_YEARS, grid_trends, sig_codes

ROOT = Path(__file__).resolve().parents[1]
RAW_ZARR = ROOT / "data" / "raw" / "power_zarr"
OUT_DATA = ROOT / "web" / "public" / "data"
OUT_GRID = OUT_DATA / "grid"
VARS_JSON = OUT_DATA / "vars.json"

FIRST_YEAR = 1981
MIN_MONTHS = 10
EXTREMES_PER_SIGN = 8
EXTREMES_MIN_SEPARATION_DEG = 15.0
# For fraction variables, cells whose long-term mean is below this are left out of the extremes.
NEAR_ZERO_MEAN = 0.01

MERRA2 = "NASA POWER (MERRA-2)"
CERES = "NASA POWER (CERES SYN1deg)"
# id, POWER API parameter, spec units, source. input: archive variable when it differs from
# the API parameter. skipZero: leave near-zero-mean cells out of the extremes.
# landOnly: cells whose series never changes (open ocean for land variables) are set to missing.
# The imerg id (IMERG_PRECTOT) is not built: POWER's Zarr archive has no IMERG grid.
VARIABLES: list[dict] = [
    {"id": "t2m", "param": "T2M", "units": "°C", "source": MERRA2},
    {"id": "t2m_max", "param": "T2M_MAX_AVG", "units": "°C", "source": MERRA2},
    {"id": "t2mwet", "param": "T2MWET", "units": "°C", "source": MERRA2},
    {"id": "cdd", "param": "CDD18_3", "units": "°C·day", "source": MERRA2},
    {"id": "precip", "param": "PRECTOTCORR", "units": "mm/day", "source": MERRA2},
    {
        "id": "soil",
        "param": "GWETROOT",
        "units": "0 to 1",
        "source": MERRA2,
        "skipZero": True,
        "landOnly": True,
    },
    {"id": "evap", "param": "EVLAND", "units": "mm/day", "source": MERRA2, "landOnly": True},
    # The archive has no PW grid; PW (cm) in the POWER API is MERRA-2 TQV (kg/m²) / 10.
    {"id": "pw", "param": "PW", "input": "TQV", "units": "cm", "source": MERRA2},
    {"id": "snow", "param": "FRSNO", "units": "0 to 1", "source": MERRA2, "skipZero": True},
    {"id": "seaice", "param": "FRSEAICE", "units": "0 to 1", "source": MERRA2, "skipZero": True},
    {"id": "ozone", "param": "TO3", "units": "DU", "source": MERRA2},
    {"id": "aod", "param": "AOD_55_ADJ", "units": "unitless", "source": CERES},
    {"id": "cloud", "param": "CLOUD_AMT", "units": "%", "source": CERES},
    {"id": "solar", "param": "ALLSKY_SFC_SW_DWN", "units": "MJ/m²/day", "source": CERES},
    {"id": "wind", "param": "WS10M", "units": "m/s", "source": MERRA2},
]
SPEC_ORDER = [
    "t2m", "t2m_max", "t2mwet", "cdd", "precip", "imerg", "soil", "evap", "pw", "snow", "seaice",
    "ozone", "aod", "cloud", "solar", "wind", "gistemp", "gpcp",
]  # fmt: skip

WEB_GRID = {"lat0": -90.0, "dlat": 1.0, "nlat": 181, "lon0": -180.0, "dlon": 1.25, "nlon": 288}


def log(msg: str) -> None:
    print(f"{time.strftime('%H:%M:%S')} {msg}", flush=True)


# ---------------------------------------------------------------------------------------------
# Shared helpers (also used by build_obs_grids.py)
# ---------------------------------------------------------------------------------------------


def grid_coords(grid: dict) -> tuple[np.ndarray, np.ndarray]:
    lats = grid["lat0"] + grid["dlat"] * np.arange(grid["nlat"])
    lons = grid["lon0"] + grid["dlon"] * np.arange(grid["nlon"])
    return lats, lons


def cell_lat_lon(grid: dict) -> tuple[np.ndarray, np.ndarray]:
    """Latitude and longitude of every cell, in cell order (row-major, south first)."""
    lats, lons = grid_coords(grid)
    lat2, lon2 = np.meshgrid(lats, lons, indexing="ij")
    return lat2.ravel(), lon2.ravel()


def regular_grid(lat: np.ndarray, lon: np.ndarray) -> dict:
    """Describe ascending, evenly spaced coordinates as a spec grid dict."""
    dlat, dlon = np.diff(lat), np.diff(lon)
    if not (np.allclose(dlat, dlat[0], atol=1e-4) and np.allclose(dlon, dlon[0], atol=1e-4)):
        raise ValueError("grid is not regular")
    if dlat[0] <= 0 or dlon[0] <= 0:
        raise ValueError("coordinates must be ascending")
    return {
        "lat0": float(round(lat[0], 6)),
        "dlat": float(round(dlat[0], 6)),
        "nlat": int(lat.size),
        "lon0": float(round(lon[0], 6)),
        "dlon": float(round(dlon[0], 6)),
        "nlon": int(lon.size),
    }


def trim_years(years: list[int], annual: np.ndarray) -> tuple[list[int], np.ndarray]:
    """Drop leading and trailing years in which fewer than half of the usual cells have a value."""
    valid_per_year = np.isfinite(annual).sum(axis=0)
    if valid_per_year.size == 0 or valid_per_year.max() == 0:
        return [], annual[:, :0]
    keep = valid_per_year >= 0.5 * valid_per_year.max()
    first, last = np.nonzero(keep)[0][[0, -1]]
    return list(years[first : last + 1]), annual[:, first : last + 1]


def annual_from_monthly(
    values: np.ndarray, months: list[str], stat: str = "mean"
) -> tuple[list[int], np.ndarray]:
    """Annual values per cell from a [cells, months] array, months as "YYYYMM".

    A year needs at least MIN_MONTHS valid months in a cell. "mean" averages the months; "sum"
    is the annual total, computed as 12 x the mean of the valid months (exactly the sum when all
    12 months are present).

    Only complete calendar years are kept: the last year is dropped unless all 12 of its months
    are in the data (a month counts as present when at least half of the cells that ever have data
    have a value in it). Then trim_years removes empty leading and trailing years.
    """
    years_all = sorted({int(m[:4]) for m in months})
    month_index = {m: k for k, m in enumerate(months)}
    has_data = np.isfinite(values).any(axis=1)
    n_data_cells = max(int(has_data.sum()), 1)

    def month_present(y: int, mo: int) -> bool:
        k = month_index.get(f"{y}{mo:02d}")
        if k is None:
            return False
        return np.isfinite(values[:, k]).sum() >= 0.5 * n_data_cells

    if years_all and not all(month_present(years_all[-1], mo) for mo in range(1, 13)):
        years_all = years_all[:-1]

    annual = np.full((values.shape[0], len(years_all)), np.nan, dtype=np.float64)
    for yi, y in enumerate(years_all):
        cols = [month_index[f"{y}{mo:02d}"] for mo in range(1, 13) if f"{y}{mo:02d}" in month_index]
        if not cols:
            continue
        block = values[:, cols].astype(np.float64)
        count = np.isfinite(block).sum(axis=1)
        with warnings.catch_warnings():
            warnings.simplefilter("ignore", RuntimeWarning)
            mean = np.nanmean(block, axis=1)
        val = mean * 12.0 if stat == "sum" else mean
        annual[:, yi] = np.where(count >= MIN_MONTHS, val, np.nan)
    return trim_years(years_all, annual)


def _nice_step(raw: float) -> float:
    if not raw > 0:
        return 1e-6
    exp = math.floor(math.log10(raw))
    for mult in (1, 2, 5, 10):
        step = mult * 10.0**exp
        if step >= raw * (1 - 1e-12):
            return float(f"{step:.12g}")
    return float(f"{10.0 ** (exp + 1):.12g}")


def choose_scale(annual: np.ndarray) -> tuple[float, float]:
    """Pick a round int16 scale and offset that cover the data range with about 65,000 steps."""
    finite = annual[np.isfinite(annual)]
    if finite.size == 0:
        return 1.0, 0.0
    lo, hi = float(finite.min()), float(finite.max())
    scale = _nice_step((hi - lo) / 65000.0)
    offset = float(f"{round((hi + lo) / 2.0 / scale) * scale:.12g}")
    assert (hi - offset) / scale <= 32767 and (lo - offset) / scale >= -32767
    return scale, offset


def encode_series(annual: np.ndarray, scale: float, offset: float) -> np.ndarray:
    q = np.round((annual - offset) / scale)
    q = np.where(np.isfinite(q), q, -32768)
    return np.clip(q, -32768, 32767).astype("<i2")


def area_weights(cell_lats: np.ndarray) -> np.ndarray:
    return np.clip(np.cos(np.deg2rad(cell_lats)), 0.0, None)


def weighted_percentiles(values: np.ndarray, weights: np.ndarray, qs: list[float]) -> list[float]:
    ok = np.isfinite(values) & (weights > 0)
    v, w = values[ok], weights[ok]
    if v.size == 0:
        return [float("nan")] * len(qs)
    order = np.argsort(v)
    v, w = v[order], w[order]
    cum = (np.cumsum(w) - 0.5 * w) / w.sum()
    return [float(np.interp(q / 100.0, cum, v)) for q in qs]


def sig4(x: float) -> float | None:
    """Round to 4 significant digits for JSON; NaN becomes null."""
    if x is None or not math.isfinite(x):
        return None
    return float(f"{x:.4g}")


def great_circle_deg(lat1, lon1, lat2, lon2) -> np.ndarray:
    p1, p2 = np.deg2rad(lat1), np.deg2rad(lat2)
    dl = np.deg2rad(np.asarray(lon2) - lon1)
    c = np.sin(p1) * np.sin(p2) + np.cos(p1) * np.cos(p2) * np.cos(dl)
    return np.rad2deg(np.arccos(np.clip(c, -1.0, 1.0)))


def pick_extremes(
    slope_dec: np.ndarray,
    p: np.ndarray,
    sig: np.ndarray,
    lat: np.ndarray,
    lon: np.ndarray,
    allowed: np.ndarray,
) -> dict[str, list[dict]]:
    """Top FDR-significant cells by |slope| for each sign, kept at least 15 degrees apart."""
    out: dict[str, list[dict]] = {}
    for key, sign in (("up", 1.0), ("down", -1.0)):
        cand = np.nonzero((sig == 2) & allowed & (np.sign(slope_dec) == sign))[0]
        cand = cand[np.argsort(-np.abs(slope_dec[cand]), kind="stable")]
        chosen: list[int] = []
        for i in cand:
            if chosen:
                d = great_circle_deg(lat[i], lon[i], lat[chosen], lon[chosen])
                if d.min() < EXTREMES_MIN_SEPARATION_DEG:
                    continue
            chosen.append(int(i))
            if len(chosen) == EXTREMES_PER_SIGN:
                break
        out[key] = [
            {
                "lat": float(round(lat[i], 4)),
                "lon": float(round(lon[i], 4)),
                "slope": sig4(float(slope_dec[i])),
                "p": float(f"{p[i]:.3g}"),
            }
            for i in chosen
        ]
    return out


def write_gz(path: Path, data: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + ".tmp")
    tmp.write_bytes(gzip.compress(data, compresslevel=9, mtime=0))
    tmp.replace(path)


def build_products(
    var_id: str,
    annual: np.ndarray,
    years: list[int],
    grid: dict,
    meta: dict,
    skip_zero_mean: bool = False,
) -> dict:
    """Run the statistics on a [cells, years] annual array and write the two grid files.

    Returns the vars.json entry for this variable.
    """
    n_cells = grid["nlat"] * grid["nlon"]
    assert annual.shape == (n_cells, len(years)), (annual.shape, n_cells, len(years))
    t0 = time.perf_counter()
    res = grid_trends(annual, min_years=MIN_YEARS)
    slope_dec = res.slope_per_decade
    p = res.p
    sig = sig_codes(p, q=FDR_Q, alpha=ALPHA)
    mean = res.mean
    log(
        f"{var_id}: statistics on {n_cells} cells x {len(years)} years in "
        f"{time.perf_counter() - t0:.1f}s"
    )

    trend = np.concatenate([slope_dec, p, mean, sig]).astype("<f4")
    write_gz(OUT_GRID / f"{var_id}.trend.bin.gz", trend.tobytes())

    # Cells without a valid trend keep their annual values in the series file (the app can still
    # draw them), but cells with no data at all are entirely -32768.
    scale, offset = choose_scale(annual)
    series = encode_series(annual, scale, offset)
    decoded = np.where(series == -32768, np.nan, series * scale + offset)
    err = np.nanmax(np.abs(decoded - annual)) if np.isfinite(annual).any() else 0.0
    assert err <= scale * 0.5001, (err, scale)
    write_gz(OUT_GRID / f"{var_id}.series.bin.gz", series.tobytes())

    lat, lon = cell_lat_lon(grid)
    w = area_weights(lat)
    valid = np.isfinite(slope_dec) & np.isfinite(p)
    up, down = slope_dec > 0, slope_dec < 0
    wv = w * valid
    awm = float(np.sum(np.where(valid, slope_dec, 0.0) * wv) / wv.sum()) if wv.sum() > 0 else None
    allowed = valid.copy()
    if skip_zero_mean:
        allowed &= np.abs(mean) >= NEAR_ZERO_MEAN

    entry = {
        "id": var_id,
        "param": meta["param"],
        "source": meta["source"],
        "units": meta["units"],
        "years": [int(years[0]), int(years[-1])],
        "grid": {k: grid[k] for k in ("lat0", "dlat", "nlat", "lon0", "dlon", "nlon")},
        "seriesScale": scale,
        "seriesOffset": offset,
        "valueRange": [sig4(v) for v in weighted_percentiles(mean, w, [2, 98])],
        "slopeRange": [sig4(v) for v in weighted_percentiles(slope_dec, w, [2, 98])],
        "summary": {
            "validCells": int(valid.sum()),
            "sigUp": int(np.sum(valid & up & (p < ALPHA))),
            "sigDown": int(np.sum(valid & down & (p < ALPHA))),
            "fdrUp": int(np.sum(valid & up & (sig == 2))),
            "fdrDown": int(np.sum(valid & down & (sig == 2))),
            "areaWeightedMeanSlope": sig4(awm) if awm is not None else None,
        },
        "extremes": pick_extremes(slope_dec, p, sig, lat, lon, allowed),
    }
    return entry


def update_vars_json(entries: list[dict]) -> None:
    """Merge entries into vars.json by id, keeping every other entry."""
    existing: list[dict] = []
    if VARS_JSON.exists():
        existing = json.loads(VARS_JSON.read_text(encoding="utf-8")).get("vars", [])
    by_id = {v["id"]: v for v in existing}
    for e in entries:
        by_id[e["id"]] = e
    rank = {vid: k for k, vid in enumerate(SPEC_ORDER)}
    merged = sorted(by_id.values(), key=lambda v: (rank.get(v["id"], len(rank)), v["id"]))
    firsts = [v["years"][0] for v in merged if v.get("years")]
    lasts = [v["years"][1] for v in merged if v.get("years")]
    doc = {
        "generated": datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "period": [min(firsts), max(lasts)] if firsts else None,
        "vars": merged,
    }
    VARS_JSON.parent.mkdir(parents=True, exist_ok=True)
    tmp = VARS_JSON.with_name("vars.json.tmp")
    tmp.write_text(json.dumps(doc, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    tmp.replace(VARS_JSON)


def vars_json_ids() -> set[str]:
    if not VARS_JSON.exists():
        return set()
    return {v["id"] for v in json.loads(VARS_JSON.read_text(encoding="utf-8")).get("vars", [])}


def outputs_for(var_id: str) -> list[Path]:
    return [OUT_GRID / f"{var_id}.trend.bin.gz", OUT_GRID / f"{var_id}.series.bin.gz"]


# ---------------------------------------------------------------------------------------------
# POWER Zarr annual files
# ---------------------------------------------------------------------------------------------

# Plausible range of the area-weighted global mean in spec units. A unit mix-up lands far outside.
PLAUSIBLE_MEAN = {
    "t2m": (-5, 25), "t2m_max": (0, 32), "t2mwet": (-10, 25), "cdd": (50, 5000),
    "precip": (1.5, 4.5), "soil": (0.05, 1), "evap": (0.1, 5), "pw": (1, 5), "snow": (0, 1),
    "seaice": (0, 1), "ozone": (200, 400), "aod": (0.01, 1), "cloud": (20, 100),
    "solar": (8, 25), "wind": (2, 15),
}  # fmt: skip


def _norm_units(units: str) -> str:
    return units.strip().lower().replace(" ", "").replace("**", "^").replace("^", "")


def to_spec_units(var: dict, units: str, values: np.ndarray) -> tuple[np.ndarray, str]:
    """Convert values from the archive's units to the spec units. Returns (values, description)."""
    u = _norm_units(units)
    vid = var["id"]
    if vid in ("t2m", "t2m_max", "t2mwet"):
        if u in ("k", "kelvin") or (u == "" and np.nanmedian(values) > 150):
            return values - 273.15, f"{units} - 273.15"
    elif vid in ("precip", "evap"):
        if u in ("kgm-2s-1", "kg/m2/s", "kgm-2/s", "mm/s", "mms-1"):
            return values * 86400.0, f"{units} x 86400"
        if u in ("mm/hr", "mm/h", "mmhr-1"):
            return values * 24.0, f"{units} x 24"
    elif vid == "pw":
        if u in ("kgm-2", "kg/m2", "mm"):
            return values / 10.0, f"{units} / 10 (1 kg/m² of water = 1 mm)"
    elif vid == "solar":
        if u in ("wm-2", "w/m2"):
            return values * 0.0864, f"{units} x 0.0864"
        if u in ("kw-hr/m2/day", "kwh/m2/day", "kw-hrm-2day-1"):
            return values * 3.6, f"{units} x 3.6"
    elif vid == "cloud" and u in ("1", "fraction", "") and np.nanmax(values) <= 1.0:
        return values * 100.0, f"{units} x 100"
    return values, f"{units} (no conversion)"


def zarr_file(var: dict) -> Path:
    return RAW_ZARR / f"{var.get('input', var['param'])}.annual.npz"


def load_zarr_annual(var: dict) -> tuple[list[int], np.ndarray, dict, str]:
    """Read one parameter and return (years, annual [cells, years] float64, grid, unit note)."""
    with np.load(zarr_file(var), allow_pickle=False) as z:
        years = [int(y) for y in z["years"]]
        lat = z["lat"].astype(np.float64)
        lon = z["lon"].astype(np.float64)
        annual = z["annual"]
        units = str(z["units"]) if "units" in z.files else ""
    if lat[0] > lat[-1]:
        lat, annual = lat[::-1], annual[:, ::-1, :]
    if lon.max() >= 180.0 and np.isclose(lon.min(), -180.0):
        keep = lon < 180.0  # 180 duplicates -180
        lon, annual = lon[keep], annual[:, :, keep]

    dlat, dlon = float(np.median(np.diff(lat))), float(np.median(np.diff(lon)))
    if abs(dlat - 0.5) < 1e-6 and abs(dlon - 0.625) < 1e-6:
        g = WEB_GRID
        want_lat, want_lon = grid_coords(g)
        rows = np.array([int(np.argmin(np.abs(lat - v))) for v in want_lat])
        cols = np.array([int(np.argmin(np.abs(lon - v))) for v in want_lon])
        if np.abs(lat[rows] - want_lat).max() > 1e-4 or np.abs(lon[cols] - want_lon).max() > 1e-4:
            raise ValueError(f"{zarr_file(var).name}: native grid lacks the web grid points")
        annual = annual[:, rows][:, :, cols]
        grid = dict(g)
    else:
        grid = regular_grid(lat, lon)

    keep_years = [k for k, y in enumerate(years) if y >= FIRST_YEAR]
    years = [years[k] for k in keep_years]
    annual = annual[keep_years]
    cells = annual.reshape(len(years), -1).T.astype(np.float64)  # [cells, years], cell-major
    cells, note = to_spec_units(var, units, cells)
    return years, cells, grid, note


def mask_constant_cells(annual: np.ndarray) -> int:
    """Set cells whose finite values never change to missing (open ocean for land variables)."""
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", RuntimeWarning)
        const = np.nanmax(annual, axis=1) == np.nanmin(annual, axis=1)
    annual[const] = np.nan
    return int(const.sum())


def code_mtime() -> float:
    """Newest change to the statistics or to this script: older outputs are rebuilt."""
    return max(Path(grid_stats.__file__).stat().st_mtime, Path(__file__).stat().st_mtime)


def up_to_date(var: dict, in_json: set[str]) -> bool:
    src = zarr_file(var)
    outs = outputs_for(var["id"])
    return (
        var["id"] in in_json
        and src.exists()
        and all(o.exists() for o in outs)
        and min(o.stat().st_mtime for o in outs) > max(src.stat().st_mtime, code_mtime())
    )


def status_line(var: dict, in_json: set[str]) -> str:
    src = zarr_file(var)
    built = all(o.exists() for o in outputs_for(var["id"]))
    state = "up to date" if up_to_date(var, in_json) else ("stale" if built else "not built")
    have = "present" if src.exists() else "missing"
    return f"{var['id']:8s} {zarr_file(var).name:30s} input {have:8s} output {state}"


def build_one(var: dict) -> dict | None:
    vid = var["id"]
    t0 = time.perf_counter()
    years, annual, grid, note = load_zarr_annual(var)
    if var.get("landOnly"):
        n = mask_constant_cells(annual)
        log(f"{vid}: {n} cells with a constant series set to missing")
    years, annual = trim_years(years, annual)
    has = np.isfinite(annual).any(axis=1)
    span = f"{years[0]}-{years[-1]}" if years else "no years"
    log(
        f"{vid}: {zarr_file(var).stem} {span}, grid "
        f"{grid['nlat']}x{grid['nlon']}, {int(has.sum())} cells with data, units {note} "
        f"({time.perf_counter() - t0:.1f}s)"
    )
    if len(years) < MIN_YEARS:
        log(f"{vid}: only {len(years)} usable years, skip")
        return None

    lat, _ = cell_lat_lon(grid)
    w = area_weights(lat)
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", RuntimeWarning)
        cell_mean = np.nanmean(annual, axis=1)
    ok = np.isfinite(cell_mean)
    gmean = float(np.sum(cell_mean[ok] * w[ok]) / w[ok].sum())
    lo, hi = PLAUSIBLE_MEAN.get(vid, (-np.inf, np.inf))
    if not lo <= gmean <= hi:
        raise ValueError(
            f"{vid}: area-weighted mean {gmean:.4g} {var['units']} is outside the plausible range "
            f"{lo}..{hi}. Check the unit conversion ({note})."
        )
    entry = build_products(vid, annual, years, grid, var, var.get("skipZero", False))
    s = entry["summary"]
    log(
        f"{vid}: mean {gmean:.4g} {var['units']}, valid {s['validCells']}, FDR up/down "
        f"{s['fdrUp']}/{s['fdrDown']}, area-weighted mean slope {s['areaWeightedMeanSlope']} "
        f"{var['units']}/decade"
    )
    return entry


def main(argv: list[str] | None = None) -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawTextHelpFormatter)
    ap.add_argument("ids", nargs="*", help="variable ids to build (default: all)")
    ap.add_argument("--force", action="store_true", help="rebuild even when outputs are up to date")
    ap.add_argument("--list", action="store_true", help="print status and exit")
    args = ap.parse_args(argv)

    known = {v["id"]: v for v in VARIABLES}
    unknown = [i for i in args.ids if i not in known]
    if unknown:
        ap.error(f"unknown ids: {unknown}. Known: {sorted(known)}")
    selected = [known[i] for i in args.ids] if args.ids else VARIABLES
    in_json = vars_json_ids()

    if args.list:
        for v in selected:
            print(status_line(v, in_json))
        return 0

    built, failed = [], []
    for var in selected:
        if not zarr_file(var).exists():
            log(f"{var['id']}: no input yet ({zarr_file(var).name}), skip")
            continue
        if not args.force and up_to_date(var, in_json):
            log(f"{var['id']}: up to date, skip")
            continue
        try:
            entry = build_one(var)
        except Exception as exc:  # keep going with the other variables
            log(f"{var['id']}: FAILED {exc!r}")
            failed.append(var["id"])
            continue
        if entry:
            update_vars_json([entry])  # after each variable, so a later failure keeps this one
            built.append(var["id"])
    log(f"built: {built or 'nothing'}" + (f", failed: {failed}" if failed else ""))
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
