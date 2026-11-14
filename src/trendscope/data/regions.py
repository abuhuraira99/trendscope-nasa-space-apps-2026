"""Named geographic regions as bounding boxes for NASA data queries.

Each region is stored as (south, west, north, east) in decimal degrees.
Latitudes range from -90 to 90; longitudes from -180 to 180.

Owner: Zawar. See docs/team.md.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class Region:
    """An axis-aligned bounding box on the globe.

    Attributes:
        name: Human-readable label, e.g. ``"Lahore"``.
        south: Southern latitude bound (degrees, -90 to 90).
        west: Western longitude bound (degrees, -180 to 180).
        north: Northern latitude bound (degrees, -90 to 90).
        east: Eastern longitude bound (degrees, -180 to 180).
    """

    name: str
    south: float
    west: float
    north: float
    east: float

    @property
    def center_lat(self) -> float:
        """Latitude of the bounding-box centre."""
        return (self.south + self.north) / 2

    @property
    def center_lon(self) -> float:
        """Longitude of the bounding-box centre."""
        return (self.west + self.east) / 2

    def is_valid(self) -> bool:
        """Return *True* when the box has physically sensible coordinates."""
        return -90 <= self.south <= self.north <= 90 and -180 <= self.west <= self.east <= 180


# ------------------------------------------------------------------
# Preset regions
# ------------------------------------------------------------------

# Pakistan cities
LAHORE = Region(name="Lahore", south=31.35, west=74.20, north=31.65, east=74.45)
KARACHI = Region(name="Karachi", south=24.75, west=66.85, north=25.05, east=67.25)
ISLAMABAD = Region(name="Islamabad", south=33.55, west=72.85, north=33.80, east=73.15)

# Pakistan provinces
PUNJAB = Region(name="Punjab", south=27.70, west=69.30, north=34.00, east=75.40)
SINDH = Region(name="Sindh", south=23.60, west=66.50, north=28.50, east=71.10)

# Pakistan country
PAKISTAN = Region(name="Pakistan", south=23.60, west=60.85, north=37.10, east=77.85)

# International examples
AMAZON = Region(name="Amazon", south=-10.0, west=-70.0, north=2.0, east=-50.0)
SAHARA = Region(name="Sahara", south=18.0, west=-10.0, north=30.0, east=30.0)

# Master list – order does not matter; look-up is by name.
_ALL_REGIONS: tuple[Region, ...] = (
    LAHORE,
    KARACHI,
    ISLAMABAD,
    PUNJAB,
    SINDH,
    PAKISTAN,
    AMAZON,
    SAHARA,
)


def get_region(name: str) -> Region:
    """Look up a preset region by *name* (case-insensitive).

    Raises:
        KeyError: If no region matches.
    """
    key = name.strip().lower()
    for region in _ALL_REGIONS:
        if region.name.lower() == key:
            return region
    available = ", ".join(r.name for r in _ALL_REGIONS)
    raise KeyError(f"Unknown region {name!r}. Available: {available}")


def list_regions() -> Sequence[Region]:
    """Return all preset regions."""
    return _ALL_REGIONS
