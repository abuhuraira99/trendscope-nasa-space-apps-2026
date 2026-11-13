"""Tests for src/trendscope/data/cache.py.

The key test: the second call for the same data must NOT hit the network.
"""

from __future__ import annotations

import json
from pathlib import Path
from unittest.mock import MagicMock, patch

import pandas as pd

from trendscope.data.cache import (
    cache_key,
    fetch_with_cache,
    get_cached,
    put_cached,
)
from trendscope.data.regions import LAHORE

_FIXTURES = Path(__file__).resolve().parent.parent / "fixtures"


def _make_sample_df() -> pd.DataFrame:
    """Build a small DataFrame matching the TrendScope contract."""
    df = pd.DataFrame(
        {
            "time": pd.to_datetime(["2001-01-01", "2001-02-01", "2001-03-01"]),
            "value": [12.5, 14.8, 20.3],
        }
    )
    df.attrs["variable"] = "temperature"
    df.attrs["units"] = "°C"
    df.attrs["source"] = "NASA POWER"
    df.attrs["region"] = "Lahore"
    return df


class TestCacheKey:
    """cache_key must be deterministic and change when inputs change."""

    def test_deterministic(self) -> None:
        k1 = cache_key("temperature", region=LAHORE, start_year=2001, end_year=2002)
        k2 = cache_key("temperature", region=LAHORE, start_year=2001, end_year=2002)
        assert k1 == k2

    def test_different_variable(self) -> None:
        k1 = cache_key("temperature", region=LAHORE)
        k2 = cache_key("rainfall", region=LAHORE)
        assert k1 != k2

    def test_different_years(self) -> None:
        k1 = cache_key("temperature", region=LAHORE, start_year=2001, end_year=2002)
        k2 = cache_key("temperature", region=LAHORE, start_year=2003, end_year=2004)
        assert k1 != k2


class TestPutAndGetCached:
    """Round-trip: put then get must return the same data and attrs."""

    def test_round_trip(self, tmp_path: Path) -> None:
        df = _make_sample_df()
        key = "test_round_trip"

        put_cached(key, df, cache_dir=tmp_path)
        loaded = get_cached(key, cache_dir=tmp_path)

        assert loaded is not None
        pd.testing.assert_frame_equal(loaded, df)
        assert loaded.attrs["variable"] == "temperature"
        assert loaded.attrs["units"] == "°C"
        assert loaded.attrs["source"] == "NASA POWER"
        assert loaded.attrs["region"] == "Lahore"

    def test_miss_returns_none(self, tmp_path: Path) -> None:
        assert get_cached("nonexistent", cache_dir=tmp_path) is None


class TestFetchWithCache:
    """The headline requirement: the second call must NOT hit the network."""

    def test_second_call_does_not_hit_network(self, tmp_path: Path) -> None:
        """Prove that a repeated request reads from cache, not NASA."""
        fixture_path = _FIXTURES / "power_t2m_lahore_2001_2002.json"
        with open(fixture_path) as f:
            fixture_data = json.load(f)

        mock_resp = MagicMock()
        mock_resp.json.return_value = fixture_data
        mock_resp.raise_for_status.return_value = None

        with patch("trendscope.data.power.requests.Session") as mock_session_cls:
            mock_session = MagicMock()
            mock_session.get.return_value = mock_resp
            mock_session_cls.return_value = mock_session

            # First call: should hit the network (via the mock).
            df1 = fetch_with_cache(
                "temperature",
                region=LAHORE,
                start_year=2001,
                end_year=2002,
                cache_dir=tmp_path,
            )
            assert mock_session.get.call_count == 1

            # Second call: must NOT hit the network.
            mock_session.get.reset_mock()
            df2 = fetch_with_cache(
                "temperature",
                region=LAHORE,
                start_year=2001,
                end_year=2002,
                cache_dir=tmp_path,
            )
            assert mock_session.get.call_count == 0, (
                "Second call should read from cache, not the network!"
            )

        pd.testing.assert_frame_equal(df1, df2)
