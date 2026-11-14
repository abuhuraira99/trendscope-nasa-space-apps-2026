"""Add area-weighted shares of significant trends to web/public/data/vars.json.

Cell counts overweight the poles on a latitude-longitude grid, so the app quotes the share of the
mapped area (each cell weighted by the cosine of its latitude) whose trend passes the false
discovery rate test, split by direction. Run after any grid build:

    python pipeline/add_area_shares.py
"""

from __future__ import annotations

import gzip
import json
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "web" / "public" / "data"


def main() -> None:
    path = DATA / "vars.json"
    catalogue = json.loads(path.read_text(encoding="utf-8"))
    for meta in catalogue["vars"]:
        grid = meta["grid"]
        n = grid["nlat"] * grid["nlon"]
        raw = gzip.decompress((DATA / "grid" / f"{meta['id']}.trend.bin.gz").read_bytes())
        fields = np.frombuffer(raw, dtype="<f4")
        slope, sig = fields[:n], fields[3 * n : 4 * n]
        lat = grid["lat0"] + np.arange(grid["nlat"]) * grid["dlat"]
        weight = np.repeat(np.cos(np.deg2rad(lat)).clip(0), grid["nlon"])
        valid = np.isfinite(slope)
        total = weight[valid].sum()
        up = valid & (sig >= 1.5) & (slope > 0)
        down = valid & (sig >= 1.5) & (slope < 0)
        meta["summary"]["areaUp"] = round(float(weight[up].sum() / total), 4)
        meta["summary"]["areaDown"] = round(float(weight[down].sum() / total), 4)
        print(f"{meta['id']:8s} up {meta['summary']['areaUp']:.3f} down {meta['summary']['areaDown']:.3f}")
    path.write_text(json.dumps(catalogue, indent=2, ensure_ascii=False), encoding="utf-8")


if __name__ == "__main__":
    main()
