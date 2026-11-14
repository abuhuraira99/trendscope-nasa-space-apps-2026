"""Tests for src/trendscope/data/power.py.

All tests use a saved fixture so CI never calls NASA.
"""

from __future__ import annotations

import json
from pathlib import Path
from unittest.mock import MagicMock

import pandas as pd
import pytest

from trendscope.data.power import fetch_power_monthly
from trendscope.data.regions import LAHORE

_FIXTURES = Path(__file__).resolve().parent.parent / "fixtures"


def _load_fixture(name: str) -> dict:
    """Load a JSON fixture file."""
    with open(_FIXTURES / name) as f:
        return json.load(f)


def _mock_session(fixture_name: str) -> MagicMock:
    """Return a mock ``requests.Session`` that returns a fixture as JSON."""
    data = _load_fixture(fixture_name)
    mock_resp = MagicMock()
    mock_resp.json.return_value = data
    mock_resp.raise_for_status.return_value = None

    session = MagicMock()
    session.get.return_value = mock_resp
    return session


class TestFetchPowerMonthly:
    """Integration-style tests against saved fixtures."""

    def test_returns_dataframe(self) -> None:
        session = _mock_session("power_t2m_lahore_2001_2002.json")
        df = fetch_power_monthly(
            "temperature",
            region=LAHORE,
            start_year=2001,
            end_year=2002,
            session=session,
        )
        assert isinstance(df, pd.DataFrame)

    def test_columns(self) -> None:
        session = _mock_session("power_t2m_lahore_2001_2002.json")
        df = fetch_power_monthly(
            "temperature",
            region=LAHORE,
            start_year=2001,
            end_year=2002,
            session=session,
        )
        assert list(df.columns) == ["time", "value"]

    def test_time_is_datetime(self) -> None:
        session = _mock_session("power_t2m_lahore_2001_2002.json")
        df = fetch_power_monthly(
            "temperature",
            region=LAHORE,
            start_year=2001,
            end_year=2002,
            session=session,
        )
        assert pd.api.types.is_datetime64_any_dtype(df["time"])

    def test_sorted_by_time(self) -> None:
        session = _mock_session("power_t2m_lahore_2001_2002.json")
        df = fetch_power_monthly(
            "temperature",
            region=LAHORE,
            start_year=2001,
            end_year=2002,
            session=session,
        )
        assert df["time"].is_monotonic_increasing

    def test_no_duplicate_months(self) -> None:
        session = _mock_session("power_t2m_lahore_2001_2002.json")
        df = fetch_power_monthly(
            "temperature",
            region=LAHORE,
            start_year=2001,
            end_year=2002,
            session=session,
        )
        assert df["time"].is_unique

    def test_missing_converted_to_nan(self) -> None:
        """NASA uses -999 for missing; we must convert to NaN."""
        session = _mock_session("power_t2m_lahore_2001_2002.json")
        df = fetch_power_monthly(
            "temperature",
            region=LAHORE,
            start_year=2001,
            end_year=2002,
            session=session,
        )
        # The fixture has one -999 value (200205).
        assert df["value"].isna().sum() == 1
        # No -999 should remain.
        assert not (df["value"] == -999).any()

    def test_attrs_set(self) -> None:
        session = _mock_session("power_t2m_lahore_2001_2002.json")
        df = fetch_power_monthly(
            "temperature",
            region=LAHORE,
            start_year=2001,
            end_year=2002,
            session=session,
        )
        assert df.attrs["variable"] == "temperature"
        assert df.attrs["units"] == "°C"
        assert df.attrs["source"] == "NASA POWER"
        assert df.attrs["region"] == "Lahore"

    def test_row_count(self) -> None:
        session = _mock_session("power_t2m_lahore_2001_2002.json")
        df = fetch_power_monthly(
            "temperature",
            region=LAHORE,
            start_year=2001,
            end_year=2002,
            session=session,
        )
        # 2 years × 12 months = 24 rows.
        assert len(df) == 24

    def test_point_query(self) -> None:
        """Can also fetch by explicit lat/lon instead of a Region."""
        session = _mock_session("power_t2m_lahore_2001_2002.json")
        df = fetch_power_monthly(
            "temperature",
            latitude=31.5,
            longitude=74.3,
            start_year=2001,
            end_year=2002,
            session=session,
        )
        assert len(df) == 24
        assert df.attrs["region"] == "(31.5, 74.3)"

    def test_no_location_raises(self) -> None:
        with pytest.raises(ValueError, match="Region or both latitude"):
            fetch_power_monthly("temperature")

    def test_non_power_variable_raises(self) -> None:
        with pytest.raises(ValueError, match="not NASA POWER"):
            fetch_power_monthly("vegetation", region=LAHORE)

    def test_retries_on_failure(self) -> None:
        """The client retries up to 3 times before giving up."""
        session = MagicMock()
        session.get.side_effect = ConnectionError("network down")

        with pytest.raises(ConnectionError):
            fetch_power_monthly(
                "temperature",
                region=LAHORE,
                start_year=2001,
                end_year=2002,
                session=session,
            )

        assert session.get.call_count == 3
