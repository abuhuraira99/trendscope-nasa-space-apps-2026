import sys
from pathlib import Path

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "pipeline"))

import build_earthdata_grids as bed  # noqa: E402


def _months(first: str, last: str) -> list[str]:
    y, m = int(first[:4]), int(first[4:])
    out = []
    while f"{y}{m:02d}" <= last:
        out.append(f"{y}{m:02d}")
        y, m = (y + 1, 1) if m == 12 else (y, m + 1)
    return out


def test_annual_means_keeps_complete_years_and_applies_min_months() -> None:
    # Record from April 2002 to September 2007, like GRACE: 2002 and 2007 are incomplete.
    months = _months("200204", "200709")
    values = np.arange(len(months), dtype=np.float64)[None, :].repeat(2, axis=0)
    drop = {"200402", "200405", "200408", "200411", "200501", "200502", "200503", "200504",
            "200505"}  # fmt: skip
    keep = [k for k, m in enumerate(months) if m not in drop]
    months = [months[k] for k in keep]
    values = values[:, keep]
    values[1, :] = np.nan  # a cell without data

    years, annual, per_year = bed.annual_means(values, months, min_months=8)

    assert years == [2003, 2004, 2005, 2006]
    assert per_year == {2003: 12, 2004: 8, 2005: 7, 2006: 12}
    jan2003 = 9  # index of 200301 in the full record
    assert annual[0, 0] == pytest.approx(jan2003 + 5.5)
    assert np.isfinite(annual[0, 1])  # 8 months is enough
    assert np.isnan(annual[0, 2])  # 7 months is not
    assert np.isfinite(annual[0, 3])
    assert np.isnan(annual[1]).all()


def test_annual_means_averages_duplicate_months_and_respects_year_bounds() -> None:
    months = _months("200001", "200312")
    values = np.ones((1, len(months)))
    months = months + ["200106"]  # a second solution for June 2001
    values = np.concatenate([values, [[13.0]]], axis=1)

    years, annual, _ = bed.annual_means(values, months, min_months=10, first_year=2001,
                                        last_year=2002)  # fmt: skip

    assert years == [2001, 2002]
    assert annual[0, 0] == pytest.approx((11 + (1 + 13) / 2) / 12)
    assert annual[0, 1] == pytest.approx(1.0)


@pytest.mark.parametrize(
    ("url", "expected"),
    [
        ("https://archive.podaac.earthdata.nasa.gov/x.nc", True),
        ("https://opendap.earthdata.nasa.gov/collections/C1/granules/G1.dap.nc4", True),
        ("https://data.lpdaac.earthdatacloud.nasa.gov/lp-prod-protected/x.hdf", True),
        ("https://urs.earthdata.nasa.gov/oauth/authorize", True),
        ("https://podaac-ops-cumulus-protected.s3.us-west-2.amazonaws.com/x.nc", False),
        ("https://d1234.cloudfront.net/x.nc", False),
        ("https://earthdata.nasa.gov.evil.example/x", False),
    ],
)
def test_token_goes_to_earthdata_hosts_only(url: str, expected: bool) -> None:
    assert bed.is_auth_host(url) is expected
