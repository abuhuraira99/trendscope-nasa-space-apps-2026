"""Save offline copies of NASA POWER point data for the curated case locations.

Reads pipeline/cases.json, a list like

    [{"id": "lahore-heat", "lat": 31.52, "lon": 74.36, "params": ["T2M", "PRECTOTCORR"]}]

and for each case saves the raw POWER monthly point response (community AG, 1981 to the last
complete year, all parameters of the case in one request) to web/public/data/cases/<id>.json.
The web app reads these files when NASA POWER cannot be reached.

POWER accepts at most 20 parameters per request. A case with more is fetched in several requests
and merged into one file with the same layout.

Existing files are skipped unless --refresh is given. If pipeline/cases.json does not exist yet,
a one-case sample for Lahore is written so the script can be tried.

Usage:
    python pipeline/fetch_cases.py               # fetch missing case files
    python pipeline/fetch_cases.py --refresh     # fetch all again
    python pipeline/fetch_cases.py lahore-heat   # only these case ids
"""

from __future__ import annotations

import argparse
import copy
import json
import re
import sys
import time
from datetime import date
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parents[1]
CASES_JSON = ROOT / "pipeline" / "cases.json"
OUT = ROOT / "web" / "public" / "data" / "cases"
URL = "https://power.larc.nasa.gov/api/temporal/monthly/point"
START = 1981
MAX_PARAMS = 20

SAMPLE = [
    {
        "id": "lahore-heat",
        "lat": 31.52,
        "lon": 74.36,
        "params": ["T2M", "T2M_MAX_AVG", "T2MWET", "PRECTOTCORR", "GWETROOT"],
    }
]

session = requests.Session()
session.headers["User-Agent"] = "TrendScope/0.1 (NASA Space Apps 2026 research project)"


def log(msg: str) -> None:
    print(f"{time.strftime('%H:%M:%S')} {msg}", flush=True)


def last_complete_year() -> int:
    return date.today().year - 1


def fetch_point(lat: float, lon: float, params: list[str], end: int) -> dict:
    query = {
        "parameters": ",".join(params),
        "community": "AG",
        "latitude": lat,
        "longitude": lon,
        "start": START,
        "end": end,
        "format": "JSON",
    }
    last = ""
    for attempt in range(1, 6):
        try:
            r = session.get(URL, params=query, timeout=180)
            if r.status_code == 200:
                data = r.json()
                got = data.get("properties", {}).get("parameter", {})
                missing = [p for p in params if p not in got]
                if missing:
                    raise ValueError(f"response lacks {missing}")
                return data
            last = f"HTTP {r.status_code}: {r.text[:300]}"
            if r.status_code in (400, 422):  # bad parameter name or location: do not retry
                break
        except (requests.RequestException, ValueError) as exc:
            last = repr(exc)[:300]
        time.sleep(3 * attempt)
    raise RuntimeError(last)


def merge(parts: list[dict]) -> dict:
    """Combine responses for the same point that cover different parameters."""
    out = copy.deepcopy(parts[0])
    for extra in parts[1:]:
        out["properties"]["parameter"].update(extra["properties"]["parameter"])
        if "parameters" in out and "parameters" in extra:
            out["parameters"].update(extra["parameters"])
    return out


def validate(case: dict) -> None:
    if not re.fullmatch(r"[a-z0-9][a-z0-9-]*", str(case.get("id", ""))):
        raise ValueError(f"bad case id {case.get('id')!r} (use lowercase letters, digits, dashes)")
    if not (-90 <= float(case["lat"]) <= 90 and -180 <= float(case["lon"]) <= 180):
        raise ValueError(f"{case['id']}: coordinates out of range")
    if not case.get("params"):
        raise ValueError(f"{case['id']}: no params")


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawTextHelpFormatter)
    ap.add_argument("ids", nargs="*", help="case ids to fetch (default: all)")
    ap.add_argument("--refresh", action="store_true", help="fetch again even if the file exists")
    args = ap.parse_args(argv)

    if not CASES_JSON.exists():
        CASES_JSON.write_text(json.dumps(SAMPLE, indent=2) + "\n", encoding="utf-8")
        log(f"{CASES_JSON.name} not found, wrote a one-case sample")
    cases = json.loads(CASES_JSON.read_text(encoding="utf-8"))
    if args.ids:
        cases = [c for c in cases if c.get("id") in set(args.ids)]
    end = last_complete_year()
    OUT.mkdir(parents=True, exist_ok=True)

    failed = []
    for case in cases:
        try:
            validate(case)
        except (KeyError, ValueError) as exc:
            log(f"skip: {exc}")
            failed.append(str(case.get("id")))
            continue
        out = OUT / f"{case['id']}.json"
        if out.exists() and not args.refresh:
            log(f"{case['id']}: exists, skip")
            continue
        params = list(dict.fromkeys(p.strip() for p in case["params"]))  # unique, in order
        if len(params) > MAX_PARAMS:
            log(f"{case['id']}: {len(params)} params, POWER allows {MAX_PARAMS}; splitting")
        try:
            parts = [
                fetch_point(case["lat"], case["lon"], params[k : k + MAX_PARAMS], end)
                for k in range(0, len(params), MAX_PARAMS)
            ]
        except RuntimeError as exc:
            log(f"{case['id']}: FAILED {exc}")
            failed.append(case["id"])
            continue
        data = merge(parts)
        tmp = out.with_name(out.name + ".tmp")
        tmp.write_text(json.dumps(data, separators=(",", ":")), encoding="utf-8")
        tmp.replace(out)
        log(f"{case['id']}: {len(params)} params, {START}-{end}, {out.stat().st_size / 1e3:.0f} kB")
    if failed:
        log(f"failed: {failed}")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
