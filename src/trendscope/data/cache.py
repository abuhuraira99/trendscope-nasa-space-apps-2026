"""Local Parquet cache for NASA data queries.

Each unique request is hashed into a file name under ``data/cache/``.
A repeated request reads the cached Parquet file and makes no network call.

Owner: Zawar. See docs/team.md.
"""

from __future__ import annotations

import hashlib
import json
import logging
from pathlib import Path
from typing import TYPE_CHECKING

import pandas as pd

if TYPE_CHECKING:
    from trendscope.data.regions import Region

logger = logging.getLogger(__name__)

_CACHE_DIR = Path("data/cache")


# ------------------------------------------------------------------
# Public API
# ------------------------------------------------------------------


def cache_key(
    variable_id: str,
    *,
    region: Region | None = None,
    latitude: float | None = None,
    longitude: float | None = None,
    start_year: int = 2001,
    end_year: int = 2023,
) -> str:
    """Build a deterministic file-safe key from the request parameters.

    Returns a hex digest string used as the Parquet file stem.
    """
    parts: dict[str, object] = {
        "variable": variable_id,
        "start": start_year,
        "end": end_year,
    }
    if region is not None:
        parts["region"] = region.name
    else:
        parts["lat"] = latitude
        parts["lon"] = longitude

    raw = json.dumps(parts, sort_keys=True)
    return hashlib.sha256(raw.encode()).hexdigest()[:24]


def get_cached(key: str, cache_dir: Path = _CACHE_DIR) -> pd.DataFrame | None:
    """Return the cached DataFrame for *key*, or ``None`` on a miss.

    Metadata stored when the file was written is restored into ``df.attrs``.
    """
    path = cache_dir / f"{key}.parquet"
    if not path.exists():
        logger.debug("Cache miss: %s", path)
        return None
    logger.debug("Cache hit: %s", path)
    df = pd.read_parquet(path)

    # Restore attrs stored as extra columns prefixed with "__attr_".
    attrs: dict[str, str] = {}
    attr_cols = [c for c in df.columns if c.startswith("__attr_")]
    for col in attr_cols:
        attrs[col.removeprefix("__attr_")] = str(df[col].iloc[0])
    df = df.drop(columns=attr_cols)
    df.attrs.update(attrs)

    return df


def put_cached(
    key: str,
    df: pd.DataFrame,
    cache_dir: Path = _CACHE_DIR,
) -> Path:
    """Write *df* (with its ``attrs``) to the cache and return the file path."""
    cache_dir.mkdir(parents=True, exist_ok=True)
    path = cache_dir / f"{key}.parquet"

    # Parquet doesn't natively store pandas attrs, so we embed them as
    # single-value columns prefixed with "__attr_".
    to_save = df.copy()
    for attr_key, attr_val in df.attrs.items():
        to_save[f"__attr_{attr_key}"] = str(attr_val)

    to_save.to_parquet(path, index=False)
    logger.debug("Cached to %s", path)
    return path


def fetch_with_cache(
    variable_id: str,
    *,
    region: Region | None = None,
    latitude: float | None = None,
    longitude: float | None = None,
    start_year: int = 2001,
    end_year: int = 2023,
    cache_dir: Path = _CACHE_DIR,
) -> pd.DataFrame:
    """Fetch data, using the local cache when available.

    On a cache miss this calls :func:`trendscope.data.power.fetch_power_monthly`
    and stores the result before returning it.

    Returns:
        The standard TrendScope DataFrame.
    """
    from trendscope.data.power import fetch_power_monthly

    key = cache_key(
        variable_id,
        region=region,
        latitude=latitude,
        longitude=longitude,
        start_year=start_year,
        end_year=end_year,
    )

    cached = get_cached(key, cache_dir=cache_dir)
    if cached is not None:
        return cached

    df = fetch_power_monthly(
        variable_id,
        region=region,
        latitude=latitude,
        longitude=longitude,
        start_year=start_year,
        end_year=end_year,
    )

    put_cached(key, df, cache_dir=cache_dir)
    return df
