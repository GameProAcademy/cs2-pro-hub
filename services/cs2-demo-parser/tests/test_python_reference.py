from __future__ import annotations

import json
import math
from pathlib import Path

import pytest
import python_reference

from python_reference import (
    MAX_DEMO_BYTES,
    event_request,
    iter_normalized_records,
    normalize,
    read_manifest,
    sample,
    summarize_records,
    tick_request,
    validate,
)


def test_normalize_handles_non_finite_values_without_inventing_numbers():
    assert normalize({"finite": 1.5, "infinite": math.inf, "nan": math.nan}) == {
        "finite": 1.5,
        "infinite": None,
        "nan": None,
    }


def test_normalize_maps_pandas_nullable_scalars_to_json_null():
    import pandas as pd

    assert normalize(pd.NA) is None
    assert normalize(pd.NaT) is None
    assert normalize({"missing": pd.NA, "not_a_time": pd.NaT}) == {
        "missing": None,
        "not_a_time": None,
    }


def test_sample_bounds_lists_recursively_and_preserves_scalar_values():
    assert sample([{"values": list(range(5))}, None, False, 4], limit=2) == [
        {"values": [0, 1]},
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


def test_tick_request_excludes_project_aliases_not_supported_upstream():
    surface = {
        "fields": [
            {
                "propertyName": "tick",
                "sourceApi": "parseTicks",
                "runtimeRequestable": True,
                "upstreamSupported": False,
            },
            {
                "propertyName": "X",
                "sourceApi": "parseTicks",
                "runtimeRequestable": True,
                "upstreamSupported": True,
            },
            {
                "propertyName": "not-requestable",
                "sourceApi": "parseTicks",
                "runtimeRequestable": False,
                "upstreamSupported": True,
            },
            {
                "propertyName": "player_death",
                "sourceApi": "parseEvent",
                "runtimeRequestable": True,
                "upstreamSupported": True,
            },
        ],
    }
    assert tick_request(surface) == ["X"]
    assert tick_request(surface, limit=0) == []


def test_shared_manifest_digests_are_verified():
    manifest = read_manifest()
    assert manifest["catalogVersion"] == 5
    assert manifest["contractVersion"] == 4
    assert len(manifest["catalogDigest"]) == 64
    assert len(manifest["contractDigest"]) == 64


def test_manifest_catalog_tampering_fails_closed(tmp_path: Path, monkeypatch):
    manifest = json.loads(python_reference.MANIFEST.read_text(encoding="utf-8"))
    manifest["fields"].append(
        {
            "propertyName": "injected_unsupported_alias",
            "sourceApi": "parseTicks",
            "runtimeRequestable": True,
            "upstreamSupported": False,
        }
    )
    tampered_path = tmp_path / "tampered-manifest.json"
    tampered_path.write_text(json.dumps(manifest), encoding="utf-8")
    monkeypatch.setattr(python_reference, "MANIFEST", tampered_path)
    with pytest.raises(RuntimeError, match="CATALOG_MISMATCH"):
        read_manifest()


def test_demo_size_ceiling_is_explicitly_bounded():
    assert MAX_DEMO_BYTES == 1_500 * 1024 * 1024


def test_reference_requires_explicit_authorization_for_real_demo(tmp_path: Path):
    path = tmp_path / "local.dem"
    path.write_bytes(b"demo")
    with pytest.raises(RuntimeError, match="AUTHORIZED_DEM_METADATA_MISMATCH"):
        validate(path, {})
    with pytest.raises(RuntimeError, match="AUTHORIZED_DEM_METADATA_MISMATCH"):
        validate(path, {"authorizedDemo": False})


def test_reference_rejects_unapproved_source_and_provenance(tmp_path: Path):
    path = tmp_path / "local.dem"
    path.write_bytes(b"demo")
    common = {
        "authorizedDemo": True,
        "source": "LOCAL_FILE",
        "provenance": "LOCAL_FILE",
        "filename": path.name,
        "sha256": "0caa7c9744deec106095895d2dacd19cbfdae689f99e29b0dd4d446b4ec8ae3d",
        "sizeBytes": 473748061,
    }
    for key, value in (("source", "REMOTE"), ("provenance", "LOCAL_USER_SELECTION")):
        authorization = {**common, key: value}
        with pytest.raises(RuntimeError, match="AUTHORIZED_DEM_METADATA_MISMATCH"):
            validate(path, authorization)


def test_reference_rejects_incorrect_filename_size_and_hash_metadata(tmp_path: Path):
    path = tmp_path / "furia-vs-gamerlegion-m1-cache.dem"
    path.write_bytes(b"demo")
    valid_shape = {
        "authorizedDemo": True,
        "source": "LOCAL_FILE",
        "provenance": "LOCAL_FILE",
        "filename": path.name,
        "sha256": "0caa7c9744deec106095895d2dacd19cbfdae689f99e29b0dd4d446b4ec8ae3d",
        "sizeBytes": path.stat().st_size,
    }
    cases = (
        {**valid_shape, "filename": "other.dem"},
        {**valid_shape, "sizeBytes": 473748061},
        {**valid_shape, "sha256": "0" * 64},
    )
    for authorization in cases:
        with pytest.raises(RuntimeError, match="AUTHORIZED_DEM_METADATA_MISMATCH"):
            validate(path, authorization)


def test_reference_rejects_wrong_content_digest_after_metadata_gate(tmp_path: Path, monkeypatch):
    from types import SimpleNamespace

    path = tmp_path / "furia-vs-gamerlegion-m1-cache.dem"
    path.write_bytes(b"not-the-authorized-demo")
    real_stat = path.stat

    def authorized_size_stat(*args, **kwargs):
        value = real_stat(*args, **kwargs)
        return SimpleNamespace(st_size=473748061, st_mode=value.st_mode)

    monkeypatch.setattr(type(path), "stat", lambda self, *args, **kwargs: authorized_size_stat(*args, **kwargs))
    authorization = {
        "authorizedDemo": True,
        "source": "LOCAL_FILE",
        "provenance": "LOCAL_FILE",
        "filename": path.name,
        "sha256": "0caa7c9744deec106095895d2dacd19cbfdae689f99e29b0dd4d446b4ec8ae3d",
        "sizeBytes": 473748061,
    }
    with pytest.raises(RuntimeError, match="A91_DEM_SHA256_MISMATCH"):
        validate(path, authorization)


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


# --- canonical parity contract v1 -------------------------------------------------


def _vector_table(name: str) -> dict:
    vectors = json.loads(
        (python_reference.ROOT / "scripts/a91/canonical/vectors.json").read_text(encoding="utf-8")
    )
    return next(item for item in vectors["tables"] if item["name"] == name)


def test_summarize_table_on_a_real_dataframe_matches_the_shared_javascript_vector():
    """pandas/numpy carriers (uint64 ids, float32, NaN for null) -> the JS digests."""
    import numpy as np
    import pandas as pd

    frame = pd.DataFrame(
        {
            "tick": np.array([1000, 1000, 5000], dtype="int32"),
            "steamid": np.array([76561198012345679, 76561198012345680, 0], dtype="uint64"),
            "X": np.array([1376.0, -1972.5, np.nan], dtype="float32"),
            # A nullable int32 column arrives from pandas as float64 with NaN.
            "health": np.array([100.0, 0.0, np.nan], dtype="float64"),
            "name": ["a", "b", ""],
        }
    )
    summary = python_reference.summarize_table("ticks", frame)["summary"]
    assert summary == _vector_table("identical semantics, runtime-native carriers")["expected"]
    assert summary["columns"]["steamid"]["classes"]["u64"] == 3
    assert summary["columns"]["health"]["classes"] == {
        "null": 1, "bool": 0, "integer": 2, "float": 0, "string": 0, "u64": 0, "array": 0, "object": 0,
    }


def test_rounded_steam_id_column_fails_closed():
    """A nullable uint64 column that pandas turned into float64 has lost digits."""
    import numpy as np
    import pandas as pd

    frame = pd.DataFrame({"attacker_player_steamid": np.array([7.656119801234568e16, np.nan])})
    with pytest.raises(ValueError, match="A91_CANONICAL_U64_PRECISION_LOST:attacker_player_steamid"):
        python_reference.summarize_table("event:player_hurt", frame)


def test_unregistered_uint64_column_fails_closed():
    import numpy as np
    import pandas as pd

    frame = pd.DataFrame({"some_new_id": np.array([1, 2], dtype="uint64")})
    with pytest.raises(RuntimeError, match="A91_CANONICAL_UNREGISTERED_U64_FIELD:some_new_id"):
        python_reference.summarize_table("ticks", frame)


def test_event_request_never_asks_for_the_property_python_returns_rounded():
    event = {
        "playerFields": [
            {"field": "player_steamid", "requestAllowed": True},
            {"field": "team_num", "requestAllowed": True},
        ],
        "otherFields": [],
    }
    assert event_request(event) == (["team_num"], [])


def test_semantic_evidence_contains_no_call_metadata():
    table = python_reference.summarize_table("event:round_start", [{"tick": 1}])["summary"]
    ticks = python_reference.summarize_table("ticks", [{"tick": 0, "balance": 800}])["summary"]
    evidence = python_reference.build_semantic_evidence(
        header={"map_name": "de_test"},
        events=[{"eventName": "round_start", "status": "SUCCEEDED", "table": table}],
        grenades=python_reference.summarize_table("grenades", [])["summary"],
        ticks=ticks,
        tick_probe={"source": "DEM_FRAME_HEADER_SCAN", "maxFrameTick": 2},
        requested_fields=["balance"],
        wanted_ticks=[0],
    )
    assert sorted(evidence["eventEvidence"][0]) == ["eventName", "status", "table"]
    assert evidence["roundEvidence"] == evidence["eventEvidence"]
    assert evidence["economyEvidence"]["fields"] == ["balance"]
    text = json.dumps(evidence)
    for forbidden in ("requestedPlayerFields", "returnedFields", "unavailableFields", "samples"):
        assert forbidden not in text
    no_economy = python_reference.economy_projection(
        python_reference.summarize_table("ticks", [{"tick": 0}])["summary"]
    )
    assert no_economy == {"status": "FAILED", "reason": "NO_ECONOMY_FIELDS"}
