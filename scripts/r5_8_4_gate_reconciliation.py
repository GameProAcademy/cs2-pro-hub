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