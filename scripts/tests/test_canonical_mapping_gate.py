from __future__ import annotations
import json
from pathlib import Path
import pytest
from scripts.canonical_mapping_gate import (
    ADAPTER_OUTPUT_FIELDS,
    FIELD_SPECS,
    MAPPING_CLASSES,
    assert_canonical_mapping_gate,
    build_inventory,
)

ROOT = Path(__file__).resolve().parents[2]
MATRIX = json.loads((ROOT / "docs/client-parser/reconciled-field-matrix.json").read_text())


def simulated_future_evidence():
    inventory = json.loads(json.dumps(build_inventory()))
    for row in inventory["rows"]:
        row.update({"mappingStatus": "VERIFIED_NORMALIZED_SOURCE",
                    "parityStatus": "VERIFIED", "determinismStatus": "VERIFIED",
                    "canonicalAuthorization": True, "lastVerifiedAt": "2026-09-22T00:00:00Z",
                    "status": "AUTHORIZED_CANONICAL", "normalizationExecuted": True,
                    "dependsOnFullTickDomain": False, "identityDependency": "VERIFIED",
                    "tickDependency": "VERIFIED", "semanticValidation": "VERIFIED",
                    "persistenceValidation": "VERIFIED"})
    return inventory


def test_noncanonical_blocked_fields_do_not_block_authorized_canonical_inventory():
    matrix = json.loads(json.dumps(MATRIX))
    for row in matrix["rows"]:
        row["evidenceStatus"] = "VERIFIED"
    result = assert_canonical_mapping_gate(simulated_future_evidence(), matrix)
    assert result["noncanonicalBlockedFields"] > 0
    assert result["gateStatus"] == "PASS"

@pytest.mark.parametrize("status", ["BLOCKED", "PARITY_PENDING", "DETERMINISM_PENDING"])
def test_unverified_canonical_mapping_blocks(status):
    inventory = simulated_future_evidence()
    inventory["rows"][0]["mappingStatus"] = status
    assert assert_canonical_mapping_gate(inventory, MATRIX)["gateStatus"] == "BLOCKED"


def test_current_inventory_is_blocked_without_real_parity_and_determinism():
    result = assert_canonical_mapping_gate(build_inventory(), MATRIX)
    assert result["gateStatus"] == "BLOCKED"
    assert result["canonicalAuthorizedMappings"] == 0


def test_raw_only_cannot_be_promoted_by_boolean_only():
    inventory = simulated_future_evidence()
    inventory["rows"][0]["mappingStatus"] = "RAW_ONLY"
    inventory["rows"][0]["canonicalAuthorization"] = True
    assert assert_canonical_mapping_gate(inventory, MATRIX)["gateStatus"] == "BLOCKED"


def test_unlisted_capability_and_semantic_mismatch_block():
    inventory = simulated_future_evidence()
    inventory["rows"][0]["sourceCapability"] = "missing.capability"
    assert assert_canonical_mapping_gate(inventory, MATRIX)["gateStatus"] == "BLOCKED"
    inventory = simulated_future_evidence()
    inventory["rows"][0]["mappingStatus"] = "SEMANTIC_MISMATCH"
    assert assert_canonical_mapping_gate(inventory, MATRIX)["gateStatus"] == "BLOCKED"


def test_required_normalization_and_full_tick_dependency_block():
    inventory = simulated_future_evidence()
    inventory["rows"][0]["normalizationExecuted"] = False
    assert assert_canonical_mapping_gate(inventory, MATRIX)["gateStatus"] == "BLOCKED"
    inventory = simulated_future_evidence()
    inventory["rows"][0]["tickDependency"] = "BLOCKED"
    assert assert_canonical_mapping_gate(inventory, MATRIX)["gateStatus"] == "BLOCKED"


def test_missing_inventory_metadata_fails_closed():
    inventory = simulated_future_evidence()
    del inventory["rows"][0]["canonicalType"]
    with pytest.raises(ValueError, match="CANONICAL_MAPPING_METADATA_MISSING"):
        assert_canonical_mapping_gate(inventory, MATRIX)


def test_inventory_covers_the_complete_demo_adapter_output_surface():
    inventory = build_inventory()
    assert {row["canonicalField"] for row in inventory["rows"]} == ADAPTER_OUTPUT_FIELDS


def test_registry_is_explicit_and_uses_the_complete_taxonomy():
    assert set(FIELD_SPECS) == ADAPTER_OUTPUT_FIELDS
    assert len(MAPPING_CLASSES) == 15
    assert all(spec["sourceField"] != "derived_or_constant" for spec in FIELD_SPECS.values())
    assert all(spec["mappingStatus"] in MAPPING_CLASSES for spec in FIELD_SPECS.values())


def test_identity_and_tick_dependencies_cannot_be_authorized_by_boolean_only():
    inventory = simulated_future_evidence()
    identity = next(row for row in inventory["rows"] if row["canonicalField"] == "CanonicalParticipant.internalPlayerId")
    identity["identityDependency"] = "BLOCKED"
    assert assert_canonical_mapping_gate(inventory, MATRIX)["gateStatus"] == "BLOCKED"
    inventory = simulated_future_evidence()
    tick = next(row for row in inventory["rows"] if row["canonicalField"] == "CanonicalEvent.tick")
    tick["tickDependency"] = "BLOCKED"
    assert assert_canonical_mapping_gate(inventory, MATRIX)["gateStatus"] == "BLOCKED"


def test_missing_or_unknown_adapter_output_fails_closed():
    inventory = simulated_future_evidence()
    inventory["rows"].pop()
    with pytest.raises(ValueError, match="CANONICAL_MAPPING_SURFACE_MISMATCH"):
        assert_canonical_mapping_gate(inventory, MATRIX)
    inventory = simulated_future_evidence()
    inventory["rows"][0]["canonicalField"] = "CanonicalMatch.notARealField"
    with pytest.raises(ValueError, match="CANONICAL_MAPPING_SURFACE_MISMATCH"):
        assert_canonical_mapping_gate(inventory, MATRIX)


def test_production_inventory_has_no_authorization_bypass():
    assert "authorize" not in build_inventory.__code__.co_varnames


def test_demo_adapter_series_stays_out_of_the_inventory_while_always_null():
    adapter = (ROOT / "src/lib/canonical/adapters/demo.adapter.ts").read_text()
    assert "series: null" in adapter
    assert not any(field.startswith("CanonicalSeries.") for field in ADAPTER_OUTPUT_FIELDS)


def test_authorization_simulation_is_test_only():
    production = (ROOT / "scripts/canonical_mapping_gate.py").read_text()
    assert "authorize=True" not in production
    assert "def build_inventory(authorize" not in production
