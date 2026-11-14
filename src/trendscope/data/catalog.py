"""Catalogue of NASA Earth science variables available in TrendScope.

Each entry carries the metadata the data layer and the UI both need:
an id, a human-readable display name, the NASA data source, the API
parameter code, physical units and time resolution.

Owner: Zawar. See docs/team.md.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class Variable:
    """One measurable quantity available through TrendScope.

    Attributes:
        id: Short machine-readable key, e.g. ``"temperature"``.
        display_name: Label shown in the UI.
        source: NASA data service name, e.g. ``"NASA POWER"``.
        parameter: API parameter code sent to the service.
        units: Physical units string.
        resolution: Temporal resolution, e.g. ``"monthly"``.
    """

    id: str
    display_name: str
    source: str
    parameter: str
    units: str
    resolution: str


# ------------------------------------------------------------------
# Variable catalogue (~8 entries as specified in the role brief)
# ------------------------------------------------------------------
# NASA POWER parameter names are documented at
# https://power.larc.nasa.gov/#/resources/parameters

_ALL_VARIABLES: tuple[Variable, ...] = (
    Variable(
        id="temperature",
        display_name="Temperature (2 m)",
        source="NASA POWER",
        parameter="T2M",
        units="°C",
        resolution="monthly",
    ),
    Variable(
        id="max_temperature",
        display_name="Maximum Temperature (2 m)",
        source="NASA POWER",
        parameter="T2M_MAX",
        units="°C",
        resolution="monthly",
    ),
    Variable(
        id="rainfall",
        display_name="Rainfall",
        source="NASA POWER",
        parameter="PRECTOTCORR",
        units="mm/day",
        resolution="monthly",
    ),
    Variable(
        id="humidity",
        display_name="Relative Humidity (2 m)",
        source="NASA POWER",
        parameter="RH2M",
        units="%",
        resolution="monthly",
    ),
    Variable(
        id="wind",
        display_name="Wind Speed (10 m)",
        source="NASA POWER",
        parameter="WS10M",
        units="m/s",
        resolution="monthly",
    ),
    Variable(
        id="solar_radiation",
        display_name="All-Sky Surface Shortwave Downward Irradiance",
        source="NASA POWER",
        parameter="ALLSKY_SFC_SW_DWN",
        units="kW-hr/m²/day",
        resolution="monthly",
    ),
    Variable(
        id="soil_moisture",
        display_name="Soil Moisture (Root Zone)",
        source="NASA POWER",
        parameter="GWETROOT",
        units="fraction",
        resolution="monthly",
    ),
    Variable(
        id="vegetation",
        display_name="Vegetation Index (NDVI)",
        source="MODIS",
        parameter="NDVI",
        units="index",
        resolution="monthly",
    ),
)


def get_variable(variable_id: str) -> Variable:
    """Look up a variable by its *id* (case-insensitive).

    Raises:
        KeyError: If no variable matches.
    """
    key = variable_id.strip().lower()
    for var in _ALL_VARIABLES:
        if var.id.lower() == key:
            return var
    available = ", ".join(v.id for v in _ALL_VARIABLES)
    raise KeyError(f"Unknown variable {variable_id!r}. Available: {available}")


def list_variables() -> Sequence[Variable]:
    """Return every catalogued variable."""
    return _ALL_VARIABLES


def power_variables() -> Sequence[Variable]:
    """Return only the variables served by NASA POWER."""
    return tuple(v for v in _ALL_VARIABLES if v.source == "NASA POWER")
