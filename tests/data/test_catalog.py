"""Tests for src/trendscope/data/catalog.py."""

from __future__ import annotations

import pytest

from trendscope.data.catalog import (
    Variable,
    get_variable,
    list_variables,
    power_variables,
)


class TestListVariables:
    """The catalogue must contain the variables listed in the brief."""

    def test_at_least_eight_variables(self) -> None:
        assert len(list_variables()) >= 8

    def test_required_ids_present(self) -> None:
        ids = {v.id for v in list_variables()}
        for expected in (
            "temperature",
            "max_temperature",
            "rainfall",
            "humidity",
            "wind",
            "solar_radiation",
            "soil_moisture",
            "vegetation",
        ):
            assert expected in ids, f"Missing variable: {expected}"


class TestGetVariable:
    """Look-up by id should work case-insensitively."""

    def test_exact(self) -> None:
        v = get_variable("temperature")
        assert isinstance(v, Variable)
        assert v.parameter == "T2M"

    def test_case_insensitive(self) -> None:
        assert get_variable("Temperature").id == "temperature"

    def test_unknown_raises(self) -> None:
        with pytest.raises(KeyError, match="Unknown variable"):
            get_variable("dark_matter_flux")


class TestVariableFields:
    """Every variable must have all required metadata."""

    @pytest.mark.parametrize("var", list_variables(), ids=lambda v: v.id)
    def test_fields_not_empty(self, var: Variable) -> None:
        assert var.display_name
        assert var.source
        assert var.parameter
        assert var.units
        assert var.resolution


class TestPowerVariables:
    """power_variables() returns only NASA POWER entries."""

    def test_all_are_power(self) -> None:
        for v in power_variables():
            assert v.source == "NASA POWER"

    def test_at_least_seven(self) -> None:
        # 7 of the 8 catalogue entries are from POWER (vegetation is MODIS).
        assert len(power_variables()) >= 7
