# Changelog

All notable changes to this project are listed here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/).

## [1.0.0] - 2026-11-15

Built during the NASA Space Apps Challenge, 14 and 15 November 2026.

### Added

- Atlas: a WebGL globe of tested trends for 19 NASA variables, with hatching where a change could be
  chance after false discovery rate control, a year-by-year view and an opposite-fates view.
- Investigation panel for any place: Sen slope with its 95% range, Mann-Kendall with the Yue and Wang
  correction, Pettitt change point, detection time, time windows, a month-by-month breakdown from
  live NASA POWER data, a second opinion from GISTEMP or GPCP, and a scan of every variable.
- Detective mode, a plain-language question box, six case files, and Method, Data and About pages.
- Data pipeline for NASA POWER (MERRA-2, CERES), GISTEMP v4, GPCP v2.3, GRACE and GRACE-FO mascons
  and MODIS NDVI, with vectorised trend statistics in Python.
- Python client for the NASA POWER API with regions, a variable catalogue and a local cache.
- A 30-second demo video rendered in GitHub Actions.
- Hosting on Cloudflare Pages, and CI for both the Python and the web code.

## [0.1.0] - 2026-11-12

### Added

- Repository structure, contribution guide, code owners, issue and pull request templates.
- CI workflow with Ruff and pytest.
- Python package skeleton and development tooling.
