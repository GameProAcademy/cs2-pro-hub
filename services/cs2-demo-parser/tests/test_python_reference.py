from __future__ import annotations

import math

import pytest

from python_reference import _bounded, _finite, build_python_reference


def test_reference_is_not_run_without_explicit_authorized_fixture():
    assert build_python_reference(None) == {
        "status": "NOT_RUN",
        "reason": "NO_AUTHORIZED_REAL_DEM_FIXTURE",
        "canonicalEligible": False,
        "persisted": False,
    }


def test_reference_rejects_non_dem_path(tmp_path):
    path = tmp_path / "not-a-demo.txt"
    path.write_bytes(b"x")
    with pytest.raises(ValueError, match="explicit_authorized_dem_path_required"):
        build_python_reference(str(path))


def test_reference_bounds_rows_and_rejects_non_finite_values():
    assert _bounded(list(range(1_100))) == list(range(1_000))
    assert _finite({"zero": 0, "false": False, "none": None})
    assert not _finite({"nested": [math.inf]})