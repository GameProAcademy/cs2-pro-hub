from __future__ import annotations

import hashlib
import math

import pytest

from python_reference import MAX_DEMO_BYTES, _bounded, _finite, _manifest, build_python_reference


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
        build_python_reference(str(path), None)


def test_reference_bounds_rows_and_rejects_non_finite_values():
    assert _bounded(list(range(1_100))) == list(range(1_000))
    assert _finite({"zero": 0, "false": False, "none": None})
    assert not _finite({"nested": [math.inf]})


def test_reference_accepts_the_1_5_gib_real_demo_contract_ceiling():
    assert MAX_DEMO_BYTES == 1_500 * 1024 * 1024


def test_reference_rejects_existing_demo_without_authorization(tmp_path):
    path = tmp_path / "local.dem"
    path.write_bytes(b"dem")
    with pytest.raises(ValueError, match="NO_AUTHORIZED_REAL_DEM"):
        build_python_reference(str(path), None)


def test_reference_rejects_mismatched_authorization(tmp_path):
    path = tmp_path / "local.dem"
    path.write_bytes(b"dem")
    authorization = {
        "authorizedDemo": True,
        "provenance": "LOCAL_USER_SELECTION",
        "filename": path.name,
        "sha256": hashlib.sha256(b"different").hexdigest(),
        "sizeBytes": path.stat().st_size,
        "source": "LOCAL_FILE",
        "authorizationRef": "test",
        "receivedAt": "2026-09-21T00:00:00Z",
    }
    with pytest.raises(ValueError, match="authorized_dem_metadata_mismatch"):
        build_python_reference(str(path), authorization)


def test_shared_manifest_digests_are_verified():
    manifest = _manifest()
    assert manifest["catalogVersion"] == 5
    assert manifest["contractVersion"] == 4