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

def test_r583_preflight_maps_only_objectively_proven_gates_and_stays_blocked():
    from scripts.r5_8_4_gate_reconciliation import reconcile_r5_8_3_preflight

    preflight = {
        "decision": "GREEN_FOR_FRESH_ATTESTATION_PREFLIGHT",
        "failures": [],
        "attestation_workflow": {"approved": True},
        "critical_hashes": {"a": {"match": True}, "b": {"match": True}},
        "oidc_immutable_subject_present": True,
        "mapping_authority": {"artifact_matches": True, "inventory_rows": 105, "authorized": 0, "generic": 0},
        "railway": {
            "id": "1b5778de-3eaf-46f1-9ea5-cba381d95313",
            "status": "SUCCESS",
            "commitHash": "91aeee853200d0f461d0d36af1781d7fdfa40941",
            "branch": "infra/cs2-parser-worker-v8",
        },
        "runtime": {
            "https://parser.gamepro.network/version": {"match": True},
            "https://cs2-demo-parser-production.up.railway.app/version": {"match": True},
        },
    }
    result = reconcile_r5_8_3_preflight(
        preflight,
        workflow_run_id=123,
        workflow_run_sha="a" * 40,
        test_suite_passed=True,
    )
    assert result["gates"]["inventory_105"]["status"] == "VERIFIED"
    assert result["gates"]["railway_deployment_exact"]["status"] == "VERIFIED"
    assert result["gates"]["live_version_exact"]["status"] == "VERIFIED"
    assert result["gates"]["provenance_verified"]["status"] == "NOT_PROVEN"
    assert result["gates"]["python_wasm_parity"]["status"] == "NOT_PROVEN"
    assert result["decision"] == "BLOCKED"
    assert result["attempt_9_authorized"] is False
    assert result["canonical_authorized"] is False
