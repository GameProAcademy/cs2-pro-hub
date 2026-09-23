from __future__ import annotations

import hashlib
import math
import stat
from types import SimpleNamespace
import stat
from types import SimpleNamespace
from unittest.mock import patch

import pytest

from python_reference import MAX_DEMO_BYTES, _bounded, _finite, _manifest, build_python_reference

AUTHORIZED_CACHE_SHA = "0caa7c9744deec106095895d2dacd19cbfdae689f99e29b00dd4d446b4ec8ae3d"
AUTHORIZED_CACHE_SIZE = 473_748_061


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


def test_reference_rejects_empty_demo(tmp_path):
    path = tmp_path / "empty.dem"
    path.write_bytes(b"")
    authorization = {
        "authorizedDemo": True, "provenance": "R5_FORENSIC_STAGING", "filename": path.name,
        "sha256": hashlib.sha256(b"").hexdigest(), "sizeBytes": 0, "source": "LOCAL_FILE",
        "authorizationRef": "R5_REAL_DEM_ACCESS_GATE", "receivedAt": "2026-09-23T00:00:00Z",
    }
    with pytest.raises(ValueError, match="authorized_demo_size_out_of_bounds"):
        build_python_reference(str(path), authorization)


def test_reference_rejects_demo_above_1_5_gib(tmp_path):
    path = tmp_path / "oversized.dem"
    path.touch()
    authorization = {
        "authorizedDemo": True, "provenance": "R5_FORENSIC_STAGING", "filename": path.name,
        "sha256": hashlib.sha256(b"").hexdigest(), "sizeBytes": MAX_DEMO_BYTES + 1, "source": "LOCAL_FILE",
        "authorizationRef": "R5_REAL_DEM_ACCESS_GATE", "receivedAt": "2026-09-23T00:00:00Z",
    }
    with patch.object(type(path), "stat") as mocked_stat:
        mocked_stat.return_value = SimpleNamespace(st_size=MAX_DEMO_BYTES + 1, st_mode=stat.S_IFREG)
        with pytest.raises(ValueError, match="authorized_demo_size_out_of_bounds"):
            build_python_reference(str(path), authorization)


def test_reference_real_cache_size_passes_size_gate_then_rejects_wrong_sha(tmp_path):
    path = tmp_path / "furia-vs-gamerlegion-m1-cache.dem"
    path.write_bytes(b"dem")
    authorization = {
        "authorizedDemo": True,
        "provenance": "R5_FORENSIC_STAGING",
        "filename": path.name,
        "sha256": AUTHORIZED_CACHE_SHA,
        "sizeBytes": AUTHORIZED_CACHE_SIZE,
        "source": "LOCAL_FILE",
        "authorizationRef": "R5_REAL_DEM_ACCESS_GATE",
        "receivedAt": "2026-09-23T00:00:00Z",
    }
    with patch.object(type(path), "stat") as mocked_stat:
        mocked_stat.return_value = SimpleNamespace(st_size=AUTHORIZED_CACHE_SIZE, st_mode=stat.S_IFREG)
        with pytest.raises(ValueError, match="authorized_demo_metadata_mismatch"):
            build_python_reference(str(path), authorization)


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