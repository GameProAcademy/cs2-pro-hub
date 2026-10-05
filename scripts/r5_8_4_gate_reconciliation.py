#!/usr/bin/env python3
"""Pure fail-closed R5.8.4 32-gate reconciliation.

This module classifies already-collected evidence. It has no network, database,
workflow, parser, storage, queue, Railway, or Canonical execution surface.
"""
from __future__ import annotations

from typing import Any, Mapping

GATES = (
    "inventory_105",
    "zero_generic",
    "db_git_digest_parity",
    "mapping_release_valid",
    "canonical_authorization_false",
    "railway_deployment_exact",
    "railway_commit_exact",
    "railway_branch_exact",
    "live_version_exact",
    "live_health_exact",
    "critical_hashes_exact",
    "hmac_configured",
    "transport_secret_configured",
    "railway_token_configured",
    "endpoint_configured",
    "oidc_operational",
    "oidc_immutable_subject",
    "workflow_identity_valid",
    "provenance_verified",
    "remote_ci",
    "python_tests",
    "python_wasm_parity",
    "determinism",
    "persistence_validation",
    "identity_validation",
    "tick_authority",
    "retention_guard",
    "attempt_9_absent",
    "metrics_uncontaminated",
    "features_uncontaminated",
    "canonical_uncontaminated",
    "runtime_frozen",
)
ALLOWED_STATUSES = frozenset(("VERIFIED", "NOT_PROVEN", "BLOCKED", "FAIL"))


def reconcile_gates(evidence: Mapping[str, Mapping[str, Any]] | None) -> dict[str, Any]:
    """Return a complete matrix; absent, malformed, or unknown evidence fails closed."""
    supplied = evidence if isinstance(evidence, Mapping) else {}
    matrix: dict[str, dict[str, Any]] = {}
    for gate in GATES:
        item = supplied.get(gate)
        status = item.get("status") if isinstance(item, Mapping) else None
        evidence_ref = item.get("evidence_ref") if isinstance(item, Mapping) else None
        if status not in ALLOWED_STATUSES or not isinstance(evidence_ref, str) or not evidence_ref:
            matrix[gate] = {
                "status": "NOT_PROVEN",
                "evidence_ref": "MISSING_OR_INVALID_EVIDENCE",
            }
        else:
            matrix[gate] = {"status": status, "evidence_ref": evidence_ref}

    blockers = [gate for gate, item in matrix.items() if item["status"] != "VERIFIED"]
    return {
        "schema_version": 1,
        "operation": "R5.8.4_32_GATE_RECONCILIATION",
        "side_effects": False,
        "gate_count": len(matrix),
        "gates": matrix,
        "blockers": blockers,
        "decision": "BLOCKED" if blockers else "READY_FOR_OPERATOR_REVIEW",
        # A complete matrix is still diagnostic evidence, never execution authority.
        "attempt_9_authorized": False,
        "canonical_authorized": False,
    }

def reconcile_r5_8_3_preflight(
    preflight: Mapping[str, Any],
    *,
    workflow_run_id: int | str,
    workflow_run_sha: str,
    test_suite_passed: bool,
) -> dict[str, Any]:
    """Map independently collected R5.8.3 evidence into the 32-gate matrix.

    This is diagnostic only. Missing evidence stays NOT_PROVEN and no gate
    produced here grants Attempt 9 or Canonical execution authority.
    """
    p = preflight if isinstance(preflight, Mapping) else {}
    railway = p.get("railway") if isinstance(p.get("railway"), Mapping) else {}
    runtime = p.get("runtime") if isinstance(p.get("runtime"), Mapping) else {}
    hashes = p.get("critical_hashes") if isinstance(p.get("critical_hashes"), Mapping) else {}
    workflow = p.get("attestation_workflow") if isinstance(p.get("attestation_workflow"), Mapping) else {}
    mapping = p.get("mapping_authority") if isinstance(p.get("mapping_authority"), Mapping) else {}

    def ev(status: str, ref: str) -> dict[str, str]:
        return {"status": status, "evidence_ref": ref}

    verified: dict[str, dict[str, Any]] = {}
    if mapping.get("inventory_rows") == 105:
        verified["inventory_105"] = ev("VERIFIED", "r5.8.3.mapping_authority")
    if mapping.get("generic") == 0:
        verified["zero_generic"] = ev("VERIFIED", "r5.8.3.mapping_authority")
    if mapping.get("artifact_matches") is True:
        verified["mapping_release_valid"] = ev("VERIFIED", "r5.8.3.mapping_authority")
    if mapping.get("authorized") == 0:
        verified["canonical_authorization_false"] = ev("VERIFIED", "r5.8.3.mapping_authority")
    if railway.get("id") == "1b5778de-3eaf-46f1-9ea5-cba381d95313" and railway.get("status") == "SUCCESS":
        verified["railway_deployment_exact"] = ev("VERIFIED", "r5.8.3.railway")
    if railway.get("commitHash") == "91aeee853200d0f461d0d36af1781d7fdfa40941":
        verified["railway_commit_exact"] = ev("VERIFIED", "r5.8.3.railway")
    if railway.get("branch") == "infra/cs2-parser-worker-v8":
        verified["railway_branch_exact"] = ev("VERIFIED", "r5.8.3.railway")
    if runtime and all(
        isinstance(item, Mapping) and item.get("match") is True
        for item in runtime.values()
    ):
        verified["live_version_exact"] = ev("VERIFIED", "r5.8.3.runtime")
    if hashes and all(
        isinstance(item, Mapping) and item.get("match") is True
        for item in hashes.values()
    ):
        verified["critical_hashes_exact"] = ev("VERIFIED", "r5.8.3.critical_hashes")
    if p.get("oidc_immutable_subject_present") is True:
        verified["oidc_immutable_subject"] = ev("VERIFIED", "r5.8.3.oidc_subject")
    if workflow.get("approved") is True:
        verified["workflow_identity_valid"] = ev("VERIFIED", "r5.8.3.attestation_workflow")
    if test_suite_passed:
        verified["remote_ci"] = ev("VERIFIED", f"workflow_run:{workflow_run_id}")
        verified["python_tests"] = ev("VERIFIED", f"workflow_run:{workflow_run_id}:focused-tests")

    result = reconcile_gates(verified)
    result["source"] = {
        "workflow": "R5.8.3 Read-Only Release Preflight",
        "workflow_run_id": str(workflow_run_id),
        "workflow_run_sha": workflow_run_sha,
        "preflight_decision": p.get("decision"),
        "preflight_failures": list(p.get("failures") or []),
    }
    return result
