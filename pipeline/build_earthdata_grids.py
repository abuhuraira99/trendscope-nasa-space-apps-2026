"""Build trend grids from two NASA Earthdata products that need an Earthdata login.

tws   GRACE and GRACE-FO terrestrial water storage: NASA JPL mascons RL06.3 v04 with the Coastline
      Resolution Improvement (CRI) filter, from PO.DAAC. Variable lwe_thickness, the equivalent
      water thickness anomaly in cm (relative to the 2004.0-2009.999 mean). Native 0.5 degree grid
      (the mascons themselves are 3 degree equal-area caps, so neighbouring cells often share a
      value). Land only, using the file's land_mask, which keeps Greenland and Antarctica.
      Longitudes 0..360 are moved to -180..180. The JPL scale_factor (gain) grid is not applied.

      GRACE has gaps: single months skipped for battery management from 2011, and the 11 months
      between the end of GRACE (June 2017) and the start of GRACE-FO (June 2018). So for tws only, a
      year counts when at least 8 of its 12 months exist (10 for every other variable). 2017 and
      2018 have fewer and stay missing; the trend test handles the gap (each year keeps its real
      place in time).

ndvi  MODIS Terra MOD13C2 v061 monthly NDVI on the 0.05 degree CMG grid, from LP DAAC. Each monthly
      granule is subset on the server through NASA's cloud OPeNDAP (Hyrax): every 20th row and
      column, starting at index 10, so one native 0.05 degree pixel near the centre of each 1 x 1
      degree box (no averaging, like the POWER grids). Stored values are int16; NDVI = value /
      10000 (the HDF4 scale_factor of 10000 means divide), fill -3000, valid -2000..10000. The
      annual value is the mean of the months with data, at least 10 of 12.

Only complete calendar years are used. The outputs are the same as for the other grids (see
docs/build-spec.md):

    web/public/data/grid/<id>.trend.bin.gz, web/public/data/grid/<id>.series.bin.gz, vars.json

Login: a bearer token from https://urs.earthdata.nasa.gov ("Generate Token"), read from the
EARTHDATA_TOKEN environment variable or from the .env file in the repository root. The token is
sent only to *.earthdata.nasa.gov and *.earthdatacloud.nasa.gov hosts, never to the signed storage
URLs they redirect to.

Downloads are cached in data/raw/grace/ and data/raw/modis_ndvi/ (one small file per month), so a
second run only fetches what is new. A variable is rebuilt only when its outputs are older than its
inputs or the code.

Usage:
    python pipeline/build_earthdata_grids.py               # both ids
    python pipeline/build_earthdata_grids.py --only tws    # one id
    python pipeline/build_earthdata_grids.py --force       # rebuild even if up to date
    python pipeline/build_earthdata_grids.py --refresh     # fetch fresh copies / granule lists
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import threading
import time
import warnings
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from urllib.parse import urlparse

import numpy as np
import requests

sys.path.insert(0, str(Path(__file__).resolve().parent))  # -I leaves the script folder off the path

import build_obs_grids as bog  # noqa: E402
import build_power_grids as bpg  # noqa: E402

RAW = bpg.ROOT / "data" / "raw"
USER_AGENT = "TrendScope/0.1 (NASA Space Apps 2026 research project)"
AUTH_HOST_SUFFIXES = (".earthdata.nasa.gov", ".earthdatacloud.nasa.gov")

# --- tws ------------------------------------------------------------------------------------
TWS_URL = (
    "https://archive.podaac.earthdata.nasa.gov/podaac-ops-cumulus-protected/"
    "TELLUS_GRAC-GRFO_MASCON_CRI_GRID_RL06.3_V4/"
    "GRCTellus.JPL.200204_202609.GLO.RL06.3M.MSCNv04CRI.nc"
)
TWS_FILE = RAW / "grace" / TWS_URL.rsplit("/", 1)[1]
TWS_MIN_MONTHS = 8  # GRACE exception, see the module docstring
TWS_META = {
    "param": None,
    "source": "GRACE and GRACE-FO (NASA JPL mascons RL06.3)",
    "units": "cm",
}
TWS_PLAUSIBLE_MEAN = (-15.0, 15.0)  # anomaly, area-weighted over land

# --- ndvi -----------------------------------------------------------------------------------
NDVI_DIR = RAW / "modis_ndvi"
NDVI_GRANULES = NDVI_DIR / "granules.json"
CMR_GRANULES = "https://cmr.earthdata.nasa.gov/search/granules.json"
NDVI_FIRST_YEAR, NDVI_LAST_YEAR = 2001, 2025
NDVI_GROUP = "/MOD_Grid_monthly_CMG_VI"
NDVI_VAR = f"{NDVI_GROUP}/Data_Fields/CMG_0_05_Deg_Monthly_NDVI"
NDVI_STRIDE, NDVI_START = 20, 10  # 0.05 degree pixels -> one pixel per 1 degree box
NDVI_SHAPE = (3600 // NDVI_STRIDE, 7200 // NDVI_STRIDE)
NDVI_FILL, NDVI_VALID, NDVI_DIVISOR = -3000, (-2000, 10000), 10000.0
NDVI_MIN_MONTHS = 10
NDVI_META = {"param": None, "source": "MODIS Terra MOD13C2 v061 (NASA LP DAAC)", "units": "NDVI"}
NDVI_PLAUSIBLE_MEAN = (0.1, 0.7)

# Places printed after each build, to check the map against the known trends.
CHECK_POINTS = {
    "tws": [
        ("NW India / Punjab", 29.0, 75.0),
        ("Middle East, NW Iran / N Iraq", 34.5, 47.0),
        ("Middle East, Caspian / N Iran", 37.0, 52.0),
        ("Greenland SE", 65.5, -41.5),
        ("Greenland NW", 77.0, -60.0),
        ("West Antarctica, Amundsen Sea", -76.0, -105.0),
        ("Upper Missouri", 47.0, -103.0),
        ("East-central Africa, Lake Victoria", -1.0, 33.0),
        ("Central Africa, Upper Zambezi / Okavango", -15.0, 22.0),
    ],
    "ndvi": [
        ("India, Punjab", 30.5, 75.5),
        ("India, central", 23.0, 78.0),
        ("China, Loess Plateau", 37.0, 109.0),
        ("China, North China Plain", 35.5, 116.0),
        ("Amazon, Rondonia", -10.5, -62.5),
        ("Amazon, Mato Grosso", -11.5, -55.5),
        ("Sahel edge, Niger", 14.5, 2.5),
        ("Sahel, Sudan", 13.5, 30.5),
    ],
}
# Boxes (lat_s, lat_n, lon_w, lon_e): share of valid cells with an FDR-significant rise or fall.
CHECK_BOXES = {
    "tws": [
        ("NW India", 26, 32, 70, 80),
        ("Middle East", 30, 40, 40, 55),
        ("Greenland", 60, 83, -60, -20),
        ("West Antarctica", -82, -70, -130, -80),
        ("Upper Missouri", 42, 50, -110, -95),
        ("East Africa lakes", -5, 5, 28, 38),
    ],
    "ndvi": [
        ("India", 8, 32, 68, 90),
        ("China", 22, 42, 100, 122),
        ("Amazon arc of deforestation", -14, -6, -66, -48),
        ("Sahel", 10, 18, -17, 35),
    ],
}


def log(msg: str) -> None:
    bpg.log(msg)


# ---------------------------------------------------------------------------------------------
# Earthdata login
# ---------------------------------------------------------------------------------------------


def load_token(env_file: Path = bpg.ROOT / ".env") -> str:
    """EARTHDATA_TOKEN from the environment, else from the .env file. Never printed."""
    token = os.environ.get("EARTHDATA_TOKEN", "").strip()
    if not token and env_file.exists():
        for line in env_file.read_text(encoding="utf-8").splitlines():
            key, sep, value = line.partition("=")
            if sep and key.strip() == "EARTHDATA_TOKEN":
                token = value.strip().strip('"').strip("'")
    if not token:
        raise RuntimeError("EARTHDATA_TOKEN is not set (environment or .env)")
    return token


def is_auth_host(url: str) -> bool:
    host = (urlparse(url).hostname or "").lower()
    return host.endswith(AUTH_HOST_SUFFIXES)


class EarthdataSession(requests.Session):
    """A session that sends the bearer token to Earthdata hosts only, also after redirects."""

    def __init__(self, token: str) -> None:
        super().__init__()
        self._auth = f"Bearer {token}"
        self.headers["User-Agent"] = USER_AGENT

    def request(self, method, url, *args, **kwargs):
        headers = dict(kwargs.pop("headers", None) or {})
        if is_auth_host(url):
            headers["Authorization"] = self._auth
        return super().request(method, url, *args, headers=headers, **kwargs)

    def rebuild_auth(self, prepared_request, response):
        # requests drops Authorization when the host changes; put it back for Earthdata hosts
        # and never send it to the signed S3 / CloudFront URLs.
        if is_auth_host(prepared_request.url):
            prepared_request.headers["Authorization"] = self._auth
        else:
            prepared_request.headers.pop("Authorization", None)


def check_not_login_page(r: requests.Response, what: str) -> None:
    ctype = r.headers.get("Content-Type", "")
    if "text/html" in ctype:
        raise RuntimeError(
            f"{what}: got an HTML page from {urlparse(r.url).hostname} instead of data. "
            "The Earthdata token is probably missing, expired or not approved for this archive."
        )


def download(
    session: requests.Session, url: str, dest: Path, refresh: bool = False, attempts: int = 30
) -> Path:
    """Download url to dest, resuming a partial .part file after dropped connections.

    Each attempt starts again from url, so an expired signed redirect is simply renewed.
    """
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
                check_not_login_page(r, dest.name)
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
            log(
                f"download {dest.name}: attempt {attempt} stopped at "
                f"{part.stat().st_size if part.exists() else 0} bytes ({exc.__class__.__name__})"
            )
        time.sleep(min(2 * attempt, 20))
    else:
        raise RuntimeError(f"could not download {dest.name}")
    if total is not None and part.stat().st_size < total:
        raise RuntimeError(f"incomplete download of {dest.name}")
    part.replace(dest)
    log(f"downloaded {dest.name} ({dest.stat().st_size / 1e6:.1f} MB)")
    return dest


# ---------------------------------------------------------------------------------------------
# Monthly to annual
# ---------------------------------------------------------------------------------------------


def annual_means(
    values: np.ndarray,
    months: list[str],
    min_months: int,
    first_year: int | None = None,
    last_year: int | None = None,
) -> tuple[list[int], np.ndarray, dict[int, int]]:
    """Annual means per cell from a [cells, months] array, months as "YYYYMM".

    Months that appear twice are averaged first. A year counts in a cell when at least min_months
    of its months have a value there. Only complete calendar years are used: the first year of the
    record counts only if the record starts in January, the last only if it ends in December.
    Returns (years, annual [cells, years], months available per year) after bpg.trim_years.
    """
    order = sorted(set(months))
    if len(order) != len(months):
        cols = {m: [k for k, mm in enumerate(months) if mm == m] for m in order}
        with warnings.catch_warnings():
            warnings.simplefilter("ignore", RuntimeWarning)
            values = np.stack([np.nanmean(values[:, cols[m]], axis=1) for m in order], axis=1)
    else:
        idx = np.argsort(months, kind="stable")
        values = values[:, idx]
    months = order
    y0, m0 = int(months[0][:4]), int(months[0][4:])
    y1, m1 = int(months[-1][:4]), int(months[-1][4:])
    first = y0 if m0 == 1 else y0 + 1
    last = y1 if m1 == 12 else y1 - 1
    if first_year is not None:
        first = max(first, first_year)
    if last_year is not None:
        last = min(last, last_year)
    years = list(range(first, last + 1))
    annual = np.full((values.shape[0], len(years)), np.nan, dtype=np.float64)
    per_year: dict[int, int] = {}
    for yi, y in enumerate(years):
        cols = [k for k, m in enumerate(months) if int(m[:4]) == y]
        per_year[y] = len(cols)
        if not cols:
            continue
        block = values[:, cols].astype(np.float64)
        count = np.isfinite(block).sum(axis=1)
        with warnings.catch_warnings():
            warnings.simplefilter("ignore", RuntimeWarning)
            mean = np.nanmean(block, axis=1)
        annual[:, yi] = np.where(count >= min_months, mean, np.nan)
    years, annual = bpg.trim_years(years, annual)
    return years, annual, {y: per_year[y] for y in years}


def area_weighted_mean(annual: np.ndarray, grid: dict) -> float:
    lat, _ = bpg.cell_lat_lon(grid)
    w = bpg.area_weights(lat)
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", RuntimeWarning)
        cell_mean = np.nanmean(annual, axis=1)
    ok = np.isfinite(cell_mean)
    return float(np.sum(cell_mean[ok] * w[ok]) / w[ok].sum())


# ---------------------------------------------------------------------------------------------
# tws: GRACE / GRACE-FO mascons
# ---------------------------------------------------------------------------------------------


def load_tws(path: Path) -> tuple[list[str], np.ndarray, dict]:
    """Monthly land-only lwe_thickness in cm as (months, [cells, months], grid)."""
    import xarray as xr

    with xr.open_dataset(path, engine="netcdf4", decode_times=False) as ds:
        da = ds["lwe_thickness"]
        units = str(da.attrs.get("units", "")).strip().lower()
        if units not in ("cm", "centimeters", "centimetres"):
            raise ValueError(f"tws: unexpected lwe_thickness units {units!r}")
        if "land_mask" in ds:
            land = ds["land_mask"]
            da = da.where(land > 0)
            n_land = int((land.values > 0).sum())
            log(f"tws: land_mask applied ({n_land} land cells of {land.size})")
        else:
            log("tws: no land_mask in the file, ocean kept")
        months, cells, grid = bog.load_monthly(da.to_dataset(name="lwe"), "lwe")
    return months, cells, grid


def build_tws(session: requests.Session, refresh: bool) -> dict:
    path = download(session, TWS_URL, TWS_FILE, refresh=refresh)
    months, monthly, grid = load_tws(path)
    years, annual, per_year = annual_means(monthly, months, TWS_MIN_MONTHS)
    missing = [y for y in years if not np.isfinite(annual[:, years.index(y)]).any()]
    log(
        f"tws: months {months[0]}-{months[-1]} ({len(set(months))} distinct), years "
        f"{years[0]}-{years[-1]}, grid {grid['nlat']}x{grid['nlon']} from "
        f"{grid['lat0']},{grid['lon0']}"
    )
    log("tws: months per year " + ", ".join(f"{y}:{n}" for y, n in per_year.items()))
    log(f"tws: years left empty (fewer than {TWS_MIN_MONTHS} months): {missing or 'none'}")
    gmean = area_weighted_mean(annual, grid)
    lo, hi = TWS_PLAUSIBLE_MEAN
    if not lo <= gmean <= hi:
        raise ValueError(f"tws: area-weighted mean {gmean:.4g} cm outside {lo}..{hi}")
    entry = bpg.build_products("tws", annual, years, grid, dict(TWS_META))
    entry.pop("param")  # not a POWER parameter, so no live point data for this id
    log_entry("tws", entry, gmean)
    return entry


# ---------------------------------------------------------------------------------------------
# ndvi: MODIS Terra MOD13C2 through OPeNDAP
# ---------------------------------------------------------------------------------------------


def list_ndvi_granules(session: requests.Session, refresh: bool) -> dict[str, dict]:
    """One granule per month "YYYYMM": {"ur", "opendap"}. Cached in granules.json."""
    if NDVI_GRANULES.exists() and not refresh:
        return json.loads(NDVI_GRANULES.read_text(encoding="utf-8"))
    entries: list[dict] = []
    params = {"short_name": "MOD13C2", "version": "061", "page_size": 2000}
    headers: dict[str, str] = {}
    while True:
        r = session.get(CMR_GRANULES, params=params, headers=headers, timeout=(30, 120))
        r.raise_for_status()
        page = r.json()["feed"]["entry"]
        entries += page
        after = r.headers.get("CMR-Search-After")
        if not page or not after or len(page) < params["page_size"]:
            break
        headers = {"CMR-Search-After": after}
    by_month: dict[str, dict] = {}
    for e in entries:
        month = e["time_start"][:4] + e["time_start"][5:7]
        dap = [
            lk["href"]
            for lk in e.get("links", [])
            if lk.get("href", "").startswith("https://opendap.earthdata.nasa.gov/")
        ]
        if not dap:
            continue
        ur = e["title"]
        # Keep the newest production of a month (the last part of the name is when it was made).
        if month not in by_month or ur > by_month[month]["ur"]:
            by_month[month] = {"ur": ur, "opendap": dap[0]}
    by_month = dict(sorted(by_month.items()))
    NDVI_DIR.mkdir(parents=True, exist_ok=True)
    tmp = NDVI_GRANULES.with_name(NDVI_GRANULES.name + ".tmp")
    tmp.write_text(json.dumps(by_month, indent=1) + "\n", encoding="utf-8")
    tmp.replace(NDVI_GRANULES)
    log(f"ndvi: {len(by_month)} monthly granules listed in CMR ({len(entries)} entries)")
    return by_month


def ndvi_month_file(month: str) -> Path:
    return NDVI_DIR / f"MOD13C2.{month}.npz"


def ndvi_constraint() -> str:
    rows = f"[{NDVI_START}:{NDVI_STRIDE}:3599]"
    cols = f"[{NDVI_START}:{NDVI_STRIDE}:7199]"
    return f"{NDVI_VAR}{rows}{cols};{NDVI_GROUP}/Latitude{rows};{NDVI_GROUP}/Longitude{cols}"


def fetch_ndvi_month(
    session: requests.Session, month: str, granule: dict, attempts: int = 5
) -> Path:
    """Fetch the strided NDVI subset of one granule and save it as int16 (north-first rows)."""
    import netCDF4

    dest = ndvi_month_file(month)
    url = granule["opendap"].rstrip("/") + ".dap.nc4"
    last_exc: Exception | None = None
    for attempt in range(1, attempts + 1):
        try:
            r = session.get(url, params={"dap4.ce": ndvi_constraint()}, timeout=(30, 300))
            r.raise_for_status()
            check_not_login_page(r, granule["ur"])
            with netCDF4.Dataset("subset.nc4", mode="r", memory=r.content) as nc:
                g = nc[NDVI_GROUP]
                v = g["Data_Fields"]["CMG_0_05_Deg_Monthly_NDVI"]
                v.set_auto_maskandscale(False)  # scale_factor 10000 means divide: done by hand
                ndvi = np.asarray(v[:], dtype=np.int16)
                lat = np.asarray(g["Latitude"][:], dtype=np.float64)
                lon = np.asarray(g["Longitude"][:], dtype=np.float64)
                attrs = {k: v.getncattr(k) for k in v.ncattrs()}
                fill = int(attrs["_FillValue"]) if "_FillValue" in attrs else None
                scale = float(attrs["scale_factor"]) if "scale_factor" in attrs else None
            if ndvi.shape != NDVI_SHAPE or lat.shape != (NDVI_SHAPE[0],):
                raise ValueError(f"unexpected subset shape {ndvi.shape}")
            if fill not in (None, NDVI_FILL) or scale not in (None, NDVI_DIVISOR):
                raise ValueError(f"unexpected NDVI attributes fill={fill} scale_factor={scale}")
            tmp = dest.with_name(dest.stem + ".tmp.npz")
            np.savez_compressed(tmp, ndvi=ndvi, lat=lat, lon=lon, ur=np.array(granule["ur"]))
            tmp.replace(dest)
            return dest
        except Exception as exc:  # retry network and server hiccups
            last_exc = exc
            time.sleep(min(5 * attempt, 30))
    raise RuntimeError(f"ndvi {month}: {last_exc!r}")


def fetch_ndvi(token: str, refresh: bool, workers: int) -> list[str]:
    """Fetch every missing month from NDVI_FIRST_YEAR to NDVI_LAST_YEAR. Returns failed months."""
    session = EarthdataSession(token)
    granules = list_ndvi_granules(session, refresh)
    wanted = {m: g for m, g in granules.items() if NDVI_FIRST_YEAR <= int(m[:4]) <= NDVI_LAST_YEAR}
    absent = [
        f"{y}{mo:02d}"
        for y in range(NDVI_FIRST_YEAR, NDVI_LAST_YEAR + 1)
        for mo in range(1, 13)
        if f"{y}{mo:02d}" not in wanted
    ]
    if absent:
        log(f"ndvi: CMR has no granule for {absent}")
    todo = [m for m in wanted if refresh or not ndvi_month_file(m).exists()]
    n_cached = len(wanted) - len(todo)
    log(f"ndvi: {len(wanted)} months wanted, {n_cached} cached, {len(todo)} to fetch")
    if not todo:
        return []
    local = threading.local()

    def job(month: str) -> Path:
        if not hasattr(local, "session"):
            local.session = EarthdataSession(token)
        return fetch_ndvi_month(local.session, month, wanted[month])

    failed: list[str] = []
    t0 = time.perf_counter()
    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = {pool.submit(job, m): m for m in todo}
        for k, fut in enumerate(as_completed(futures), 1):
            month = futures[fut]
            try:
                fut.result()
            except Exception as exc:
                failed.append(month)
                log(f"ndvi: {month} FAILED {exc}")
            if k % 10 == 0 or k == len(todo):
                log(f"ndvi: fetched {k}/{len(todo)} months in {time.perf_counter() - t0:.0f}s")
    return sorted(failed)


def load_ndvi() -> tuple[list[str], np.ndarray, dict]:
    """Cached monthly subsets as (months, NDVI [cells, months] float32, grid), south first."""
    files = sorted(NDVI_DIR.glob("MOD13C2.??????.npz"))
    months, layers = [], []
    lat_ref = lon_ref = None
    for f in files:
        month = f.name.split(".")[1]
        if not NDVI_FIRST_YEAR <= int(month[:4]) <= NDVI_LAST_YEAR:
            continue
        with np.load(f, allow_pickle=False) as z:
            raw, lat, lon = z["ndvi"], z["lat"], z["lon"]
        if lat_ref is None:
            lat_ref, lon_ref = lat, lon
        elif not (np.allclose(lat, lat_ref) and np.allclose(lon, lon_ref)):
            raise ValueError(f"{f.name}: grid differs from the other months")
        bad = (raw == NDVI_FILL) | (raw < NDVI_VALID[0]) | (raw > NDVI_VALID[1])
        layers.append(np.where(bad, np.nan, raw / NDVI_DIVISOR).astype(np.float32))
        months.append(month)
    if not layers:
        raise RuntimeError("ndvi: no cached months")
    stack = np.stack(layers)  # [months, lat, lon], north first as served
    if lat_ref[0] > lat_ref[-1]:
        lat_ref, stack = lat_ref[::-1], stack[:, ::-1, :]
    grid = bpg.regular_grid(lat_ref, lon_ref)
    cells = np.ascontiguousarray(stack.reshape(stack.shape[0], -1).T)
    return months, cells, grid


def build_ndvi(token: str, refresh: bool, workers: int) -> dict:
    failed = fetch_ndvi(token, refresh, workers)
    if failed:
        log(f"ndvi: {len(failed)} months could not be fetched; run again to retry them")
    months, monthly, grid = load_ndvi()
    years, annual, per_year = annual_means(
        monthly, months, NDVI_MIN_MONTHS, NDVI_FIRST_YEAR, NDVI_LAST_YEAR
    )
    short = {y: n for y, n in per_year.items() if n < 12}
    log(
        f"ndvi: months {months[0]}-{months[-1]} ({len(months)}), years {years[0]}-{years[-1]}, "
        f"grid {grid['nlat']}x{grid['nlon']} from {grid['lat0']},{grid['lon0']}, "
        f"years with fewer than 12 months: {short or 'none'}"
    )
    gmean = area_weighted_mean(annual, grid)
    lo, hi = NDVI_PLAUSIBLE_MEAN
    if not lo <= gmean <= hi:
        raise ValueError(f"ndvi: area-weighted mean {gmean:.4g} outside {lo}..{hi}")
    entry = bpg.build_products("ndvi", annual, years, grid, dict(NDVI_META))
    entry.pop("param")
    log_entry("ndvi", entry, gmean)
    return entry


# ---------------------------------------------------------------------------------------------
# Checks and bookkeeping
# ---------------------------------------------------------------------------------------------


def log_entry(var_id: str, entry: dict, gmean: float) -> None:
    s = entry["summary"]
    log(
        f"{var_id}: mean {gmean:.4g}, valid {s['validCells']}, sig up/down {s['sigUp']}/"
        f"{s['sigDown']}, FDR up/down {s['fdrUp']}/{s['fdrDown']}, area-weighted mean slope "
        f"{s['areaWeightedMeanSlope']} {entry['units']}/decade, slopeRange {entry['slopeRange']}"
    )
    for key in ("up", "down"):
        log(
            f"{var_id}: strongest {key}: "
            + "; ".join(f"({e['lat']}, {e['lon']}) {e['slope']}" for e in entry["extremes"][key])
        )


def read_trend(var_id: str, grid: dict) -> dict[str, np.ndarray]:
    import gzip

    raw = gzip.decompress((bpg.OUT_GRID / f"{var_id}.trend.bin.gz").read_bytes())
    a = np.frombuffer(raw, dtype="<f4").reshape(4, grid["nlat"] * grid["nlon"])
    return {"slope": a[0], "p": a[1], "mean": a[2], "sig": a[3]}


def report_checks(var_id: str, entry: dict) -> None:
    grid = entry["grid"]
    t = read_trend(var_id, grid)
    lats, lons = bpg.grid_coords(grid)
    for name, la, lo in CHECK_POINTS.get(var_id, []):
        r = int(np.argmin(np.abs(lats - la)))
        c = int(np.argmin(np.abs(lons - lo)))
        i = r * grid["nlon"] + c
        log(
            f"{var_id} check {name} ({lats[r]:.3f}, {lons[c]:.3f}): slope "
            f"{t['slope'][i]:.4g} {entry['units']}/decade, p {t['p'][i]:.3g}, "
            f"sig {t['sig'][i]:.0f}, mean {t['mean'][i]:.4g}"
        )
    lat, lon = bpg.cell_lat_lon(grid)
    w = bpg.area_weights(lat)
    for name, s, n, west, east in CHECK_BOXES.get(var_id, []):
        box = (lat >= s) & (lat <= n) & (lon >= west) & (lon <= east) & np.isfinite(t["slope"])
        if not box.any():
            log(f"{var_id} box {name}: no valid cells")
            continue
        wm = float(np.sum(t["slope"][box] * w[box]) / w[box].sum())
        up = float(np.mean((t["sig"][box] == 2) & (t["slope"][box] > 0)))
        down = float(np.mean((t["sig"][box] == 2) & (t["slope"][box] < 0)))
        log(
            f"{var_id} box {name}: {int(box.sum())} cells, area-weighted mean slope {wm:.4g} "
            f"{entry['units']}/decade, FDR-significant rise {up:.0%}, fall {down:.0%}"
        )


def code_mtime() -> float:
    return max(
        Path(bpg.grid_stats.__file__).stat().st_mtime,
        Path(bpg.__file__).stat().st_mtime,
        Path(bog.__file__).stat().st_mtime,
        Path(__file__).stat().st_mtime,
    )


def input_mtime(var_id: str) -> float | None:
    if var_id == "tws":
        return TWS_FILE.stat().st_mtime if TWS_FILE.exists() else None
    files = list(NDVI_DIR.glob("MOD13C2.??????.npz"))
    return max(f.stat().st_mtime for f in files) if files else None


def up_to_date(var_id: str) -> bool:
    src = input_mtime(var_id)
    outs = bpg.outputs_for(var_id)
    return (
        src is not None
        and var_id in bpg.vars_json_ids()
        and all(o.exists() for o in outs)
        and min(o.stat().st_mtime for o in outs) > max(src, code_mtime())
    )


def main(argv: list[str] | None = None) -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawTextHelpFormatter)
    ap.add_argument("--only", choices=["tws", "ndvi"], help="build one id (default: both)")
    ap.add_argument("--force", action="store_true", help="rebuild even when outputs are up to date")
    ap.add_argument("--refresh", action="store_true", help="download fresh copies first")
    ap.add_argument("--workers", type=int, default=6, help="parallel OPeNDAP requests (ndvi)")
    args = ap.parse_args(argv)

    token = load_token()
    failed = []
    for var_id in [args.only] if args.only else ["tws", "ndvi"]:
        try:
            # For ndvi, fetch_ndvi first picks up any new months, so up_to_date sees them.
            if (
                not (args.force or args.refresh)
                and (var_id == "tws" or not fetch_ndvi(token, False, args.workers))
                and up_to_date(var_id)
            ):
                log(f"{var_id}: up to date, skip")
                continue
            if var_id == "tws":
                entry = build_tws(EarthdataSession(token), args.refresh)
            else:
                entry = build_ndvi(token, args.refresh, args.workers)
            bpg.update_vars_json([entry])
            report_checks(var_id, entry)
        except Exception as exc:
            log(f"{var_id}: FAILED {exc!r}")
            failed.append(var_id)
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
