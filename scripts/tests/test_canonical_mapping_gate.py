from __future__ import annotations
import copy
import json
from pathlib import Path
import pytest
from scripts.canonical_mapping_gate import assert_canonical_mapping_gate, build_inventory

ROOT = Path(__file__).resolve().parents[2]
MATRIX = json.loads((ROOT / "docs/client-parser/reconciled-field-matrix.json").read_text())


def test_noncanonical_blocked_fields_do_not_block_authorized_canonical_inventory():
    result = assert_canonical_mapping_gate(build_inventory(authorize=True), MATRIX)
    assert result["noncanonicalBlockedFields"] > 0
    assert result["gateStatus"] == "PASS"

@pytest.mark.parametrize("status", ["BLOCKED", "PARITY_PENDING", "DETERMINISM_PENDING"])
def test_unverified_canonical_mapping_blocks(status):
    inventory = build_inventory(authorize=True)
    inventory["rows"][0]["status"] = status
    assert assert_canonical_mapping_gate(inventory, MATRIX)["gateStatus"] == "BLOCKED"


def test_current_inventory_is_blocked_without_real_parity_and_determinism():
    result = assert_canonical_mapping_gate(build_inventory(), MATRIX)
    assert result["gateStatus"] == "BLOCKED"
    assert result["canonicalAuthorizedMappings"] == 0


def test_raw_only_cannot_be_promoted_by_boolean_only():
    inventory = build_inventory(authorize=True)
    inventory["rows"][0]["status"] = "RAW_ONLY"
    inventory["rows"][0]["canonicalAuthorization"] = True
    assert assert_canonical_mapping_gate(inventory, MATRIX)["gateStatus"] == "BLOCKED"


def test_unlisted_capability_and_semantic_mismatch_block():
    inventory = build_inventory(authorize=True)
    inventory["rows"][0]["sourceCapability"] = "missing.capability"
    assert assert_canonical_mapping_gate(inventory, MATRIX)["gateStatus"] == "BLOCKED"
    inventory = build_inventory(authorize=True)
    inventory["rows"][0]["semanticMismatch"] = True
    assert assert_canonical_mapping_gate(inventory, MATRIX)["gateStatus"] == "BLOCKED"


def test_required_normalization_and_full_tick_dependency_block():
    inventory = build_inventory(authorize=True)
    inventory["rows"][0]["normalizationExecuted"] = False
    assert assert_canonical_mapping_gate(inventory, MATRIX)["gateStatus"] == "BLOCKED"
    inventory = build_inventory(authorize=True)
    inventory["rows"][0]["dependsOnFullTickDomain"] = True
    assert assert_canonical_mapping_gate(inventory, MATRIX)["gateStatus"] == "BLOCKED"


def test_missing_inventory_metadata_fails_closed():
    inventory = copy.deepcopy(build_inventory(authorize=True))
    del inventory["rows"][0]["nullSemantics"]
    with pytest.raises(ValueError, match="CANONICAL_MAPPING_METADATA_MISSING"):
        assert_canonical_mapping_gate(inventory, MATRIX)
