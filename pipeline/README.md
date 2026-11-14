# Data pipeline

These scripts download NASA data, run the trend test on every grid cell of the globe, and write the
small files the web app loads from `web/public/data/`. The file formats and the statistics are
defined in [docs/build-spec.md](../docs/build-spec.md).

Run every command from the repository root with the project's own Python:

```
.venv/Scripts/python.exe -I pipeline/<script>.py
```

Nothing is installed globally. Reading netCDF files (GISTEMP, GPCP, GRACE and the MODIS subsets)
needs two extra packages in the project venv, installed once:

```
PIP_NO_CACHE_DIR=1 .venv/Scripts/python.exe -m pip install xarray netCDF4
```

## The scripts

| Script | What it does | Output |
|---|---|---|
| `fetch_power_zarr.py` | Downloads NASA POWER monthly grids from the public Zarr archive on AWS and turns them into annual values, one file per parameter | `data/raw/power_zarr/<PARAM>.annual.npz` |
| `build_power_grids.py` | Runs the trend test on every POWER variable that has been downloaded | `web/public/data/grid/<id>.*.bin.gz`, `vars.json` |
| `build_obs_grids.py` | Downloads GISTEMP v4 and GPCP v2.3 and runs the same test | `web/public/data/grid/gistemp.*`, `gpcp.*`, `vars.json` |
| `build_earthdata_grids.py` | Downloads GRACE/GRACE-FO water storage and MODIS NDVI from NASA Earthdata (login needed) and runs the same test | `web/public/data/grid/tws.*`, `ndvi.*`, `vars.json` |
| `fetch_cases.py` | Saves POWER point data for each curated case location, for offline use | `web/public/data/cases/<id>.json` |

Raw downloads stay in `data/raw/`, which git ignores.

## Step by step

1. Download the POWER parameters (about 6 minutes each). Each one is written in a single step when
   it is finished, so a file that exists is complete.

   ```
   .venv/Scripts/python.exe -I pipeline/fetch_power_zarr.py merra2:T2M merra2:PRECTOTCORR syn1deg:CLOUD_AMT
   ```

   The app uses these 15: `merra2:` T2M, T2M_MAX_AVG, T2MWET, CDD18_3, PRECTOTCORR, GWETROOT,
   EVLAND, TQV, FRSNO, FRSEAICE, TO3, WS10M, and `syn1deg:` AOD_55_ADJ, CLOUD_AMT,
   ALLSKY_SFC_SW_DWN.

2. Build the POWER grids. With no arguments it builds every variable whose download exists and
   skips the ones that are already up to date. Add ids to build only those, `--force` to rebuild,
   or `--list` to see what is downloaded and built.

   ```
   .venv/Scripts/python.exe -I pipeline/build_power_grids.py
   .venv/Scripts/python.exe -I pipeline/build_power_grids.py --list
   ```

3. Build the GISTEMP and GPCP grids. The first run downloads about 46 MB and resumes if the
   connection drops. `--refresh` downloads new copies (both datasets add a month every month).

   ```
   .venv/Scripts/python.exe -I pipeline/build_obs_grids.py
   ```

4. Build the two Earthdata grids, `tws` and `ndvi` (see "Earthdata variables" below). They need a
   free Earthdata login token in `.env` as `EARTHDATA_TOKEN=...`. The first run downloads about
   44 MB of GRACE data and 300 small NDVI subsets (a few minutes); later runs only fetch new months.

   ```
   .venv/Scripts/python.exe -I pipeline/build_earthdata_grids.py
   .venv/Scripts/python.exe -I pipeline/build_earthdata_grids.py --only tws
   ```

5. Save the case files. The case list is `pipeline/cases.json`:

   ```json
   [{"id": "lahore-heat", "lat": 31.52, "lon": 74.36, "params": ["T2M", "PRECTOTCORR"]}]
   ```

   Files that already exist are skipped unless you add `--refresh`.

   ```
   .venv/Scripts/python.exe -I pipeline/fetch_cases.py
   ```

To rebuild everything later, run steps 2 to 5 again. Steps 2, 4 and 5 only do new work, so they
are quick when nothing has changed.

## What the build does

For each variable and each grid cell:

1. Takes the annual series. A year counts when at least 10 of its 12 months have data. Only
   complete calendar years are used, so the current year is left out. Cooling degree days are an
   annual total; every other variable is an annual mean.
2. Runs Sen's slope and the Mann-Kendall test with a conservative Yue and Wang (2004) correction
   for lag-1 autocorrelation (details below). Cells with fewer than 15 valid years are left empty.
3. Marks each cell 2 when it passes the Benjamini-Hochberg false discovery rate test at q = 0.10
   across the whole map, 1 when only p < 0.05, and 0 otherwise.
4. Writes the grid files and adds or replaces the variable's entry in `vars.json`. Entries for other
   variables are kept. The entry holds the period, the grid, the int16 scale, colour ranges, a
   summary (cell counts and the area-weighted mean slope) and the strongest significant trends
   ("extremes"), at least 15 degrees apart.

The statistics live in `src/trendscope/analysis/grid_stats.py`. The browser library in
`web/src/lib/stats/` uses the same method, so a cell clicked on the map gets the same verdict.
The tests in `tests/analysis/test_grid_stats.py` check it against `pymannkendall`:

```
.venv/Scripts/python.exe -I -m pytest tests/analysis
```

If you change `grid_stats.py` or `build_power_grids.py`, the next run of `build_power_grids.py`
rebuilds every POWER variable, because its outputs are then older than the code.

### The autocorrelation correction

Year-to-year values are often correlated (a warm year tends to follow a warm year), which makes the
plain Mann-Kendall test report trends too readily. For each cell the build:

1. removes the Sen's slope trend from the annual series (years after a gap keep their real place
   in time),
2. measures the lag-1 autocorrelation `r1` of what is left,
3. only when `r1` is positive and significant (`r1 > 1.96 / sqrt(n)`, with `n` valid years),
   multiplies the variance of S by `1 + 2 * sum over k = 1 .. n-1 of (1 - k/n) * r1^k`.

Otherwise the variance is left alone, so the correction can only make a trend less significant.
This is stricter than `pymannkendall.yue_wang_modification_test`, which also shrinks the variance
when `r1` is negative and can then report trends in pure noise. Where no correction is applied the
result equals `pymannkendall.original_test`, and the tests check that.

## Grids

| Data | Grid in the web files |
|---|---|
| POWER, MERRA-2 variables | 1 x 1.25 degrees, 181 x 288 cells, taken from the native 0.5 x 0.625 grid (every second point, no averaging) |
| POWER, CERES variables (`aod`, `cloud`, `solar`) | native 1 x 1 degree, 180 x 360 cells, from 2001 |
| GISTEMP v4 | native 2 x 2 degrees, 90 x 180 cells |
| GPCP v2.3 | native 2.5 x 2.5 degrees, 72 x 144 cells |
| GRACE/GRACE-FO mascons (`tws`) | native 0.5 x 0.5 degrees, 360 x 720 cells, centres from -89.75, -179.75 |
| MODIS MOD13C2 (`ndvi`) | 1 x 1 degree, 180 x 360 cells, centres from -89.525, -179.475 (one native 0.05 degree pixel per box, see below) |

Each variable's `grid` entry in `vars.json` gives the exact layout. Row 0 is the southernmost row
and column 0 is the westernmost column.

## Things to know

- A cell is marked FDR-significant (2) by the Benjamini-Hochberg rule alone. When most of the map
  has a trend, as for temperature, the rule accepts p-values a little above 0.05, so a few cells
  can be 2 even though their own p is not below 0.05.
- `pw` (precipitable water) is built from the MERRA-2 variable `TQV` in kg/m², divided by 10 to give
  cm. That is the same quantity the POWER API calls `PW`, so `vars.json` still lists `PW` for live
  point requests.
- `imerg` is not built: the POWER Zarr archive has no IMERG grid.
- For the land-only variables (`soil`, `evap`) the archive already leaves the ocean empty. The
  build also empties any cell whose series never changes, such as a few ice-sheet cells.
- Units are converted to the ones in the spec (for example kelvin to °C). The build stops for a
  variable whose global mean looks wrong after conversion, so a unit mix-up cannot reach the app.
- `gistemp`, `gpcp`, `tws` and `ndvi` entries have no `param`, because they are not POWER
  parameters and have no live point data.

## Earthdata variables (`build_earthdata_grids.py`)

These two need a free NASA Earthdata login. Make a token at https://urs.earthdata.nasa.gov
("Generate Token") and put it in `.env` as `EARTHDATA_TOKEN=...`. The script sends the token only to
`*.earthdata.nasa.gov` and `*.earthdatacloud.nasa.gov` hosts, never to the signed storage links they
redirect to, and never prints it.

```
.venv/Scripts/python.exe -I pipeline/build_earthdata_grids.py              # both
.venv/Scripts/python.exe -I pipeline/build_earthdata_grids.py --only ndvi  # one id
.venv/Scripts/python.exe -I pipeline/build_earthdata_grids.py --force      # rebuild
```

After each build it prints the trend at a few known places (Punjab, Greenland, the Amazon and so
on), so the map can be checked by eye.

**`tws`, terrestrial water storage.** GRACE and GRACE-FO, NASA JPL mascons RL06.3 v04 with the
Coastline Resolution Improvement filter, one 44 MB netCDF from PO.DAAC, cached in `data/raw/grace/`.
The value is `lwe_thickness`: the water storage anomaly as an equivalent water layer in cm,
relative to the 2004 to 2009 mean. A negative slope means the ground (groundwater, soil, snow, ice
and surface water together) is losing water. The file's `land_mask` keeps land only, including
Greenland and Antarctica. The mascons are 3 degree equal-area patches, so neighbouring 0.5 degree
cells often hold the same value. The JPL gain factors (`scale_factor`) are not applied.

GRACE has gaps: single months were skipped from 2011 to save the batteries, and there are 11 months
between the end of GRACE (June 2017) and the start of GRACE-FO (June 2018). So `tws` is the one
exception to the 10-month rule: a year needs 8 of its 12 months. The record runs from April 2002,
so 2002 is incomplete and left out, as is the current year. 2017 and 2018 have only 5 months each
and stay missing in the series (all cells -32768); the trend test keeps every other year in its real
place in time. Two months have two solutions each (January 2012 and April 2015); they are averaged.

**`ndvi`, vegetation greenness.** MODIS Terra MOD13C2 v061, monthly NDVI on the 0.05 degree grid,
2001 to 2025. Each monthly file is about 95 MB, so the script asks NASA's cloud OPeNDAP server
(Hyrax) for every 20th row and column only, starting at index 10: one native pixel near the centre
of each 1 x 1 degree box, about 160 KB per month, cached in `data/raw/modis_ndvi/`. The granule list
comes from CMR and is cached in `granules.json` (`--refresh` reloads it and fetches every month again).
Stored values are int16; NDVI = value / 10000 (in these HDF4 files `scale_factor = 10000` means
divide), fill -3000. The annual value is the mean of the months with data (at least 10 of 12), so
snow-covered winter months count where MODIS reports a value for them.
