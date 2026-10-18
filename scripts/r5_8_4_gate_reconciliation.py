#!/usr/bin/env python3
"""Pure fail-closed R5.8.4 32-gate reconciliation, split into pre-DEM and post-DEM.

This module classifies already-collected evidence. It has no network, database,
workflow, parser, storage, queue, Railway, or Canonical execution surface.

Every gate has one phase and one collector:

* PRE_DEM gates must be VERIFIED before the controlled real-DEM laboratory run
  may be dispatched. They never depend on that run's results.
* POST_DEM gates are *outputs* of that run. They can only be VERIFIED from the
  sealed evidence of a laboratory run that cites a completed pre-DEM approval
  for the same commit; they can never authorize the run that produces them.

Collectors that the repository cannot operate (a fresh attestation, an
authorized read of the managed database) are named, so missing evidence is
reported as NOT_PROVEN with its reason instead of being invented.
"""
from __future__ import annotations

import json
import re
from typing import Any, Mapping

PRE_DEM, POST_DEM = "PRE_DEM", "POST_DEM"

# Collectors.
R583 = "R5.8.3 preflight artifact"
ACTIVATION = "H.3-E activation gate"
FRESH_ATTESTATION = "fresh attestation of the active runtime (external; needs authorization)"
MANAGED_DB_READ = "authorized read-only snapshot of the managed database (no CI path exists)"


def select_r5_8_3_artifact(
    artifacts: Any, *, workflow_run_id: Any, workflow_run_sha: str, workflow_run_attempt: Any
) -> dict[str, Any]:
    """Select exactly the evidence artifact for one immutable workflow-run attempt.

    A rerun keeps the same GitHub run ID and SHA but creates another artifact.
    The attempt suffix prevents old artifacts from making the selection ambiguous;
    all identity fields are still checked and ambiguity fails closed.
    """
    run_id = str(workflow_run_id).strip()
    sha = workflow_run_sha
    try:
        attempt = int(workflow_run_attempt)
    except (TypeError, ValueError):
        attempt = 0
    if not run_id or not re.fullmatch(r"[0-9a-f]{40}", sha or "") or attempt < 1:
        raise ValueError("R583_ARTIFACT_SELECTION_BINDING_INVALID")
    if not isinstance(artifacts, list):
        raise ValueError("R583_ARTIFACT_LIST_INVALID")
    expected_name = f"r5-8-3-preflight-{sha}-{run_id}-attempt-{attempt}"
    candidates = []
    for artifact in artifacts:
        if not isinstance(artifact, dict) or artifact.get("expired", False):
            continue
        workflow_run = artifact.get("workflow_run")
        if not isinstance(workflow_run, dict):
            continue
        if (
            artifact.get("name") == expected_name
            and str(workflow_run.get("id", "")) == run_id
            and workflow_run.get("head_sha") == sha
        ):
            candidates.append(artifact)
    if len(candidates) != 1:
        raise ValueError(
            f"EXPECTED_ONE_R583_ARTIFACT_GOT_{len(candidates)}_FOR_ATTEMPT_{attempt}"
        )
    return candidates[0]
A91_LAB = "A9.1 real-DEM laboratory run bound to a pre-DEM approval"

# gate: (phase, collector, criterion, evidence, invalidated by)
GATE_SPECS: dict[str, tuple[str, str, str, str, str]] = {
    "inventory_105": (PRE_DEM, R583,
        "the committed Canonical mapping inventory has exactly 105 rows and its digests match the pins",
        "row count computed from docs/client-parser/canonical-mapping-inventory.json; inventory and matrix digests",
        "any change of the inventory, the matrix or the pinned digests"),
    "zero_generic": (PRE_DEM, R583,
        "no inventory row uses a generic source (canonical_mapping_gate.FORBIDDEN_GENERIC_SOURCES)",
        "count of rows whose sourceField is generic, computed from the inventory",
        "any inventory change"),
    "db_git_digest_parity": (PRE_DEM, MANAGED_DB_READ,
        "the mapping release recorded in the managed database has the digests committed in git",
        "read-only query of the managed release row, compared with the pinned digests",
        "any managed release change; a snapshot older than the target commit"),
    "mapping_release_valid": (PRE_DEM, R583,
        "inventory digest, matrix digest and row authorizations match the pinned release",
        "mapping_authority_matches_artifact()", "any inventory, matrix or pin change"),
    "canonical_authorization_false": (PRE_DEM, R583,
        "no inventory row grants Canonical authorization",
        "count of rows with canonicalAuthorization != false, computed from the inventory",
        "any inventory change"),
    "railway_deployment_exact": (PRE_DEM, R583,
        "the pinned Railway deployment exists, is SUCCESS and belongs to the pinned project/service/environment",
        "Railway GraphQL deployment query (read-only)", "a new deployment; a pin change"),
    "railway_commit_exact": (PRE_DEM, R583,
        "that deployment, while SUCCESS, was built from the pinned source commit",
        "deployment meta.commitHash", "a new deployment; a pin change"),
    "railway_branch_exact": (PRE_DEM, R583,
        "that deployment, while SUCCESS, was built from the pinned branch", "deployment meta.branch",
        "a new deployment; a pin change"),
    "live_version_exact": (PRE_DEM, R583,
        "both worker hosts report the pinned identity, and the semantic revision names the build's worker tree",
        "/version of both hosts; git trees of the semantic and build commits",
        "a redeploy; a revision variable change"),
    "live_health_exact": (PRE_DEM, R583,
        "both worker hosts answer /health with exactly {\"status\": \"ok\"}",
        "/health of both hosts at preflight time", "any later preflight that does not observe it"),
    "critical_hashes_exact": (PRE_DEM, R583,
        "the five critical worker files at the pinned commit have the pinned blob hashes",
        "git blob hashes", "any pin change"),
    "hmac_configured": (PRE_DEM, FRESH_ATTESTATION,
        "the managed recorder verifies an HMAC signed with the configured key",
        "a fresh VERIFIED provenance row for the active runtime (presence of a GitHub secret proves nothing server-side)",
        "a key rotation; a new deployment"),
    "transport_secret_configured": (PRE_DEM, ACTIVATION,
        "the attestation endpoint accepts the transport secret and refuses requests without it",
        "activation gate transport stage: 401 without, 400 ATTESTATION_PAYLOAD_INVALID with the secret",
        "any later activation run that does not observe it"),
    "railway_token_configured": (PRE_DEM, R583,
        "the CI Railway token can read the deployment",
        "a successful read-only Railway API query in the preflight", "a token rotation or revocation"),
    "endpoint_configured": (PRE_DEM, ACTIVATION,
        "the configured attestation endpoint is the approved one and answers",
        "activation gate transport stage", "any later activation run that does not observe it"),
    "oidc_operational": (PRE_DEM, FRESH_ATTESTATION,
        "an attestation signed through GitHub OIDC is accepted by the endpoint",
        "a fresh VERIFIED attestation produced by the approved workflow", "a new deployment; a workflow change"),
    "oidc_immutable_subject": (PRE_DEM, R583,
        "the application pins the immutable OIDC subject of this repository's main",
        "string in src/lib/parserAttestation.ts", "any change of that file"),
    "workflow_identity_valid": (PRE_DEM, R583,
        "the attestation workflow blob equals the approved registry entry",
        "git blob of .github/workflows/parser-runtime-attestation.yml vs scripts/approved_attestation_workflow.json",
        "any change of the workflow or the registry"),
    "provenance_verified": (PRE_DEM, FRESH_ATTESTATION,
        "a VERIFIED provenance row binds the active deployment, commit, semantic and build revision",
        "fresh attestation plus read-only check of the row; historical rows of other deployments never count",
        "a new deployment"),
    "remote_ci": (PRE_DEM, ACTIVATION,
        "Quality Gates, Main required gates and F553 post-completion succeeded for the exact target commit",
        "GitHub Actions runs and jobs of that commit", "a new commit on main"),
    "python_tests": (PRE_DEM, R583,
        "the release governance tests passed in the R5.8.3 run of the target commit",
        "that run's own focused-test step conclusion", "a new commit on main"),
    "python_wasm_parity": (POST_DEM, A91_LAB,
        "Python and WASM outputs of the real DEM are equal on every comparable domain",
        "A9.1 sealed parity summary: status PASS, comparable failures 0, first divergence null",
        "a parser, contract or DEM change"),
    "determinism": (POST_DEM, A91_LAB,
        "two Python runs and two WASM runs each produce identical normalized digests",
        "A9.1 sealed determinism report and run digests", "a parser or DEM change"),
    "persistence_validation": (PRE_DEM, ACTIVATION,
        "queue, recovery, Canonical persistence and recorder probes pass on a disposable database at the target commit",
        "Queue Semantics workflow annotations of that commit (synthetic, rolled back; never production)",
        "a new commit on main"),
    "identity_validation": (PRE_DEM, MANAGED_DB_READ,
        "the managed execution-identity ledger has no conflicting identities for the target runtime",
        "read-only ledger query", "any new execution"),
    "tick_authority": (POST_DEM, A91_LAB,
        "tick domains (playback ticks, tick properties) are PASS in the real-DEM parity",
        "A9.1 sealed parity domains", "a parser or DEM change"),
    "retention_guard": (PRE_DEM, MANAGED_DB_READ,
        "raw evidence retention rules hold in the managed storage",
        "read-only storage/database snapshot", "any retention change"),
    "attempt_9_absent": (PRE_DEM, MANAGED_DB_READ,
        "no Attempt 9 exists in the managed database", "read-only query", "any write"),
    "metrics_uncontaminated": (PRE_DEM, MANAGED_DB_READ,
        "no metric derived from unverified parser output exists", "read-only query", "any write"),
    "features_uncontaminated": (PRE_DEM, MANAGED_DB_READ,
        "no feature derived from unverified parser output exists", "read-only query", "any write"),
    "canonical_uncontaminated": (PRE_DEM, MANAGED_DB_READ,
        "no Canonical row derived from unverified parser output exists", "read-only query", "any write"),
    "runtime_frozen": (POST_DEM, A91_LAB,
        "the laboratory runtime identity (parser wheel, WASM artifact, DEM identity) was stable across all four runs",
        "A9.1 determinism identityStable and identical WASM artifact identity", "any change of the runtime"),
}
GATES = tuple(GATE_SPECS)
PRE_DEM_GATES = tuple(g for g, spec in GATE_SPECS.items() if spec[0] == PRE_DEM)
POST_DEM_GATES = tuple(g for g, spec in GATE_SPECS.items() if spec[0] == POST_DEM)
ALLOWED_STATUSES = frozenset(("VERIFIED", "NOT_PROVEN", "BLOCKED", "FAIL"))
READY = "READY_FOR_OPERATOR_REVIEW"
PREDEM_READY = "READY_FOR_PREDEM_REVIEW"


def gate_matrix_rows() -> list[dict[str, str]]:
    """The documented specification of every gate, for reports and docs."""
    return [{"gate": g, "phase": p, "collector": c, "criterion": k, "evidence": e, "invalidated_by": i}
            for g, (p, c, k, e, i) in GATE_SPECS.items()]


def _approval_valid(approval: Any) -> bool:
    return (isinstance(approval, Mapping)
            and isinstance(approval.get("run_id"), (int, str)) and bool(str(approval.get("run_id")).strip())
            and isinstance(approval.get("sha"), str) and len(approval["sha"]) == 40)


def reconcile_gates(evidence: Mapping[str, Mapping[str, Any]] | None,
                    *, predem_approval: Mapping[str, Any] | None = None) -> dict[str, Any]:
    """Return a complete matrix; absent, malformed, or unknown evidence fails closed.

    State machine: PRE_DEM gates are evaluated on their own. A POST_DEM gate may
    be VERIFIED only together with a pre-DEM approval (the id and commit of the
    activation run that approved the laboratory run); without it, a VERIFIED
    post-DEM claim becomes FAIL, never accepted, and post-DEM evidence is never
    consulted for the pre-DEM decision.
    """
    supplied = evidence if isinstance(evidence, Mapping) else {}
    matrix: dict[str, dict[str, Any]] = {}
    for gate in GATES:
        phase, collector = GATE_SPECS[gate][0], GATE_SPECS[gate][1]
        item = supplied.get(gate)
        status = item.get("status") if isinstance(item, Mapping) else None
        evidence_ref = item.get("evidence_ref") if isinstance(item, Mapping) else None
        if status not in ALLOWED_STATUSES or not isinstance(evidence_ref, str) or not evidence_ref:
            matrix[gate] = {"status": "NOT_PROVEN", "evidence_ref": "MISSING_OR_INVALID_EVIDENCE"}
        else:
            matrix[gate] = {"status": status, "evidence_ref": evidence_ref}
        matrix[gate].update(phase=phase, collector=collector)

    approval_valid = _approval_valid(predem_approval)
    for gate in POST_DEM_GATES:
        if matrix[gate]["status"] == "VERIFIED" and not approval_valid:
            matrix[gate] = dict(matrix[gate], status="FAIL",
                                evidence_ref="POST_DEM_EVIDENCE_WITHOUT_PREDEM_APPROVAL")

    pre_blockers = [g for g in PRE_DEM_GATES if matrix[g]["status"] != "VERIFIED"]
    post_blockers = [g for g in POST_DEM_GATES if matrix[g]["status"] != "VERIFIED"]
    blockers = [g for g in GATES if matrix[g]["status"] != "VERIFIED"]
    failed = [g for g in GATES if matrix[g]["status"] == "FAIL"]
    predem_decision = "BLOCKED" if pre_blockers else PREDEM_READY
    if any(matrix[g]["status"] == "FAIL" for g in POST_DEM_GATES):
        postdem_decision = "FAIL"
    elif not approval_valid:
        postdem_decision = "NOT_STARTED"
    elif post_blockers:
        postdem_decision = "BLOCKED"
    else:
        postdem_decision = "VERIFIED"
    return {
        "schema_version": 2,
        "operation": "R5.8.4_32_GATE_RECONCILIATION",
        "side_effects": False,
        "gate_count": len(matrix),
        "gates": matrix,
        "blockers": blockers,
        "failed": failed,
        "phases": {
            "pre_dem": {"gates": list(PRE_DEM_GATES), "blockers": pre_blockers, "decision": predem_decision},
            "post_dem": {"gates": list(POST_DEM_GATES), "blockers": post_blockers, "decision": postdem_decision,
                         "predem_approval": dict(predem_approval) if approval_valid else None},
        },
        "predem_decision": predem_decision,
        "postdem_decision": postdem_decision,
        "decision": "FAIL" if failed else ("BLOCKED" if blockers else READY),
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

    Only gates whose collector is R5.8.3 are taken from it, and only from values
    the preflight computed (never from literals). The pins compared are the
    shared ones in scripts/parser_runtime_attestation.py, so a re-pin changes one
    place. No gate produced here grants Attempt 9 or Canonical execution authority.
    """
    from scripts.parser_runtime_attestation import BRANCH, DEPLOYMENT, DEPLOYMENT_SOURCE_COMMIT

    p = preflight if isinstance(preflight, Mapping) else {}

    def section(key: str) -> Mapping[str, Any]:
        value = p.get(key)
        return value if isinstance(value, Mapping) else {}

    railway, runtime, health = section("railway"), section("runtime"), section("health")
    hashes, workflow, mapping = section("critical_hashes"), section("attestation_workflow"), section("mapping_authority")

    def ev(ref: str) -> dict[str, str]:
        return {"status": "VERIFIED", "evidence_ref": ref}

    verified: dict[str, dict[str, Any]] = {}
    computed = mapping.get("computed_from") == "docs/client-parser/canonical-mapping-inventory.json"
    if computed and mapping.get("artifact_matches") is True:
        verified["mapping_release_valid"] = ev("r5.8.3.mapping_authority")
        if mapping.get("inventory_rows") == 105:
            verified["inventory_105"] = ev("r5.8.3.mapping_authority.inventory_rows")
        if mapping.get("generic") == 0:
            verified["zero_generic"] = ev("r5.8.3.mapping_authority.generic")
        if mapping.get("authorized") == 0:
            verified["canonical_authorization_false"] = ev("r5.8.3.mapping_authority.authorized")
    if railway.get("api_query_succeeded") is True:
        verified["railway_token_configured"] = ev("r5.8.3.railway.api_query_succeeded")
    # Commit and branch describe the runtime only while the pinned deployment
    # is the one serving (SUCCESS). The commit of a REMOVED deployment proves
    # nothing about what runs now.
    serving = railway.get("id") == DEPLOYMENT and railway.get("status") == "SUCCESS"
    if serving:
        verified["railway_deployment_exact"] = ev("r5.8.3.railway")
    if serving and railway.get("commitHash") == DEPLOYMENT_SOURCE_COMMIT:
        verified["railway_commit_exact"] = ev("r5.8.3.railway")
    if serving and railway.get("branch") == BRANCH:
        verified["railway_branch_exact"] = ev("r5.8.3.railway")
    if len(runtime) == 2 and all(isinstance(item, Mapping) and item.get("match") is True for item in runtime.values()):
        verified["live_version_exact"] = ev("r5.8.3.runtime")
    if len(health) == 2 and all(isinstance(item, Mapping) and item.get("ok") is True for item in health.values()):
        verified["live_health_exact"] = ev("r5.8.3.health")
    if hashes and all(isinstance(item, Mapping) and item.get("match") is True for item in hashes.values()):
        verified["critical_hashes_exact"] = ev("r5.8.3.critical_hashes")
    if p.get("oidc_immutable_subject_present") is True:
        verified["oidc_immutable_subject"] = ev("r5.8.3.oidc_subject")
    if workflow.get("approved") is True:
        verified["workflow_identity_valid"] = ev("r5.8.3.attestation_workflow")
    if test_suite_passed:
        verified["python_tests"] = ev(f"workflow_run:{workflow_run_id}:focused-tests")

    result = reconcile_gates(verified)
    result["source"] = {
        "workflow": "R5.8.3 Read-Only Release Preflight",
        "workflow_run_id": str(workflow_run_id),
        "workflow_run_sha": workflow_run_sha,
        "preflight_decision": p.get("decision"),
        "preflight_failures": list(p.get("failures") or []),
    }
    # What R5.8.4 itself is responsible for: the gates collected from R5.8.3.
    own = [g for g in PRE_DEM_GATES if GATE_SPECS[g][1] == R583]
    result["own_scope"] = {"collector": R583, "gates": own,
                           "blockers": [g for g in own if result["gates"][g]["status"] != "VERIFIED"]}
    result["pending_collectors"] = sorted({GATE_SPECS[g][1] for g in result["blockers"]} - {R583})
    return result


R583_JOB_NAME = "preflight"
R583_TEST_STEP = "Run focused attestation/governance tests"


def focused_tests_passed(jobs: Any) -> bool:
    """Whether the R5.8.3 run's own focused-test step succeeded.

    Read from the source run's job record, never assumed: exactly one
    `preflight` job, and in it exactly one focused-test step that concluded
    `success`. Anything else (missing, skipped, cancelled, duplicated) is False.
    """
    if not isinstance(jobs, list):
        return False
    matching = [j for j in jobs if isinstance(j, Mapping) and j.get("name") == R583_JOB_NAME]
    if len(matching) != 1:
        return False
    steps = [s for s in (matching[0].get("steps") or [])
             if isinstance(s, Mapping) and s.get("name") == R583_TEST_STEP]
    return len(steps) == 1 and steps[0].get("conclusion") == "success"


def annotations(result: Mapping[str, Any]) -> list[str]:
    """Workflow commands carrying the decisions and blockers (gate names only)."""
    own = result.get("own_scope") if isinstance(result.get("own_scope"), Mapping) else {}
    ready = exit_code(result) == 0
    source = result.get("source") if isinstance(result.get("source"), Mapping) else {}
    text = json.dumps({
        "decision": result.get("decision"),
        "predem_decision": result.get("predem_decision"),
        "postdem_decision": result.get("postdem_decision"),
        "verified": sum(1 for v in (result.get("gates") or {}).values() if v.get("status") == "VERIFIED"),
        "gate_count": result.get("gate_count"),
        "own_scope_blockers": list(own.get("blockers") or []),
        "pending_collectors": list(result.get("pending_collectors") or []),
        "preflight_decision": source.get("preflight_decision"),
        "preflight_failures": list(source.get("preflight_failures") or []),
    }, sort_keys=True).replace("%", "%25").replace("\r", "%0D").replace("\n", "%0A")
    return [f"::{'notice' if ready else 'error'} title=R5.8.4 decision::{text}"]


def exit_code(result: Mapping[str, Any]) -> int:
    """0 only when every gate R5.8.4 is responsible for is VERIFIED.

    Gates owned by other collectors stay visible as pending; they are judged by
    the activation gate (pre-DEM) or the post-DEM reconciliation, never here.
    """
    if result.get("attempt_9_authorized") or result.get("canonical_authorized") or result.get("failed"):
        return 1
    own = result.get("own_scope")
    if not isinstance(own, Mapping) or not isinstance(own.get("gates"), list) or not own["gates"]:
        return 1
    return 0 if not own.get("blockers") else 1
