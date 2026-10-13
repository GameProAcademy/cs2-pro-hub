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
    result = reconcile_gates(evidence, predem_approval={"run_id": 1, "sha": "b" * 40})
    assert result["decision"] == "READY_FOR_OPERATOR_REVIEW"
    assert result["attempt_9_authorized"] is False
    assert result["canonical_authorized"] is False
    assert result["side_effects"] is False

def _preflight(**override):
    from scripts.parser_runtime_attestation import BRANCH, DEPLOYMENT, DEPLOYMENT_SOURCE_COMMIT

    hosts = ("https://parser.gamepro.network", "https://cs2-demo-parser-production.up.railway.app")
    preflight = {
        "decision": "GREEN_FOR_FRESH_ATTESTATION_PREFLIGHT",
        "failures": [],
        "attestation_workflow": {"approved": True},
        "critical_hashes": {"a": {"match": True}, "b": {"match": True}},
        "oidc_immutable_subject_present": True,
        "mapping_authority": {"computed_from": "docs/client-parser/canonical-mapping-inventory.json",
                              "artifact_matches": True, "inventory_rows": 105, "authorized": 0, "generic": 0},
        "railway": {"id": DEPLOYMENT, "status": "SUCCESS", "commitHash": DEPLOYMENT_SOURCE_COMMIT,
                    "branch": BRANCH, "api_query_succeeded": True, "binding_matches": True},
        "runtime": {f"{h}/version": {"match": True} for h in hosts},
        "health": {f"{h}/health": {"ok": True} for h in hosts},
    }
    preflight.update(override)
    return preflight


def _reconcile(preflight, tests=True):
    from scripts.r5_8_4_gate_reconciliation import reconcile_r5_8_3_preflight

    return reconcile_r5_8_3_preflight(preflight, workflow_run_id=123, workflow_run_sha="a" * 40,
                                      test_suite_passed=tests)


def test_r583_preflight_maps_only_its_own_gates_and_stays_blocked_before_the_dem():
    from scripts.r5_8_4_gate_reconciliation import GATE_SPECS, POST_DEM_GATES, R583, exit_code

    result = _reconcile(_preflight())
    own = [g for g, spec in GATE_SPECS.items() if spec[1] == R583]
    assert result["own_scope"]["gates"] == own and result["own_scope"]["blockers"] == []
    assert all(result["gates"][g]["status"] == "VERIFIED" for g in own)
    assert all(result["gates"][g]["status"] == "NOT_PROVEN" for g in GATE_SPECS if g not in own)
    assert result["gates"]["remote_ci"]["status"] == "NOT_PROVEN"  # proven by the activation gate, not here
    assert result["decision"] == "BLOCKED" and result["predem_decision"] == "BLOCKED"
    assert result["postdem_decision"] == "NOT_STARTED"
    assert set(result["phases"]["post_dem"]["blockers"]) == set(POST_DEM_GATES)
    assert exit_code(result) == 0  # its own scope is complete; the rest is pending elsewhere
    assert result["attempt_9_authorized"] is False and result["canonical_authorized"] is False


def test_mapping_literals_are_not_evidence():
    # Before this change R5.8.3 published inventory_rows=105, authorized=0 and
    # generic=0 as literals and R5.8.4 accepted them even when the artifact
    # did not match. Only computed values from a matching artifact count.
    for mapping in (
        {"artifact_matches": True, "inventory_rows": 105, "authorized": 0, "generic": 0},  # no computed_from
        {"computed_from": "docs/client-parser/canonical-mapping-inventory.json", "artifact_matches": False,
         "inventory_rows": 105, "authorized": 0, "generic": 0},
    ):
        result = _reconcile(_preflight(mapping_authority=mapping))
        for gate in ("inventory_105", "zero_generic", "canonical_authorization_false", "mapping_release_valid"):
            assert result["gates"][gate]["status"] == "NOT_PROVEN", (gate, mapping)
    bad = _preflight(mapping_authority={"computed_from": "docs/client-parser/canonical-mapping-inventory.json",
                                        "artifact_matches": True, "inventory_rows": 104, "authorized": 1, "generic": 2})
    result = _reconcile(bad)
    for gate in ("inventory_105", "zero_generic", "canonical_authorization_false"):
        assert result["gates"][gate]["status"] == "NOT_PROVEN"


def test_railway_gates_use_the_shared_pins_and_the_token_is_judged_separately():
    from scripts.r5_8_4_gate_reconciliation import exit_code

    removed = _preflight(railway={"id": "3ad4b1fe-9b9e-4fec-b79a-4215d27aab29", "status": "SUCCESS",
                                  "commitHash": "10815fb44e165963adfaf07f71c474ca628f4b7f", "branch": "main",
                                  "api_query_succeeded": True, "binding_matches": False})
    result = _reconcile(removed)
    assert result["gates"]["railway_token_configured"]["status"] == "VERIFIED"
    for gate in ("railway_deployment_exact", "railway_commit_exact", "railway_branch_exact"):
        assert result["gates"][gate]["status"] == "NOT_PROVEN"
    assert exit_code(result) == 1
    blocked = _reconcile(_preflight(railway={"status": "BLOCKED", "reason": "RAILWAY_API_TOKEN_MISSING"}))
    assert blocked["gates"]["railway_token_configured"]["status"] == "NOT_PROVEN"


def test_health_and_version_need_both_hosts():
    one_host = _preflight(health={"https://parser.gamepro.network/health": {"ok": True}})
    assert _reconcile(one_host)["gates"]["live_health_exact"]["status"] == "NOT_PROVEN"
    unhealthy = _preflight(health={"a/health": {"ok": True}, "b/health": {"ok": False}})
    assert _reconcile(unhealthy)["gates"]["live_health_exact"]["status"] == "NOT_PROVEN"
    one_version = _preflight(runtime={"a/version": {"match": True}})
    assert _reconcile(one_version)["gates"]["live_version_exact"]["status"] == "NOT_PROVEN"


def test_every_gate_has_a_phase_a_collector_and_a_criterion():
    from scripts.r5_8_4_gate_reconciliation import (A91_LAB, GATE_SPECS, POST_DEM_GATES, PRE_DEM_GATES,
                                                    gate_matrix_rows)

    assert len(GATE_SPECS) == 32 and len(PRE_DEM_GATES) == 28 and len(POST_DEM_GATES) == 4
    assert set(POST_DEM_GATES) == {"python_wasm_parity", "determinism", "tick_authority", "runtime_frozen"}
    assert all(GATE_SPECS[g][1] == A91_LAB for g in POST_DEM_GATES)
    assert not any(GATE_SPECS[g][1] == A91_LAB for g in PRE_DEM_GATES)
    for row in gate_matrix_rows():
        assert all(row[k] for k in ("phase", "collector", "criterion", "evidence", "invalidated_by")), row


def test_post_dem_results_cannot_be_claimed_without_a_predem_approval():
    from scripts.r5_8_4_gate_reconciliation import GATES, POST_DEM_GATES, reconcile_gates

    everything = {g: {"status": "VERIFIED", "evidence_ref": f"x:{g}"} for g in GATES}
    early = reconcile_gates(everything)
    assert all(early["gates"][g]["status"] == "FAIL" for g in POST_DEM_GATES)
    assert early["gates"]["determinism"]["evidence_ref"] == "POST_DEM_EVIDENCE_WITHOUT_PREDEM_APPROVAL"
    assert early["decision"] == "FAIL" and early["postdem_decision"] == "FAIL"
    assert early["predem_decision"] == "READY_FOR_PREDEM_REVIEW"  # pre-DEM never reads post-DEM results
    for approval in ({}, {"run_id": 1}, {"run_id": 1, "sha": "short"}, {"run_id": " ", "sha": "a" * 40}):
        assert reconcile_gates(everything, predem_approval=approval)["postdem_decision"] == "FAIL", approval
    bound = reconcile_gates(everything, predem_approval={"run_id": 77, "sha": "a" * 40})
    assert bound["decision"] == "READY_FOR_OPERATOR_REVIEW" and bound["postdem_decision"] == "VERIFIED"
    assert bound["attempt_9_authorized"] is False and bound["canonical_authorized"] is False



def _jobs(conclusion="success", *, job="preflight", step="Run focused attestation/governance tests", copies=1):
    return [{"name": job, "steps": [{"name": step, "conclusion": conclusion}] * copies}]


def test_test_gates_come_from_the_source_runs_own_step():
    from scripts.r5_8_4_gate_reconciliation import focused_tests_passed

    assert focused_tests_passed(_jobs()) is True
    for jobs in (_jobs("failure"), _jobs("skipped"), _jobs("cancelled"), _jobs(None),
                 _jobs(job="other"), _jobs(step="renamed"), _jobs(copies=2),
                 _jobs() + _jobs(), [], None, "jobs"):
        assert focused_tests_passed(jobs) is False, jobs


def test_failed_source_tests_leave_the_test_gates_unproven():
    from scripts.r5_8_4_gate_reconciliation import focused_tests_passed, reconcile_r5_8_3_preflight

    result = reconcile_r5_8_3_preflight({}, workflow_run_id=1, workflow_run_sha="a" * 40,
                                        test_suite_passed=focused_tests_passed(_jobs("failure")))
    assert result["gates"]["remote_ci"]["status"] == "NOT_PROVEN"
    assert result["gates"]["python_tests"]["status"] == "NOT_PROVEN"


def test_exit_code_is_the_decision_never_the_job_colour():
    from scripts.r5_8_4_gate_reconciliation import annotations, exit_code

    blocked = reconcile_gates({})
    assert exit_code(blocked) == 1  # no own scope at all
    assert annotations(blocked)[0].startswith("::error title=R5.8.4 decision::")
    ok = _reconcile(_preflight())
    assert exit_code(ok) == 0
    assert annotations(ok)[0].startswith("::notice title=R5.8.4 decision::")
    assert exit_code(dict(ok, attempt_9_authorized=True)) == 1
    assert exit_code(dict(ok, canonical_authorized=True)) == 1
    assert exit_code(dict(ok, failed=["determinism"])) == 1
    assert exit_code(dict(ok, own_scope={"gates": [], "blockers": []})) == 1
    assert exit_code(_reconcile(_preflight(), tests=False)) == 1
    assert exit_code({}) == 1


def test_workflow_runs_tests_first_reads_failed_preflights_and_enforces_the_decision():
    from pathlib import Path

    import yaml

    root = Path(__file__).resolve().parents[2]
    text = (root / ".github/workflows/r5-8-4-gate-reconciliation.yml").read_text()
    workflow = yaml.safe_load(text)
    job = workflow["jobs"]["reconcile"]
    assert "conclusion == 'failure'" in job["if"] and "conclusion == 'success'" in job["if"]
    names = [s["name"] for s in job["steps"]]
    assert names.index("Run R5.8.4 reconciler tests") < names.index("Reconcile all 32 gates fail-closed")
    checkout = job["steps"][0]
    assert checkout["with"]["ref"] == "${{ github.event.workflow_run.head_sha }}"
    reconcile = job["steps"][names.index("Reconcile all 32 gates fail-closed")]["run"]
    assert "test_suite_passed=True" not in text
    assert "focused_tests_passed(jobs)" in reconcile and "sys.exit(exit_code(result))" in reconcile
    assert job["steps"][names.index("Preserve reconciliation evidence")].get("if") == "always()"


def test_gate_doc_matches_the_code():
    from pathlib import Path

    from scripts.r5_8_4_gate_reconciliation import gate_matrix_rows

    doc = (Path(__file__).resolve().parents[2] / "docs/H3E_PREDEM_POSTDEM_GATES.md").read_text()
    table = [[cell.strip() for cell in line.strip().strip("|").split("|")]
             for line in doc.splitlines() if line.strip().startswith("| ") and "`" in line]
    expected = [[str(i), f"`{r['gate']}`", r["phase"], r["collector"], r["criterion"], r["evidence"],
                 r["invalidated_by"]] for i, r in enumerate(gate_matrix_rows(), 1)]
    assert table == expected


def test_commit_and_branch_of_a_removed_deployment_are_not_evidence():
    # Observed on main e239db3b: the pinned deployment 1b5778de is REMOVED, yet
    # its commit and branch matched the pins and were counted as VERIFIED.
    from scripts.parser_runtime_attestation import BRANCH, DEPLOYMENT, DEPLOYMENT_SOURCE_COMMIT

    removed = _preflight(railway={"id": DEPLOYMENT, "status": "REMOVED", "commitHash": DEPLOYMENT_SOURCE_COMMIT,
                                  "branch": BRANCH, "api_query_succeeded": True, "binding_matches": False})
    result = _reconcile(removed)
    for gate in ("railway_deployment_exact", "railway_commit_exact", "railway_branch_exact"):
        assert result["gates"][gate]["status"] == "NOT_PROVEN", gate
    assert result["gates"]["railway_token_configured"]["status"] == "VERIFIED"
