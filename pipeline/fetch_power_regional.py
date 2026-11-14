"""Download global monthly NASA POWER data, one 10x10 degree block at a time.

NASA POWER (https://power.larc.nasa.gov) serves MERRA-2, GPM IMERG and CERES based variables on a
0.5 x 0.625 degree grid. Its regional endpoint accepts one parameter and at most a 10 x 10 degree box
per request, so a global field needs 648 requests per parameter.

Each block is cached as a compressed .npz in data/raw/power/<PARAM>/ and skipped on re-runs.

Usage:
    python pipeline/fetch_power_regional.py T2M PRECTOTCORR ...
"""

from __future__ import annotations

import json
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import numpy as np
import requests

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw" / "power"
URL = "https://power.larc.nasa.gov/api/temporal/monthly/regional"
START, END = 1981, 2025
WORKERS = 4

session = requests.Session()
session.headers["User-Agent"] = "TrendScope/0.1 (NASA Space Apps 2026 research project)"


def boxes() -> list[tuple[int, int]]:
    return [(lat, lon) for lat in range(-90, 90, 10) for lon in range(-180, 180, 10)]


def fetch_box(param: str, lat0: int, lon0: int) -> str:
    out = RAW / param / f"box_{lat0:+04d}_{lon0:+05d}.npz"
    if out.exists():
        return "cached"
    params = {
        "parameters": param,
        "community": "AG",
        "latitude-min": lat0,
        "latitude-max": lat0 + 10,
        "longitude-min": lon0,
        "longitude-max": lon0 + 10,
        "start": START,
        "end": END,
        "format": "JSON",
    }
    last_err = ""
    for attempt in range(6):
        try:
            r = session.get(URL, params=params, timeout=240)
            if r.status_code == 200:
                data = r.json()
                feats = data.get("features", [])
                if not feats:
                    last_err = f"no features: {str(data)[:200]}"
                    break
                keys = sorted(k for k in feats[0]["properties"]["parameter"][param] if not k.endswith("13"))
                lons = np.array([f["geometry"]["coordinates"][0] for f in feats], dtype=np.float32)
                lats = np.array([f["geometry"]["coordinates"][1] for f in feats], dtype=np.float32)
                vals = np.array(
                    [[f["properties"]["parameter"][param].get(k, -999.0) for k in keys] for f in feats],
                    dtype=np.float32,
                )
                vals[vals <= -998] = np.nan
                out.parent.mkdir(parents=True, exist_ok=True)
                tmp = out.with_name(out.stem + ".part.npz")
                np.savez_compressed(tmp, lats=lats, lons=lons, months=np.array(keys), values=vals.astype(np.float32))
                tmp.replace(out)
                return "ok"
            last_err = f"HTTP {r.status_code}: {r.text[:200]}"
            if r.status_code in (400, 422):
                break
        except Exception as exc:  # network hiccups, JSON errors
            last_err = repr(exc)[:200]
        time.sleep(4 * (attempt + 1))
    log(f"FAIL {param} {lat0} {lon0}: {last_err}")
    return "fail"


def log(msg: str) -> None:
    line = f"{time.strftime('%H:%M:%S')} {msg}"
    print(line, flush=True)
    with open(RAW / "fetch.log", "a", encoding="utf-8") as fh:
        fh.write(line + "\n")


def run(param: str) -> None:
    todo = boxes()
    t0 = time.time()
    counts: dict[str, int] = {}
    with ThreadPoolExecutor(WORKERS) as ex:
        futs = {ex.submit(fetch_box, param, la, lo): (la, lo) for la, lo in todo}
        for i, fut in enumerate(as_completed(futs), 1):
            status = fut.result()
            counts[status] = counts.get(status, 0) + 1
            if i % 50 == 0:
                log(f"{param}: {i}/{len(todo)} {counts} {time.time() - t0:.0f}s")
    log(f"DONE {param}: {counts} in {time.time() - t0:.0f}s")
    (RAW / param / "_done.json").write_text(json.dumps(counts))


if __name__ == "__main__":
    RAW.mkdir(parents=True, exist_ok=True)
    for p in sys.argv[1:]:
        run(p)
