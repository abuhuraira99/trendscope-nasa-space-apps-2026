"""Client for the NASA POWER monthly API.

Downloads a monthly time series for a single variable and region (or point),
returning the standard TrendScope DataFrame (columns: ``time``, ``value``;
attrs: ``variable``, ``units``, ``source``, ``region``).

Owner: Zawar. See docs/team.md.
"""

from __future__ import annotations

import datetime as dt
import logging
from typing import TYPE_CHECKING

import numpy as np
import pandas as pd
import requests

from trendscope.data.catalog import get_variable

if TYPE_CHECKING:
    from trendscope.data.regions import Region

logger = logging.getLogger(__name__)

_POWER_BASE_URL = "https://power.larc.nasa.gov/api/temporal/monthly"
_TIMEOUT_SECONDS = 30
_MAX_RETRIES = 3
_MISSING_VALUE = -999.0


# ------------------------------------------------------------------
# Public API
# ------------------------------------------------------------------


def fetch_power_monthly(
    variable_id: str,
    *,
    region: Region | None = None,
    latitude: float | None = None,
    longitude: float | None = None,
    start_year: int = 2001,
    end_year: int = 2023,
    session: requests.Session | None = None,
) -> pd.DataFrame:
    """Fetch a monthly time series from the NASA POWER API.

    Either *region* **or** the pair (*latitude*, *longitude*) must be
    provided.  When a *region* is given the centre point of its bounding
    box is used (POWER's ``point`` community endpoint).

    Parameters:
        variable_id: One of the ids from :mod:`trendscope.data.catalog`.
        region: A :class:`~trendscope.data.regions.Region` bounding box.
        latitude: Point latitude (-90 to 90).
        longitude: Point longitude (-180 to 180).
        start_year: First calendar year of data to request.
        end_year: Last calendar year of data to request (inclusive).
        session: Optional :class:`requests.Session` for connection reuse
            or mocking in tests.

    Returns:
        A :class:`pandas.DataFrame` with columns ``time`` and ``value``
        and metadata in ``df.attrs``.

    Raises:
        ValueError: When neither a region nor a point is provided.
        requests.HTTPError: On an unsuccessful API response after retries.
    """
    var = get_variable(variable_id)
    if var.source != "NASA POWER":
        raise ValueError(f"Variable {variable_id!r} is served by {var.source}, not NASA POWER.")

    lat, lon, region_label = _resolve_location(region, latitude, longitude)

    raw = _call_power_api(
        parameter=var.parameter,
        latitude=lat,
        longitude=lon,
        start_year=start_year,
        end_year=end_year,
        session=session or requests.Session(),
    )

    df = _parse_response(raw, parameter=var.parameter)

    # Attach metadata the rest of the pipeline expects.
    df.attrs["variable"] = var.id
    df.attrs["units"] = var.units
    df.attrs["source"] = "NASA POWER"
    df.attrs["region"] = region_label

    return df


# ------------------------------------------------------------------
# Internal helpers
# ------------------------------------------------------------------


def _resolve_location(
    region: Region | None,
    latitude: float | None,
    longitude: float | None,
) -> tuple[float, float, str]:
    """Return ``(lat, lon, label)`` from the caller's arguments."""
    if region is not None:
        return region.center_lat, region.center_lon, region.name
    if latitude is not None and longitude is not None:
        return latitude, longitude, f"({latitude}, {longitude})"
    raise ValueError("Provide either a Region or both latitude and longitude.")


def _call_power_api(
    *,
    parameter: str,
    latitude: float,
    longitude: float,
    start_year: int,
    end_year: int,
    session: requests.Session,
) -> dict:
    """Send a GET request to POWER with retries and a timeout.

    Returns the parsed JSON response body.
    """
    url = f"{_POWER_BASE_URL}/point"
    params = {
        "parameters": parameter,
        "community": "RE",
        "longitude": longitude,
        "latitude": latitude,
        "start": start_year,
        "end": end_year,
        "format": "JSON",
    }

    last_exc: Exception | None = None
    for attempt in range(1, _MAX_RETRIES + 1):
        try:
            logger.debug("POWER request attempt %d: %s %s", attempt, url, params)
            resp = session.get(url, params=params, timeout=_TIMEOUT_SECONDS)
            resp.raise_for_status()
            return resp.json()
        except (requests.RequestException, OSError, ValueError) as exc:
            last_exc = exc
            logger.warning("POWER attempt %d failed: %s", attempt, exc)

    raise last_exc  # type: ignore[misc]


def _parse_response(data: dict, *, parameter: str) -> pd.DataFrame:
    """Turn the POWER JSON into the standard TrendScope DataFrame."""
    # The response nests values under properties → parameter → {parameter}.
    param_data: dict[str, float] = data["properties"]["parameter"][parameter]

    records: list[dict[str, object]] = []
    for key, value in param_data.items():
        # Keys are "YYYYMM".  Skip the annual-summary key "...13".
        if len(key) != 6:
            continue
        year = int(key[:4])
        month = int(key[4:])
        if not 1 <= month <= 12:
            continue
        clean_value = np.nan if value == _MISSING_VALUE else float(value)
        records.append({"time": dt.datetime(year, month, 1), "value": clean_value})

    df = pd.DataFrame(records)
    df = df.sort_values("time").reset_index(drop=True)
    df["time"] = pd.to_datetime(df["time"])
    return df
