from scripts.r5_8_4_gate_reconciliation import GATES, reconcile_gates


def test_matrix_contains_exactly_the_32_required_gates():
    result = reconcile_gates({})
    assert len(GATES) == 32
    assert tuple(result["gates"]) == GATES
    assert result["gate_count"] == 32


def test_missing_or_malformed_evidence_never_becomes_verified():
    result = reconcile_gates({"inventory_105": {"status": "VERIFIED"}})
    assert result["gates"]["inventory_105"]["status"] == "NOT_PROVEN"
    assert all(item["status"] == "NOT_PROVEN" for item in result["gates"].values())
    assert result["decision"] == "BLOCKED"


def test_collection_error_and_unknown_status_fail_closed():
    result = reconcile_gates({
        "inventory_105": {"status": "UNKNOWN", "evidence_ref": "collector"},
        "zero_generic": {"status": "VERIFIED", "evidence_ref": "snapshot:1"},
    })
    assert result["gates"]["inventory_105"]["status"] == "NOT_PROVEN"
    assert result["gates"]["zero_generic"]["status"] == "VERIFIED"
    assert result["decision"] == "BLOCKED"


def test_even_complete_verified_matrix_never_authorizes_attempt_or_canonical():
    evidence = {
        gate: {"status": "VERIFIED", "evidence_ref": f"independent:{gate}"}
        for gate in GATES
    }
    result = reconcile_gates(evidence)
    assert result["decision"] == "READY_FOR_OPERATOR_REVIEW"
    assert result["attempt_9_authorized"] is False
    assert result["canonical_authorized"] is False
    assert result["side_effects"] is False