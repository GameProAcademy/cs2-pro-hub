import copy
import json
from pathlib import Path

import pytest

from raw_manifest_audit import (
    audit_manifest,
    reconcile_legacy_unmapped,
    validate_audit_digest,
    validate_manifest_identity,
)


FIXTURE = json.loads(
    (Path(__file__).parent / "fixtures" / "cache_raw_audit_g2.json").read_text(encoding="utf-8")
)
EXPECTED = {
    "job_id": "a31f5c25-b0d8-41ac-8225-27814cd1732a",
    "upload_id": "b7d41ad7-b143-4a3a-ab80-ebfee2d2c043",
    "attempt_number": 7,
    "demo_sha256": "0caa7c9744deec106095895d2dacd19cbfdae689f99e29b0dd4d446b4ec8ae3d",
    "root_digest": "ccbcafe55e7eca0270d6fb85cdd996f0163b5d209367819fa11c71efd06328d2",
}


def physical_manifest():
    path = Path("/tmp/cache-g2-manifest.json")
    if not path.exists():
        pytest.skip("read-only physical manifest snapshot is unavailable")
    return json.loads(path.read_text(encoding="utf-8"))


def test_physical_manifest_exactly_reconciles_the_178_fields():
    result = audit_manifest(physical_manifest(), FIXTURE, EXPECTED)
    assert result["status"] == "PASS"
    assert result["audit_evidence_digest"] == FIXTURE["audit_evidence_digest"]
    assert result["a_total"] == result["a_unique"] == 178
    assert result["b_total"] == result["b_unique"] == 178
    assert result["a_minus_b"] == result["b_minus_a"] == []
    assert result["duplicates_a"] == result["duplicates_b"] == []
    assert result["current_counts"] == {"MAPPED": 4, "RAW_ONLY_INTENTIONAL": 174}
    assert all(row["decision"] == "PASS" for row in result["matrix"])


def test_manifest_or_fixture_difference_fails_exact_reconciliation():
    manifest = physical_manifest()
    changed_manifest = copy.deepcopy(manifest)
    changed_manifest["audit_evidence"]["field_mappings"] = [
        row for row in changed_manifest["audit_evidence"]["field_mappings"]
        if row["raw_field"] != FIXTURE["legacy_unmapped_fields"][0]
    ]
    result = reconcile_legacy_unmapped(changed_manifest, FIXTURE)
    assert result["status"] == "FAIL"
    changed_fixture = copy.deepcopy(FIXTURE)
    changed_fixture["legacy_unmapped_fields"] = changed_fixture["legacy_unmapped_fields"][:-1]
    assert reconcile_legacy_unmapped(manifest, changed_fixture)["status"] == "FAIL"


def test_duplicate_unknown_and_digest_mismatch_fail_closed():
    manifest = physical_manifest()
    duplicate = copy.deepcopy(manifest)
    duplicate["audit_evidence"]["field_mappings"].append(
        copy.deepcopy(duplicate["audit_evidence"]["field_mappings"][0])
    )
    with pytest.raises(ValueError, match="duplicate_raw_fields"):
        reconcile_legacy_unmapped(duplicate, FIXTURE)
    unknown = copy.deepcopy(manifest)
    unknown["audit_evidence"]["field_mappings"][0]["status"] = "FUTURE"
    with pytest.raises(ValueError, match="mapping_status_invalid"):
        reconcile_legacy_unmapped(unknown, FIXTURE)
    changed_digest = copy.deepcopy(manifest)
    changed_digest["audit_evidence"]["raw_status"] = "PASS"
    with pytest.raises(ValueError, match="audit_evidence_digest_mismatch"):
        validate_audit_digest(changed_digest)


def test_four_mappings_and_174_reasons_are_individually_proven():
    matrix = reconcile_legacy_unmapped(physical_manifest(), FIXTURE)["matrix"]
    mapped = [row for row in matrix if row["code_status"] == "MAPPED"]
    raw_only = [row for row in matrix if row["code_status"] == "RAW_ONLY_INTENTIONAL"]
    assert {row["raw_field"] for row in mapped} == {
        "game_state.name", "game_state.steamid", "game_state.tick", "player_death.attackerblind",
    }
    assert all(row["app_field"] and row["canonical_field"] for row in mapped)
    assert len(raw_only) == 174
    assert all(row["code_reason"] for row in raw_only)


def test_physical_manifest_has_exact_historical_fail_gates():
    evidence = physical_manifest()["audit_evidence"]
    failed = sorted(gate["gate"] for gate in evidence["gates"] if gate["status"] == "FAIL")
    assert failed == sorted(FIXTURE["expected_fail_gates"])


def test_manifest_identity_mismatch_is_rejected():
    manifest = physical_manifest()
    changed = copy.deepcopy(manifest)
    changed["parser"]["version"] = "future"
    with pytest.raises(ValueError, match="parser_identity_invalid"):
        validate_manifest_identity(changed, EXPECTED)


def test_physical_forensic_inventory_is_internally_consistent():
    path = Path("/tmp/cache-g2-forensic.json")
    if not path.exists():
        pytest.skip("read-only physical forensic snapshot is unavailable")
    rows = json.loads(path.read_text(encoding="utf-8"))
    assert len(rows) == 1
    forensic = rows[0]
    events = forensic["event_coverage"]
    counts = {state: sum(row["capability_state"] == state for row in events) for state in {
        "PARSED_SUCCESSFULLY", "NOT_PRESENT_IN_DEMO", "AVAILABLE_BUT_EMPTY",
    }}
    assert counts == {"PARSED_SUCCESSFULLY": 44, "NOT_PRESENT_IN_DEMO": 23, "AVAILABLE_BUT_EMPTY": 1}
    inventory = forensic["forensic_inventory"]
    assert len(events) == 68
    assert inventory["event_capability_coverage"] == "COMPLETE"
    assert inventory["round_inventory"] == []
    assert inventory["tick_sampling"]["coverage"] == "SAMPLE"
    assert inventory["tick_sampling"]["full_extraction"] is False
    assert inventory["tick_sampling"]["sample_size"] == 1270
    assert inventory["usercmd_capability"]["coverage"] == "UNAVAILABLE"
    for event in events:
        name = event["event_name"]
        assert inventory["event_returned_field_inventory"][name] == event["returned_fields"]
        assert inventory["event_non_null_field_inventory"][name] == event["non_null_fields"]
        assert inventory["event_null_only_field_inventory"][name] == event["null_only_fields"]
        if event["capability_state"] == "PARSED_SUCCESSFULLY":
            assert inventory["event_preserved_field_inventory"][name] == event["preserved_fields"]