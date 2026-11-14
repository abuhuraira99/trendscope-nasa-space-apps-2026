"""Download NASA POWER monthly global grids from the public AWS Open Data Zarr stores.

NASA POWER publishes its full archive as analysis-ready Zarr on AWS (bucket `nasa-power`, no login).
Each monthly variable is stored with one compressed chunk per month covering the whole planet, so a
global 45-year record is a few hundred HTTPS requests instead of hundreds of API calls.

Output per variable: data/raw/power_zarr/<PARAM>.annual.npz with
    years   int32 [Y]
    lat     float64 [nlat]  (south to north)
    lon     float64 [nlon]  (-180 to 180)
    annual  float32 [Y, nlat, nlon]  annual mean (or sum for degree-day totals);
                                     NaN when fewer than 10 months
    count   int8    [Y, nlat, nlon]  months used
Only complete calendar years (12 published months) are kept.

Usage:
    python pipeline/fetch_power_zarr.py merra2:T2M merra2:PRECTOTCORR syn1deg:AOD_55_ADJ ...
"""

from __future__ import annotations

import json
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import date, timedelta
from pathlib import Path

import numcodecs
import numpy as np
import requests

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "raw" / "power_zarr"
BUCKET = "https://nasa-power.s3.amazonaws.com"
STORES = {
    "merra2": "merra2/spatial/power_merra2_monthly_spatial_utc.zarr",
    "syn1deg": "syn1deg/spatial/power_syn1deg_monthly_spatial_utc.zarr",
}
SUM_VARS = {"CDD18_3", "CDD10", "CDD0", "HDD18_3", "HDD10", "HDD0", "FROST_DAYS"}
WORKERS = 24

session = requests.Session()
session.headers["User-Agent"] = "TrendScope/0.1 (NASA Space Apps 2026 research project)"


def get_json(url: str) -> dict:
    r = session.get(url, timeout=120)
    r.raise_for_status()
    return r.json()


def get_bytes(url: str) -> bytes | None:
    for attempt in range(6):
        try:
            r = session.get(url, timeout=180)
            if r.status_code == 200:
                return r.content
            if r.status_code in (403, 404):
                return None
        except requests.RequestException:
            pass
        time.sleep(2 * (attempt + 1))
    raise RuntimeError(f"failed: {url}")


def decode(raw: bytes, meta: dict) -> np.ndarray:
    comp = numcodecs.get_codec(meta["compressor"]) if meta.get("compressor") else None
    buf = comp.decode(raw) if comp else raw
    arr = np.frombuffer(buf, dtype=np.dtype(meta["dtype"]))
    for flt in reversed(meta.get("filters") or []):
        arr = numcodecs.get_codec(flt).decode(arr)
    return np.asarray(arr, dtype=np.float32).reshape(meta["chunks"][1:])


def months_from_time(store_url: str, zmeta: dict) -> list[tuple[int, int]]:
    tmeta = zmeta["time/.zarray"]
    units = zmeta["time/.zattrs"]["units"]  # "days since YYYY-MM-DD ..."
    base = date.fromisoformat(units.split("since")[1].strip().split()[0])
    raw = get_bytes(f"{store_url}/time/0")
    comp = numcodecs.get_codec(tmeta["compressor"])
    days = np.frombuffer(comp.decode(raw), dtype=np.dtype(tmeta["dtype"]))
    out = []
    for d in days:
        dt = base + timedelta(days=int(d))
        out.append((dt.year, dt.month))
    return out


def fetch(store: str, param: str) -> None:
    out = OUT / f"{param}.annual.npz"
    if out.exists():
        print(f"{param}: cached", flush=True)
        return
    store_url = f"{BUCKET}/{STORES[store]}"
    zmeta = get_json(f"{store_url}/.zmetadata")["metadata"]
    meta = zmeta[f"{param}/.zarray"]
    attrs = zmeta.get(f"{param}/.zattrs", {})
    fill = meta.get("fill_value")
    vmin, vmax = attrs.get("valid_min", -1e30), attrs.get("valid_max", 1e30)
    months = months_from_time(store_url, zmeta)
    lat = decode_coord(store_url, zmeta, "lat")
    lon = decode_coord(store_url, zmeta, "lon")
    nlat, nlon = meta["chunks"][1], meta["chunks"][2]

    years = sorted({y for y, _ in months})
    ysum = {y: np.zeros((nlat, nlon), np.float64) for y in years}
    ycnt = {y: np.zeros((nlat, nlon), np.int16) for y in years}
    published = {y: 0 for y in years}

    def job(t: int):
        raw = get_bytes(f"{store_url}/{param}/{t}.0.0")
        if raw is None:
            return t, None
        a = decode(raw, meta)
        if isinstance(fill, (int, float)) and np.isfinite(fill):
            a = np.where(a == fill, np.nan, a)
        a = np.where((a < vmin) | (a > vmax), np.nan, a)
        return t, a

    t0 = time.time()
    with ThreadPoolExecutor(WORKERS) as ex:
        for i, (t, a) in enumerate(ex.map(job, range(len(months))), 1):
            if a is None or not np.isfinite(a).any():
                continue
            y = months[t][0]
            ok = np.isfinite(a)
            ysum[y][ok] += a[ok]
            ycnt[y] += ok
            published[y] += 1
            if i % 100 == 0:
                print(f"{param}: {i}/{len(months)} chunks {time.time() - t0:.0f}s", flush=True)

    keep = [y for y in years if published[y] == 12]
    annual = np.full((len(keep), nlat, nlon), np.nan, np.float32)
    count = np.zeros((len(keep), nlat, nlon), np.int8)
    for k, y in enumerate(keep):
        c = ycnt[y]
        valid = c >= 10
        if param in SUM_VARS:
            vals = ysum[y] * (12.0 / np.maximum(c, 1))
        else:
            vals = ysum[y] / np.maximum(c, 1)
        annual[k][valid] = vals[valid]
        count[k] = c
    order = np.argsort(lat)
    annual, count, lat = annual[:, order, :], count[:, order, :], lat[order]
    if lon.max() > 180:
        lon = np.where(lon > 180, lon - 360, lon)
        o = np.argsort(lon)
        annual, count, lon = annual[:, :, o], count[:, :, o], lon[o]
    OUT.mkdir(parents=True, exist_ok=True)
    tmp = out.with_name(out.stem + ".part.npz")
    np.savez_compressed(
        tmp,
        years=np.array(keep, np.int32),
        lat=lat,
        lon=lon,
        annual=annual,
        count=count,
        units=attrs.get("units", ""),
        long_name=attrs.get("long_name", param),
        store=store,
    )
    tmp.replace(out)
    print(
        f"DONE {param}: years {keep[0]}-{keep[-1]} grid {nlat}x{nlon} in {time.time() - t0:.0f}s",
        flush=True,
    )
    (OUT / f"{param}.meta.json").write_text(
        json.dumps(
            {
                "store": store,
                "years": [keep[0], keep[-1]],
                "units": attrs.get("units"),
                "attrs": attrs,
            }
        )
    )


def decode_coord(store_url: str, zmeta: dict, name: str) -> np.ndarray:
    m = zmeta[f"{name}/.zarray"]
    raw = get_bytes(f"{store_url}/{name}/0")
    comp = numcodecs.get_codec(m["compressor"])
    return np.frombuffer(comp.decode(raw), dtype=np.dtype(m["dtype"])).astype(np.float64)


if __name__ == "__main__":
    for spec in sys.argv[1:]:
        store, param = spec.split(":")
        try:
            fetch(store, param)
        except Exception as exc:
            print(f"FAIL {param}: {exc!r}", flush=True)
