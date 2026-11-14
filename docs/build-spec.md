# TrendScope build spec (internal contract between modules)

Hackathon build, 14 to 15 November 2026. Everything below is the contract between the data
pipeline, the statistics library and the web app. Change it only together with every consumer.

## Stack

- `pipeline/` and `src/trendscope/`: Python 3.14 in `.venv` (numpy, pandas, pymannkendall, requests).
  Run with `.venv/Scripts/python.exe -I`. Never install anything globally.
- `web/`: Vite + React 19 + TypeScript, three.js via @react-three/fiber, d3 (scale, array, geo, shape),
  zustand, motion, react-router-dom, vitest. npm cache is project-local: set
  `npm_config_cache=<repo>/.cache/npm` before any npm command.
- Hosting: Cloudflare Pages (static `web/dist` plus Pages Functions in `web/functions/`).

## Data sources (all NASA, no login)

| Source | Access | Grid | Period |
|---|---|---|---|
| NASA POWER (MERRA-2, CERES) | `https://power.larc.nasa.gov/api/temporal/monthly/{point,regional}` (CORS `*`) | 0.5 lat x 0.625 lon | 1981 to 2025 |
| GISTEMP v4 (NASA GISS) | `https://data.giss.nasa.gov/pub/gistemp/gistemp1200_GHCNv4_ERSSTv5.nc.gz` | 2 x 2 | 1880 to now (use 1981+) |
| GPCP v2.3 monthly (NASA GSFC / NOAA) | `https://downloads.psl.noaa.gov/Datasets/gpcp/precip.mon.mean.nc` | 2.5 x 2.5 | 1979 to now (use 1981+) |

POWER grids come from NASA POWER's public analysis-ready Zarr archive on AWS Open Data
(bucket `nasa-power`, MERRA-2 and CERES SYN1deg monthly spatial stores), downloaded by
`pipeline/fetch_power_zarr.py` into `data/raw/power_zarr/<PARAM>.annual.npz` (annual values per
native grid cell, complete calendar years only).

## Variables (ids are stable; the app, pipeline and content all key on them)

| id | POWER param | name | units | annual stat | sphere |
|---|---|---|---|---|---|
| t2m | T2M | Air temperature | °C | mean | heat |
| t2m_max | T2M_MAX_AVG | Daytime high temperature | °C | mean | heat |
| t2mwet | T2MWET | Wet-bulb temperature | °C | mean | heat |
| cdd | CDD18_3 | Cooling degree days | °C·day | sum of monthly totals (POWER monthly value is the month total) | heat |
| precip | PRECTOTCORR | Precipitation | mm/day | mean | water |
| soil | GWETROOT | Root-zone soil wetness | 0 to 1 | mean | water |
| evap | EVLAND | Land evaporation | mm/day | mean | water |
| pw | PW | Precipitable water | cm | mean | water |
| snow | FRSNO | Snow cover fraction | 0 to 1 | mean | ice |
| seaice | FRSEAICE | Sea-ice fraction | 0 to 1 | mean | ice |
| ozone | TO3 | Total column ozone | DU | mean | air |
| aod | AOD_55_ADJ | Aerosol optical depth | unitless | mean | air |
| cloud | CLOUD_AMT | Cloud amount | % | mean | air |
| solar | ALLSKY_SFC_SW_DWN | Surface sunlight | MJ/m²/day | mean | air |
| wind | WS10M | Wind speed (10 m) | m/s | mean | air |
| gistemp | (GISTEMP) | Temperature anomaly (stations and ships) | °C | mean | heat |
| gpcp | (GPCP) | Precipitation (satellites and gauges) | mm/day | mean | water |

Annual value for a cell and year: computed from monthly values when at least 10 of 12 months are
present, else missing. Use complete calendar years only (the last year is dropped if incomplete).

## Statistics (identical method in Python and TypeScript)

Primary test, used for the map and the headline verdict: on the **annual series** of a cell,
1. Sen's slope (median of pairwise slopes), reported **per decade** (slope_per_year * 10).
2. Mann-Kendall S with tie correction, and the **Yue & Wang (2004) variance correction**: detrend
   with Sen's slope, take the lag-1 autocorrelation r1 of the detrended series; if r1 is
   significant at 5% (|r1| > 1.96/sqrt(n)), multiply Var(S) by n* = 1 + 2 * sum_{k=1}^{n-1} (1 - k/n) r1^k;
   otherwise n* = 1. (Must match `pymannkendall.yue_wang_modification_test` within 1e-6 on p, using
   lag=1. If it doesn't, match pymannkendall's actual behaviour and document it.)
3. Two-sided p-value from z with continuity correction (z = (S - sign(S)) / sqrt(VarS)).
4. Sen's slope 95% confidence interval (Gilbert 1987, using the corrected Var(S)).
5. Field significance across a map: Benjamini-Hochberg false discovery rate at q = 0.10 over all
   valid cells (Wilks 2016). `sig = 2` when FDR-significant, `1` when only p < 0.05, `0` otherwise.

Secondary tools in the TypeScript library for the investigation panel:
- `deseasonalize(monthly)`: anomalies against the month-of-year mean.
- `seasonalMK(monthly)`: Hirsch (1982) seasonal Mann-Kendall plus seasonal Sen's slope.
- `monthlyTrends(monthly)`: Sen slope and MK p for each calendar month (seasonal fingerprint).
- `ols(t, x)`: least-squares slope, standard error, t-test p, 95% CI, R².
- `pettitt(x)`: change-point index, U statistic, approximate p.
- `detectionYears(slopePerYear, residualStd, phi)`: Weatherhead et al. (1998)
  n* = [ (3.3 * sigma / |omega|) * sqrt((1 + phi) / (1 - phi)) ]^(2/3) years, with sigma and phi from
  the residuals of the series the slope was fitted on. Return Infinity when slope is 0.
- `bhThreshold(pvalues, q)`.

## Web data products (written by the pipeline into `web/public/data/`)

`vars.json`: `{ generated, period: [first, last], vars: [ { id, param, source, units, years:[first,last],
grid: { lat0, dlat, nlat, lon0, dlon, nlon }, seriesScale, seriesOffset, valueRange:[p2,p98],
slopeRange:[p2,p98] (per decade), summary: { validCells, sigUp, sigDown, fdrUp, fdrDown,
areaWeightedMeanSlope }, extremes: { up:[{lat,lon,slope,p}], down:[...] } (top 8 each, FDR-significant,
at least 15 degrees apart) } ] }`.

Grid order: row-major, row 0 = southernmost latitude `lat0`, column 0 = longitude `lon0`
(-180 side). Cell index i = row * nlon + col. POWER grids are subsampled from the native grid to
`lat0=-90, dlat=1, nlat=181, lon0=-180, dlon=1.25, nlon=288` (native points, no averaging).
GISTEMP and GPCP keep their native grids.

`grid/<id>.trend.bin.gz`: gzip of a Float32Array of length 4 * N, field-major:
`[slopePerDecade x N, pValue x N, mean x N, sig x N]`. Missing cells are NaN.

`grid/<id>.series.bin.gz`: gzip of an Int16Array of length N * Y (Y = number of years), cell-major
(all years of cell 0, then cell 1, ...). value = int * seriesScale + seriesOffset; -32768 = missing.

`cases/<caseId>.json`: offline copy of the POWER point monthly response for each curated case
location (the raw POWER JSON for all variables listed in the case), so case files work with NASA
offline.

The browser decompresses with `DecompressionStream('gzip')`.

## Live point data

The investigation panel calls POWER point monthly directly from the browser (CORS allowed), one
request with up to 20 parameters, community `AG`, `start=1981`, `end=<last year>`. Cache responses
in memory and in `localStorage` by rounded coordinate. Fall back to the annual series from
`grid/<id>.series.bin.gz` when POWER fails.
