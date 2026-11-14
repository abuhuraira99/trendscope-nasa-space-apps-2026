# Data sources

Every map and verdict in TrendScope comes from the NASA records below. Full citations, DOIs and
access dates are on the app's Data page: https://trendscope-earth.pages.dev/data

| Record | Variables in TrendScope | Years | Grid in the app | How we read it |
|---|---|---|---|---|
| NASA POWER, MERRA-2 reanalysis (NASA GMAO) | Air temperature, daytime high, wet-bulb temperature, cooling degree days, precipitation, root-zone soil wetness, land evaporation, precipitable water, snow cover, sea ice, total ozone, wind speed | 1981 to 2025 | 1° × 1.25° | POWER's analysis-ready Zarr archive on AWS Open Data |
| NASA POWER, CERES SYN1deg (NASA Langley) | Aerosol optical depth, cloud amount, sunlight at the surface | 2001 to 2025 | 1° | POWER's Zarr archive on AWS Open Data |
| GISTEMP v4 (NASA GISS) | Temperature anomaly from weather stations and ships | 1981 to 2025 | 2° | NetCDF download from data.giss.nasa.gov |
| GPCP v2.3 monthly (NASA GSFC) | Precipitation from satellites and rain gauges | 1981 to 2025 | 2.5° | NetCDF download from NOAA PSL |
| GRACE and GRACE-FO, JPL mascons RL06.3 (NASA PO.DAAC) | Total water storage, including groundwater | 2003 to 2025 | 0.5° | Earthdata Login download |
| MODIS Terra MOD13C2 v061 (NASA LP DAAC) | Vegetation greenness (NDVI) | 2001 to 2025 | 1° (averaged from 0.05°) | OPeNDAP through Earthdata |
| NASA POWER point API | Live monthly data at the exact clicked point, for the seasonal fingerprint | 1981 to the latest month | the clicked point | Called from the browser |

The scripts that download and process each record are in [pipeline/](../pipeline/), with the steps in
[pipeline/README.md](../pipeline/README.md).

## Datasets named in the challenge statement

The challenge suggests MERRA-2, GLDAS, GPM, MODIS, OMI and AIRS. TrendScope uses MERRA-2 and MODIS
directly and covers soil water, ozone and water vapour through the MERRA-2 fields above. For rainfall
it uses MERRA-2 and, as an independent second opinion, GPCP, which merges satellite estimates with
rain gauges. GISTEMP gives the same kind of check for temperature.
