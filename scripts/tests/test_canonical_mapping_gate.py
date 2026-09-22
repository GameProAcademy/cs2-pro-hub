from __future__ import annotations
import copy
import json
from pathlib import Path
import pytest
from scripts.canonical_mapping_gate import ADAPTER_OUTPUT_FIELDS, assert_canonical_mapping_gate, build_inventory

ROOT = Path(__file__).resolve().parents[2]
MATRIX = json.loads((ROOT / "docs/client-parser/reconciled-field-matrix.json").read_text())


def authorized_fixture():
    inventory = copy.deepcopy(build_inventory())
    for row in inventory["rows"]:
        row.update({"parityStatus": "VERIFIED", "determinismStatus": "VERIFIED",
                    "canonicalAuthorization": True, "lastVerifiedAt": "2026-09-22T00:00:00Z",
                    "status": "AUTHORIZED_CANONICAL", "normalizationExecuted": True,
                    "dependsOnFullTickDomain": False})
    return inventory


def test_noncanonical_blocked_fields_do_not_block_authorized_canonical_inventory():
    result = assert_canonical_mapping_gate(authorized_fixture(), MATRIX)
    assert result["noncanonicalBlockedFields"] > 0
    assert result["gateStatus"] == "PASS"

@pytest.mark.parametrize("status", ["BLOCKED", "PARITY_PENDING", "DETERMINISM_PENDING"])
def test_unverified_canonical_mapping_blocks(status):
    inventory = authorized_fixture()
    inventory["rows"][0]["status"] = status
    assert assert_canonical_mapping_gate(inventory, MATRIX)["gateStatus"] == "BLOCKED"


def test_current_inventory_is_blocked_without_real_parity_and_determinism():
    result = assert_canonical_mapping_gate(build_inventory(), MATRIX)
    assert result["gateStatus"] == "BLOCKED"
    assert result["canonicalAuthorizedMappings"] == 0


def test_raw_only_cannot_be_promoted_by_boolean_only():
    inventory = authorized_fixture()
    inventory["rows"][0]["status"] = "RAW_ONLY"
    inventory["rows"][0]["canonicalAuthorization"] = True
    assert assert_canonical_mapping_gate(inventory, MATRIX)["gateStatus"] == "BLOCKED"


def test_unlisted_capability_and_semantic_mismatch_block():
    inventory = authorized_fixture()
    inventory["rows"][0]["sourceCapability"] = "missing.capability"
    assert assert_canonical_mapping_gate(inventory, MATRIX)["gateStatus"] == "BLOCKED"
    inventory = authorized_fixture()
    inventory["rows"][0]["semanticMismatch"] = True
    assert assert_canonical_mapping_gate(inventory, MATRIX)["gateStatus"] == "BLOCKED"


def test_required_normalization_and_full_tick_dependency_block():
    inventory = authorized_fixture()
    inventory["rows"][0]["normalizationExecuted"] = False
    assert assert_canonical_mapping_gate(inventory, MATRIX)["gateStatus"] == "BLOCKED"
    inventory = authorized_fixture()
    inventory["rows"][0]["dependsOnFullTickDomain"] = True
    assert assert_canonical_mapping_gate(inventory, MATRIX)["gateStatus"] == "BLOCKED"


def test_missing_inventory_metadata_fails_closed():
    inventory = authorized_fixture()
    del inventory["rows"][0]["nullSemantics"]
    with pytest.raises(ValueError, match="CANONICAL_MAPPING_METADATA_MISSING"):
        assert_canonical_mapping_gate(inventory, MATRIX)


def test_inventory_covers_the_complete_demo_adapter_output_surface():
    inventory = build_inventory()
    assert {row["canonicalField"] for row in inventory["rows"]} == ADAPTER_OUTPUT_FIELDS


def test_missing_or_unknown_adapter_output_fails_closed():
    inventory = authorized_fixture()
    inventory["rows"].pop()
    with pytest.raises(ValueError, match="CANONICAL_MAPPING_SURFACE_MISMATCH"):
        assert_canonical_mapping_gate(inventory, MATRIX)
    inventory = authorized_fixture()
    inventory["rows"][0]["canonicalField"] = "CanonicalMatch.notARealField"
    with pytest.raises(ValueError, match="CANONICAL_MAPPING_SURFACE_MISMATCH"):
        assert_canonical_mapping_gate(inventory, MATRIX)


def test_production_inventory_has_no_authorization_bypass():
    assert "authorize" not in build_inventory.__code__.co_varnames
