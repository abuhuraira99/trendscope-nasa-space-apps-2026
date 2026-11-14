"""Build trend grids from two observation-based datasets: GISTEMP v4 and GPCP v2.3.

GISTEMP v4 (NASA GISS): monthly surface temperature anomalies from weather stations and ships,
2 x 2 degrees, relative to 1951-1980. Variable "tempanomaly", web id "gistemp".

GPCP v2.3 (NASA GSFC, served by NOAA PSL): monthly precipitation from satellites and rain gauges,
2.5 x 2.5 degrees, mm/day. Variable "precip", web id "gpcp". Longitudes 0..360 are moved to
-180..180.

Both keep their native grids. Years run from 1981 to the last complete calendar year. Annual values
need at least 10 months. The outputs are the same as for POWER (see docs/build-spec.md):

    web/public/data/grid/<id>.trend.bin.gz, web/public/data/grid/<id>.series.bin.gz, vars.json

Downloads are cached in data/raw/gistemp/ and data/raw/gpcp/ and resumed if interrupted.

Usage:
    python pipeline/build_obs_grids.py              # download if missing, then build both
    python pipeline/build_obs_grids.py gpcp         # only one id
    python pipeline/build_obs_grids.py --refresh    # download fresh copies first
"""

from __future__ import annotations

import argparse
import gzip
import re
import shutil
import sys
import time
import warnings
from pathlib import Path

import numpy as np
import requests

sys.path.insert(0, str(Path(__file__).resolve().parent))  # -I leaves the script folder off the path

import build_power_grids as bpg  # noqa: E402

RAW = bpg.ROOT / "data" / "raw"
DATASETS = {
    "gistemp": {
        "url": "https://data.giss.nasa.gov/pub/gistemp/gistemp1200_GHCNv4_ERSSTv5.nc.gz",
        "file": RAW / "gistemp" / "gistemp1200_GHCNv4_ERSSTv5.nc.gz",
        "variable": "tempanomaly",
        "meta": {"source": "NASA GISS GISTEMP v4", "units": "°C"},
        "plausible_mean": (-0.5, 1.5),  # anomaly vs 1951-1980, area-weighted over 1981 onward
    },
    "gpcp": {
        "url": "https://downloads.psl.noaa.gov/Datasets/gpcp/precip.mon.mean.nc",
        "file": RAW / "gpcp" / "precip.mon.mean.nc",
        "variable": "precip",
        "meta": {"source": "GPCP v2.3 (NASA GSFC, via NOAA PSL)", "units": "mm/day"},
        "plausible_mean": (2.0, 3.5),
    },
}

session = requests.Session()
session.headers["User-Agent"] = "TrendScope/0.1 (NASA Space Apps 2026 research project)"


def download(url: str, dest: Path, refresh: bool = False, attempts: int = 30) -> Path:
    """Download url to dest, resuming a partial .part file after dropped connections."""
    if dest.exists() and not refresh:
        return dest
    dest.parent.mkdir(parents=True, exist_ok=True)
    part = dest.with_name(dest.name + ".part")
    if refresh and part.exists():
        part.unlink()
    total = None
    for attempt in range(1, attempts + 1):
        have = part.stat().st_size if part.exists() else 0
        if total is not None and have >= total:
            break
        headers = {"Range": f"bytes={have}-"} if have else {}
        try:
            with session.get(url, headers=headers, stream=True, timeout=(30, 120)) as r:
                if r.status_code == 416:  # nothing left to fetch
                    break
                r.raise_for_status()
                if r.status_code == 206:
                    total = have + int(r.headers.get("Content-Length", 0))
                    mode = "ab"
                else:  # server ignored the range: start over
                    total = int(r.headers.get("Content-Length", 0)) or None
                    mode = "wb"
                with open(part, mode) as fh:
                    for chunk in r.iter_content(1 << 16):
                        fh.write(chunk)
            if total is None or part.stat().st_size >= total:
                break
        except (requests.RequestException, OSError) as exc:
            bpg.log(
                f"download {dest.name}: attempt {attempt} stopped at "
                f"{part.stat().st_size if part.exists() else 0} bytes ({exc.__class__.__name__})"
            )
        time.sleep(min(2 * attempt, 20))
    else:
        raise RuntimeError(f"could not download {url}")
    if total is not None and part.stat().st_size < total:
        raise RuntimeError(f"incomplete download of {url}")
    part.replace(dest)
    bpg.log(f"downloaded {dest.name} ({dest.stat().st_size / 1e6:.1f} MB)")
    return dest


def open_netcdf(path: Path):
    import xarray as xr

    if path.suffix == ".gz":
        nc = path.with_suffix("")
        if not nc.exists() or nc.stat().st_mtime < path.stat().st_mtime:
            with gzip.open(path, "rb") as src, open(nc.with_name(nc.name + ".tmp"), "wb") as dst:
                shutil.copyfileobj(src, dst)
            nc.with_name(nc.name + ".tmp").replace(nc)
        path = nc
    # Times are decoded here (decode_time_axis): GPCP writes units xarray cannot parse.
    return xr.open_dataset(path, engine="netcdf4", decode_times=False)


def decode_time_axis(values: np.ndarray, units: str) -> tuple[np.ndarray, np.ndarray]:
    """Year and month of each time step from CF units like 'days since 1800-01-01 00:00:00'."""
    m = re.match(r"\s*(days|hours)\s+since\s+(\d{1,4})-(\d{1,2})-(\d{1,2})", units)
    if not m:
        raise ValueError(f"unexpected time units {units!r}")
    base = np.datetime64(f"{int(m[2]):04d}-{int(m[3]):02d}-{int(m[4]):02d}", "h")
    step = np.timedelta64(24 if m[1] == "days" else 1, "h")
    stamps = base + np.round(np.asarray(values, dtype=np.float64) * step.astype(float)).astype(
        "timedelta64[h]"
    )
    months = stamps.astype("datetime64[M]").astype(np.int64)
    return months // 12 + 1970, months % 12 + 1


def load_monthly(ds, variable: str) -> tuple[list[str], np.ndarray, dict]:
    """Return (months "YYYYMM", values [cells, months] float32, grid) with south-first rows and
    longitudes from -180."""
    da = ds[variable]
    lat_name = next(n for n in da.dims if n.lower().startswith("lat"))
    lon_name = next(n for n in da.dims if n.lower().startswith("lon"))
    da = da.transpose("time", lat_name, lon_name)
    lon = da[lon_name].values.astype(np.float64)
    if lon.max() > 180.0:
        da = da.assign_coords({lon_name: np.where(lon > 180.0, lon - 360.0, lon)})
    da = da.sortby(lat_name).sortby(lon_name)
    lat = da[lat_name].values.astype(np.float64)
    lon = da[lon_name].values.astype(np.float64)
    years, months_num = decode_time_axis(da["time"].values, da["time"].attrs.get("units", ""))
    keep = years >= bpg.FIRST_YEAR
    months = [f"{y}{m:02d}" for y, m in zip(years[keep], months_num[keep], strict=True)]
    values = da.values[keep].astype(np.float32)  # [time, lat, lon]
    values[~np.isfinite(values)] = np.nan
    cells = values.reshape(values.shape[0], -1).T  # [cells, months], row-major south first
    return months, np.ascontiguousarray(cells), bpg.regular_grid(lat, lon)


def build(var_id: str, refresh: bool) -> dict:
    cfg = DATASETS[var_id]
    path = download(cfg["url"], cfg["file"], refresh=refresh)
    with open_netcdf(path) as ds:
        months, monthly, grid = load_monthly(ds, cfg["variable"])
    years, annual = bpg.annual_from_monthly(monthly, months, "mean")
    bpg.log(
        f"{var_id}: months {months[0]}-{months[-1]}, years {years[0]}-{years[-1]}, grid "
        f"{grid['nlat']}x{grid['nlon']} from {grid['lat0']},{grid['lon0']}"
    )
    lat, _ = bpg.cell_lat_lon(grid)
    w = bpg.area_weights(lat)
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", RuntimeWarning)
        cell_mean = np.nanmean(annual, axis=1)
    ok = np.isfinite(cell_mean)
    gmean = float(np.sum(cell_mean[ok] * w[ok]) / w[ok].sum())
    lo, hi = cfg["plausible_mean"]
    if not lo <= gmean <= hi:
        raise ValueError(f"{var_id}: area-weighted mean {gmean:.4g} outside {lo}..{hi}")
    entry = bpg.build_products(var_id, annual, years, grid, {"param": None, **cfg["meta"]})
    entry.pop("param")  # not a POWER parameter, so no live point data for this id
    s = entry["summary"]
    bpg.log(
        f"{var_id}: mean {gmean:.4g}, valid {s['validCells']}, FDR up/down "
        f"{s['fdrUp']}/{s['fdrDown']}, area-weighted mean slope {s['areaWeightedMeanSlope']} "
        f"{cfg['meta']['units']}/decade"
    )
    return entry


def main(argv: list[str] | None = None) -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawTextHelpFormatter)
    ap.add_argument("ids", nargs="*", help="gistemp and/or gpcp (default: both)")
    ap.add_argument("--refresh", action="store_true", help="download fresh copies first")
    args = ap.parse_args(argv)
    unknown = [i for i in args.ids if i not in DATASETS]
    if unknown:
        ap.error(f"unknown ids: {unknown}. Known: {list(DATASETS)}")
    failed = []
    for var_id in args.ids or list(DATASETS):
        try:
            bpg.update_vars_json([build(var_id, args.refresh)])
        except Exception as exc:
            bpg.log(f"{var_id}: FAILED {exc!r}")
            failed.append(var_id)
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
