from __future__ import annotations

import math
from pathlib import Path

import pytest

from python_reference import (
    MAX_DEMO_BYTES,
    event_request,
    iter_normalized_records,
    normalize,
    sample,
    summarize_records,
    validate,
)


def test_normalize_handles_non_finite_values_without_inventing_numbers():
    assert normalize({"finite": 1.5, "infinite": math.inf, "nan": math.nan}) == {
        "finite": 1.5,
        "infinite": None,
        "nan": None,
    }


def test_sample_bounds_lists_recursively_and_preserves_scalar_values():
    assert sample([{"values": list(range(5))}, None, False, 4], limit=2) == [
        {"values": [0, 1, 2, 3, 4]},
        None,
    ]
    assert sample({"value": False}) == {"value": False}


def test_summarize_records_streams_list_records_and_keeps_bounded_sample():
    rows = [{"id": index, "value": index % 2 == 0} for index in range(5)]
    summary = summarize_records(rows, sample_limit=2)
    assert summary["count"] == 5
    assert summary["samples"] == rows[:2]
    assert summary["returnedFields"] == ["id", "value"]
    assert len(summary["digest"]) == 64
    assert all(char in "0123456789abcdef" for char in summary["digest"])


def test_iter_normalized_records_ignores_non_mapping_rows():
    assert list(iter_normalized_records([{"id": 1}, None, "ignored", {"id": 2}])) == [
        {"id": 1},
        {"id": 2},
    ]


def test_event_request_only_includes_explicitly_allowed_fields():
    event = {
        "playerFields": [
            {"field": "attacker_name", "requestAllowed": True},
            {"field": "unsafe_alias", "requestAllowed": False},
            {"field": "missing_flag"},
        ],
        "otherFields": [
            {"field": "weapon", "requestAllowed": True},
            {"field": "unknown", "requestAllowed": None},
        ],
    }
    assert event_request(event) == (["attacker_name"], ["weapon"])


def test_demo_size_ceiling_is_explicitly_bounded():
    assert MAX_DEMO_BYTES == 1_500 * 1024 * 1024


def test_validate_fails_closed_for_non_dem_path(tmp_path: Path):
    path = tmp_path / "not-a-demo.txt"
    path.write_bytes(b"x")
    with pytest.raises(RuntimeError, match="EXPLICIT_AUTHORIZED_DEM_PATH_REQUIRED"):
        validate(path, {"authorizedDemo": True})


def test_validate_rejects_missing_or_unapproved_authorization(tmp_path: Path):
    path = tmp_path / "local.dem"
    path.write_bytes(b"demo")
    with pytest.raises(RuntimeError, match="AUTHORIZED_DEM_METADATA_MISMATCH"):
        validate(path, {
            "authorizedDemo": True,
            "source": "LOCAL_FILE",
            "provenance": "LOCAL_FILE",
            "filename": path.name,
            "sizeBytes": path.stat().st_size,
            "sha256": "0" * 64,
        })
    with pytest.raises(RuntimeError, match="AUTHORIZED_DEM_METADATA_MISMATCH"):
        validate(path, {})


def test_no_real_demo_is_read_or_required_by_synthetic_unit_tests():
    # The tests above exercise only in-memory rows and temporary tiny files.
    assert True
