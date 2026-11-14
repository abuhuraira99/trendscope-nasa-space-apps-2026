"""Tests for src/trendscope/data/regions.py."""

from __future__ import annotations

import pytest

from trendscope.data.regions import Region, get_region, list_regions


class TestRegionValidity:
    """Every preset region must have physically sensible coordinates."""

    @pytest.mark.parametrize("region", list_regions(), ids=lambda r: r.name)
    def test_bounding_box_is_valid(self, region: Region) -> None:
        assert region.is_valid(), f"{region.name} has invalid coordinates: {region}"

    @pytest.mark.parametrize("region", list_regions(), ids=lambda r: r.name)
    def test_south_less_than_north(self, region: Region) -> None:
        assert region.south < region.north

    @pytest.mark.parametrize("region", list_regions(), ids=lambda r: r.name)
    def test_west_less_than_east(self, region: Region) -> None:
        assert region.west < region.east


class TestGetRegion:
    """Look-up by name should be case-insensitive."""

    def test_exact_name(self) -> None:
        assert get_region("Lahore").name == "Lahore"

    def test_case_insensitive(self) -> None:
        assert get_region("lahore").name == "Lahore"
        assert get_region("LAHORE").name == "Lahore"

    def test_unknown_raises(self) -> None:
        with pytest.raises(KeyError, match="Unknown region"):
            get_region("Atlantis")


class TestListRegions:
    """list_regions() must include the required presets."""

    def test_minimum_count(self) -> None:
        # Brief says: Lahore, Karachi, Islamabad, Punjab, Sindh,
        # Pakistan + 2 international = 8 total minimum.
        assert len(list_regions()) >= 8

    def test_required_names_present(self) -> None:
        names = {r.name for r in list_regions()}
        for expected in ("Lahore", "Karachi", "Islamabad", "Punjab", "Sindh", "Pakistan"):
            assert expected in names, f"Missing required region: {expected}"
