"""Clients that fetch NASA Earth science time series and cache them locally.

Owner: Zawar. See docs/team.md.

Public surface (import from here, not from sub-modules):

* **Regions**: :func:`get_region`, :func:`list_regions`, :class:`Region`
* **Variable catalogue**: :func:`get_variable`, :func:`list_variables`,
  :func:`power_variables`, :class:`Variable`
* **NASA POWER**: :func:`fetch_power_monthly`
* **Cache**: :func:`fetch_with_cache`
"""

from trendscope.data.cache import fetch_with_cache
from trendscope.data.catalog import (
    Variable,
    get_variable,
    list_variables,
    power_variables,
)
from trendscope.data.power import fetch_power_monthly
from trendscope.data.regions import Region, get_region, list_regions

__all__ = [
    "Region",
    "Variable",
    "fetch_power_monthly",
    "fetch_with_cache",
    "get_region",
    "get_variable",
    "list_regions",
    "list_variables",
    "power_variables",
]
