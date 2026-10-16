#!/usr/bin/env python3
"""H.3-E activation gate: repeatable, read-only, fail-closed.

Replaces the one-shot H.3-E.5 / H.3-E.6 workflows, which ran only when the
previous head of main was one fixed commit and were skipped on every other push.

For one target commit of main (the current head) this gate proves, or refuses:

  prerequisites  the push runs of Quality Gates (including `Main required gates`),
                 F553 post-completion, R5.8.3 and R5.8.4 for that exact commit
                 succeeded, and the R5.8.3 / R5.8.4 evidence artifacts say so in
                 their *decision*, not only in their check colour;
  transport      the attestation endpoint refuses a request without the
                 transport secret (401) and accepts the secret while rejecting
                 the empty payload (400 ATTESTATION_PAYLOAD_INVALID). No
                 attestation is ever submitted;
  runtime        both worker hosts answer /health and /version, report one
                 embedded build commit whose declared revision matches, Railway's
                 active deployment was built from that commit, and that commit's
                 `services/cs2-demo-parser` tree is identical to the target's;
                 the declared semantic revision names a commit of the target's
                 history whose worker tree is that same deployed tree.
  persistence    the Queue Semantics probes of the target commit (disposable
                 database, synthetic, rolled back) all report PASS;
  predem_matrix  the 28 pre-DEM gates of the R5.8.4 matrix are VERIFIED, using
                 R5.8.4 for the gates it collects and the stages above for
                 remote_ci, transport, endpoint and persistence. Post-DEM gates
                 (parity, determinism, tick authority, runtime frozen) are
                 outputs of the laboratory run and are never consulted here.

PASS is the pre-DEM approval: an operator may dispatch the A9.1 laboratory run
for this exact commit, citing this run. It is never production authority.

Every stage is PASS, FAIL, BLOCKED or SKIPPED. Only PASS everywhere gives the
decision PASS. SKIPPED is never evidence. The gate never dispatches a workflow,
submits an attestation, runs a demo, writes provenance or changes Railway.
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import subprocess
import tempfile
import urllib.error
import urllib.request
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

PASS, FAIL, BLOCKED, SKIPPED = "PASS", "FAIL", "BLOCKED", "SKIPPED"
SHA = re.compile(r"^[0-9a-f]{40}$")

REPOSITORY = "GameProAcademy/cs2-pro-hub"
WORKER_DIR = "services/cs2-demo-parser"
ATTESTATION_ENDPOINT = "https://gamepro.network/api/public/parser-attestation"
SNAPSHOT_ENDPOINT = "https://gamepro.network/api/public/predem-managed-snapshot"
# Gates proven by the managed-database snapshot (7 database gates and the 3
# gates proven by a VERIFIED attestation of the active runtime).
SNAPSHOT_GATES = ("db_git_digest_parity", "identity_validation", "retention_guard", "attempt_9_absent",
                  "metrics_uncontaminated", "features_uncontaminated", "canonical_uncontaminated",
                  "provenance_verified", "hmac_configured", "oidc_operational")
RUNTIME_FINGERPRINT_ENDPOINT = "https://gamepro.network/api/public/parser-attestation-runtime"
HOSTS = ("https://parser.gamepro.network", "https://cs2-demo-parser-production.up.railway.app")
RAILWAY_API = "https://backboard.railway.com/graphql/v2"
RAILWAY = {
    "projectId": "aa2176ec-0e35-45f0-8cfa-9f8c0707dca4",
    "serviceId": "706fa246-a263-484f-a986-c74516be862b",
    "environmentId": "2385d707-795d-4e32-a00b-0afaba0a9b7e",
}
WORKFLOWS = {
    "quality_gates": ("quality-gates.yml", "Quality Gates", "push"),
    "f553_post_completion": ("f553-r11-post-completion.yml", "F553 R11.2 post-completion attestation", "workflow_run"),
    "r5_8_3": ("r5-8-3-read-only-preflight.yml", "R5.8.3 Read-Only Release Preflight", "push"),
    "r5_8_4": ("r5-8-4-gate-reconciliation.yml", "R5.8.4 Read-Only Gate Reconciliation", "workflow_run"),
    "queue_semantics": ("queue-semantics-probe.yml", "Queue Semantics Probe", "push"),
}
QUEUE_JOBS = ("Queue semantics on a disposable database",
              "Queue recovery end to end (real worker, real bridge, real storage)")
#: Every probe that proves persistence, idempotency, recovery and the recorder on
#: a disposable database. Each must report PASS with nothing left unpassed.
PERSISTENCE_PROBES = frozenset({
    "DEMO_PARSE_QUEUE_SEMANTICS", "DEMO_PARSE_RECOVERY_PROTOCOL", "CANONICAL_PERSISTENCE_IDEMPOTENCY",
    "ATTESTATION_RECORDER_RECONCILIATION", "DEMO_PARSE_RECOVERY_END_TO_END",
})
PREDEM_READY = "READY_FOR_PREDEM_REVIEW"
R583_GREEN = "GREEN_FOR_FRESH_ATTESTATION_PREFLIGHT"
R584_GREEN = "READY_FOR_OPERATOR_REVIEW"
SIDE_EFFECTS = {
    "dem_execution": "NOT_RUN",
    "attestation_execution": "NOT_RUN",
    "provenance_write": "NOT_RUN",
    "railway_mutation": "NOT_RUN",
    "workflow_dispatch": "NOT_RUN",
}


def stage(status: str, **details: Any) -> dict[str, Any]:
    assert status in (PASS, FAIL, BLOCKED, SKIPPED)
    return {"status": status, **details}


# What kind of outcome each stage reason is, so a report never confuses a
# negative result with evidence that is missing, invalid, stale, still being
# produced, or that could not be collected. Every reason emitted in this file
# must be listed (scripts/ci/test_h3e_activation_gate.py enforces it).
APPROVED, REJECTED = "APPROVED", "REJECTED"
MISSING, INVALID, STALE = "EVIDENCE_MISSING", "EVIDENCE_INVALID", "EVIDENCE_STALE"
RUNNING, INFRASTRUCTURE, NOT_EVALUATED = "STILL_RUNNING", "INFRASTRUCTURE_FAILURE", "NOT_EVALUATED"
REASON_CATEGORY: dict[str, str] = {
    **dict.fromkeys(("BRIDGE_IDENTITY_NOT_PUBLISHED", "SNAPSHOT_ENDPOINT_NOT_PUBLISHED",
                     "SNAPSHOT_GATES_NOT_VERIFIED", "SNAPSHOT_SECRET_MISSING"), MISSING),
    **dict.fromkeys(("SNAPSHOT_ENDPOINT_UNREACHABLE", "SNAPSHOT_UNAVAILABLE"), INFRASTRUCTURE),
    **dict.fromkeys(("SNAPSHOT_UNUSABLE", "SNAPSHOT_RESPONSE_INVALID", "SNAPSHOT_PINS_UNAVAILABLE"), INVALID),
    **dict.fromkeys(("SNAPSHOT_GATES_FAILED", "SNAPSHOT_UNAUTHORIZED"), REJECTED),
    **dict.fromkeys(("BRIDGE_EXPECTED_BUILD_UNCONFIGURED", "BRIDGE_EXPECTED_BUILD_MISMATCH",
                     "BRIDGE_IDENTITY_NOT_ENFORCED"), REJECTED),
    **dict.fromkeys(("BRIDGE_IDENTITY_UNREACHABLE", "SERVED_BUILD_UNAVAILABLE"), INFRASTRUCTURE),
    **dict.fromkeys(("PARSER_LOCK_NOT_PUBLISHED",), MISSING),
    **dict.fromkeys(("PARSER_LOCK_IDENTITY_MISMATCH", "PARSER_LOCK_REVISION_MISMATCH",
                     "PARSER_LOCK_BUILD_UNCONFIGURED", "PARSER_LOCK_BUILD_MISMATCH",
                     "PARSER_LOCK_NOT_REQUIRED"), REJECTED),
    **dict.fromkeys(("ARTIFACT_NOT_FOUND", "RUN_NOT_FOUND", "JOB_NOT_FOUND_EXACTLY_ONCE", "QUEUE_JOB_NOT_FOUND",
                     "QUEUE_PROBE_MISSING", "NO_ARTIFACT", "PREDEM_GATES_NOT_VERIFIED"), MISSING),
    **dict.fromkeys(("RUN_NOT_COMPLETED", "EVIDENCE_RUN_NOT_FINISHED", "R583_RUN_NOT_FINISHED"), RUNNING),
    **dict.fromkeys(("COLLECTION_ERROR", "ENDPOINT_UNREACHABLE", "HEALTH_NOT_OK", "VERSION_UNAVAILABLE",
                     "RAILWAY_ACTIVE_DEPLOYMENT_UNVERIFIED"), INFRASTRUCTURE),
    **dict.fromkeys(("ARTIFACT_CONTENT_UNEXPECTED", "ARTIFACT_DIGEST_MISMATCH", "ARTIFACT_NAME_OR_EXPIRY_MISMATCH",
                     "ARTIFACT_UNREADABLE", "ARTIFACT_FROM_ANOTHER_RUN", "QUEUE_PROBE_REPORTED_TWICE",
                     "QUEUE_PROBE_REPORT_UNREADABLE", "R584_MATRIX_MALFORMED", "R583_SIDE_EFFECTS_NOT_FALSE",
                     "R584_SIDE_EFFECTS_NOT_FALSE", "R584_CLAIMS_AUTHORIZATION", "R584_POST_DEM_CLAIMED_BEFORE_THE_RUN",
                     "WORKFLOW_NAME_MISMATCH", "PREDEM_MATRIX_INCOMPLETE", "NO_VALID_ARTIFACT",
                     "R584_MATRIX_UNAVAILABLE", "TARGET_SHA_INVALID"), INVALID),
    **dict.fromkeys(("TARGET_IS_NOT_CURRENT_MAIN_HEAD", "R583_EVIDENCE_FOR_ANOTHER_COMMIT",
                     "R584_EVIDENCE_FOR_ANOTHER_R583_RUN"), STALE),
    **dict.fromkeys(("QUALITY_GATES_NOT_PASS", "QUEUE_SEMANTICS_NOT_PASS", "TARGET_NOT_PASS"), NOT_EVALUATED),
    **dict.fromkeys((
        "BUILD_COMMIT_NOT_ON_TARGET_HISTORY", "BUILD_IDENTITY_NOT_EMBEDDED", "BUILD_IDENTITY_SOURCE_UNKNOWN",
        "BUILD_REVISION_NOT_EMBEDDED_COMMIT", "DECLARED_REVISION_MISMATCH", "ENDPOINT_NOT_APPROVED",
        "HOSTS_REPORT_DIFFERENT_BUILDS", "HOSTS_REPORT_DIFFERENT_REVISIONS", "JOB_NOT_SUCCESS",
        "QUEUE_PROBE_NOT_PASS", "R583_DECISION_NOT_GREEN", "R584_OWN_SCOPE_NOT_VERIFIED",
        "RAILWAY_DEPLOYMENT_COMMIT_MISMATCH", "RUN_NOT_SUCCESS", "SECRET_MISSING",
        "SEMANTIC_REVISION_DOES_NOT_DESCRIBE_BUILD", "SEMANTIC_REVISION_INVALID",
        "SEMANTIC_REVISION_NOT_ON_TARGET_HISTORY", "SERVER_NOT_CONFIGURED", "TRANSPORT_UNEXPECTED_RESPONSE",
        "WORKER_TREE_DIFFERS"), REJECTED),
}


def categorize(value: dict[str, Any]) -> str:
    status, reason = value.get("status"), value.get("reason")
    if status == PASS:
        return APPROVED
    if reason in REASON_CATEGORY:
        return REASON_CATEGORY[reason]
    # An unlisted reason is a defect of this file (the test catches it); never PASS.
    return {FAIL: REJECTED, BLOCKED: MISSING, SKIPPED: NOT_EVALUATED}.get(status, INVALID)


# --------------------------------------------------------------------------- pure evaluation


def latest_run(runs: list[dict[str, Any]], *, sha: str, event: str) -> dict[str, Any] | None:
    """The newest run of one workflow for one commit and event (reruns included)."""
    mine = [r for r in runs if r.get("head_sha") == sha and r.get("event") == event
            and r.get("head_branch") == "main"
            and (r.get("repository") or {}).get("full_name") == REPOSITORY]
    if not mine:
        return None
    return max(mine, key=lambda r: (int(r.get("run_number") or 0), int(r.get("run_attempt") or 0)))


def evaluate_run(run: dict[str, Any] | None, *, name: str) -> dict[str, Any]:
    if run is None:
        return stage(BLOCKED, reason="RUN_NOT_FOUND")
    common = {"run_id": run.get("id"), "run_attempt": run.get("run_attempt"), "url": run.get("html_url")}
    if run.get("name") != name:
        return stage(FAIL, reason="WORKFLOW_NAME_MISMATCH", **common)
    if run.get("status") != "completed":
        return stage(BLOCKED, reason="RUN_NOT_COMPLETED", observed=run.get("status"), **common)
    if run.get("conclusion") != "success":
        # skipped, cancelled, failure, neutral, timed_out: none of them is evidence.
        return stage(FAIL, reason="RUN_NOT_SUCCESS", observed=run.get("conclusion"), **common)
    return stage(PASS, **common)


def evaluate_producer(run: dict[str, Any] | None, *, name: str) -> dict[str, Any]:
    """Whether a run's evidence may be read: the right workflow, completed, and
    finished as success or failure. R5.8.3 and R5.8.4 fail when their decision
    is not green, and their evidence still says why; the run itself is judged
    separately by `evaluate_run`, so reading it never turns a failure into a pass."""
    if run is None:
        return stage(BLOCKED, reason="RUN_NOT_FOUND")
    if run.get("name") != name:
        return stage(FAIL, reason="WORKFLOW_NAME_MISMATCH")
    if run.get("status") != "completed" or run.get("conclusion") not in ("success", "failure"):
        return stage(BLOCKED, reason="EVIDENCE_RUN_NOT_FINISHED", observed=run.get("conclusion") or run.get("status"))
    return stage(PASS)


def evaluate_job(jobs: list[dict[str, Any]], *, job_name: str) -> dict[str, Any]:
    matching = [j for j in jobs if j.get("name") == job_name]
    if len(matching) != 1:
        return stage(BLOCKED, reason="JOB_NOT_FOUND_EXACTLY_ONCE", observed=len(matching))
    job = matching[0]
    if job.get("conclusion") != "success":
        return stage(FAIL, reason="JOB_NOT_SUCCESS", observed=job.get("conclusion"))
    return stage(PASS, job_id=job.get("id"))


def evaluate_artifact(meta: dict[str, Any] | None, blob: bytes | None, *, run_id: Any,
                      expected_name: str) -> tuple[dict[str, Any], dict[str, Any] | None]:
    """Integrity of one evidence artifact; returns (stage, parsed json)."""
    if meta is None or blob is None:
        return stage(BLOCKED, reason="ARTIFACT_NOT_FOUND", expected_name=expected_name), None
    if meta.get("name") != expected_name or meta.get("expired"):
        return stage(FAIL, reason="ARTIFACT_NAME_OR_EXPIRY_MISMATCH", observed=meta.get("name")), None
    if (meta.get("workflow_run") or {}).get("id") != run_id:
        return stage(FAIL, reason="ARTIFACT_FROM_ANOTHER_RUN"), None
    digest = "sha256:" + hashlib.sha256(blob).hexdigest()
    if meta.get("digest") != digest:
        return stage(FAIL, reason="ARTIFACT_DIGEST_MISMATCH", observed=digest), None
    try:
        with zipfile.ZipFile(_bytes_io(blob)) as archive:
            names = archive.namelist()
            if len(names) != 1:
                return stage(FAIL, reason="ARTIFACT_CONTENT_UNEXPECTED", observed=names), None
            document = json.loads(archive.read(names[0]))
    except (zipfile.BadZipFile, ValueError):
        return stage(FAIL, reason="ARTIFACT_UNREADABLE"), None
    return stage(PASS, artifact_id=meta.get("id"), digest=digest), document


def evaluate_r583(document: dict[str, Any], *, sha: str) -> dict[str, Any]:
    if (document.get("github") or {}).get("sha") != sha:
        return stage(FAIL, reason="R583_EVIDENCE_FOR_ANOTHER_COMMIT")
    if document.get("side_effects") is not False:
        return stage(FAIL, reason="R583_SIDE_EFFECTS_NOT_FALSE")
    if document.get("decision") != R583_GREEN or document.get("failures"):
        return stage(FAIL, reason="R583_DECISION_NOT_GREEN", decision=document.get("decision"),
                     failures=list(document.get("failures") or []))
    return stage(PASS, decision=document.get("decision"))


def evaluate_r584(document: dict[str, Any], *, r583_run_id: Any, sha: str) -> dict[str, Any]:
    """Integrity of the R5.8.4 matrix for this commit, and its own scope.

    R5.8.4 can never be READY as a whole before the real-DEM laboratory run:
    its post-DEM gates are outputs of that run. What it must prove here is that
    every gate it collects (from R5.8.3) is VERIFIED and that no post-DEM gate
    is claimed in advance. The remaining pre-DEM gates are judged by
    `evaluate_predem` with the evidence this gate collects itself.
    """
    source = document.get("source") if isinstance(document.get("source"), dict) else {}
    if str(source.get("workflow_run_id")) != str(r583_run_id) or source.get("workflow_run_sha") != sha:
        return stage(FAIL, reason="R584_EVIDENCE_FOR_ANOTHER_R583_RUN")
    if document.get("side_effects") is not False:
        return stage(FAIL, reason="R584_SIDE_EFFECTS_NOT_FALSE")
    if document.get("attempt_9_authorized") or document.get("canonical_authorized"):
        return stage(FAIL, reason="R584_CLAIMS_AUTHORIZATION")
    phases = document.get("phases") if isinstance(document.get("phases"), dict) else {}
    pre, post = phases.get("pre_dem"), phases.get("post_dem")
    gates = document.get("gates") if isinstance(document.get("gates"), dict) else {}
    own = document.get("own_scope") if isinstance(document.get("own_scope"), dict) else {}
    if (document.get("schema_version") != 2 or not isinstance(pre, dict) or not isinstance(post, dict)
            or len(gates) != 32 or not isinstance(own.get("gates"), list) or not own["gates"]):
        return stage(FAIL, reason="R584_MATRIX_MALFORMED")
    claimed = sorted(g for g in post.get("gates") or [] if (gates.get(g) or {}).get("status") == "VERIFIED")
    if claimed or post.get("predem_approval") is not None:
        return stage(FAIL, reason="R584_POST_DEM_CLAIMED_BEFORE_THE_RUN", observed=claimed)
    if own.get("blockers"):
        return stage(FAIL, reason="R584_OWN_SCOPE_NOT_VERIFIED", blockers=list(own["blockers"]))
    return stage(PASS, decision=document.get("predem_decision"))


def evaluate_persistence(annotations_by_job: dict[str, list[dict[str, Any]] | None]) -> dict[str, Any]:
    """The disposable-database probes of the target commit, from their own reports."""
    seen: dict[str, dict[str, Any]] = {}
    for job in QUEUE_JOBS:
        listed = annotations_by_job.get(job)
        if listed is None:
            return stage(BLOCKED, reason="QUEUE_JOB_NOT_FOUND", observed=job)
        for item in listed:
            if item.get("title") != "Queue probe":
                continue
            try:
                summary = json.loads(item.get("message") or "")
            except ValueError:
                return stage(FAIL, reason="QUEUE_PROBE_REPORT_UNREADABLE")
            name = summary.get("probe")
            if name in seen:
                return stage(FAIL, reason="QUEUE_PROBE_REPORTED_TWICE", observed=name)
            seen[name] = summary
    missing = sorted(PERSISTENCE_PROBES - set(seen))
    if missing:
        return stage(BLOCKED, reason="QUEUE_PROBE_MISSING", missing=missing)
    failing = sorted(n for n in PERSISTENCE_PROBES
                     if seen[n].get("status") != "PASS" or seen[n].get("not_passed") or seen[n].get("known_defects")
                     or not isinstance(seen[n].get("total"), int) or seen[n]["total"] < 1
                     or seen[n].get("passed") != seen[n]["total"])
    if failing:
        return stage(FAIL, reason="QUEUE_PROBE_NOT_PASS", observed=failing)
    return stage(PASS, probes={n: f"{seen[n]['passed']}/{seen[n]['total']}" for n in sorted(PERSISTENCE_PROBES)})


#: Pre-DEM gates of the R5.8.4 matrix that this activation gate proves itself.
ACTIVATION_COLLECTED = {
    "remote_ci": ("quality_gates", "main_required_gates", "f553_post_completion"),
    "transport_secret_configured": ("transport",),
    "endpoint_configured": ("transport",),
    "persistence_validation": ("persistence",),
}


def evaluate_predem(document: dict[str, Any] | None, stages: dict[str, dict[str, Any]]) -> dict[str, Any]:
    """The complete pre-DEM matrix: R5.8.4's gates plus the ones proven here.

    Post-DEM gates are not consulted at all. A pre-DEM gate counts only when it
    is VERIFIED; there is no default, override or manual waiver.
    """
    if not isinstance(document, dict):
        return stage(BLOCKED, reason="R584_MATRIX_UNAVAILABLE")
    gates = document.get("gates") if isinstance(document.get("gates"), dict) else {}
    pre = ((document.get("phases") or {}).get("pre_dem") or {}).get("gates") or []
    matrix: dict[str, str] = {}
    snapshot_gates = (stages.get("managed_snapshot") or {}).get("gates")
    snapshot_gates = snapshot_gates if isinstance(snapshot_gates, dict) else {}
    for gate in pre:
        if gate in SNAPSHOT_GATES:
            # Only this run's snapshot counts; R5.8.4 has no path to the managed database.
            matrix[gate] = (snapshot_gates.get(gate) or {}).get("status") or "NOT_PROVEN"
        elif gate in ACTIVATION_COLLECTED:
            proven = all((stages.get(s) or {}).get("status") == PASS for s in ACTIVATION_COLLECTED[gate])
            matrix[gate] = "VERIFIED" if proven else "NOT_PROVEN"
        else:
            matrix[gate] = (gates.get(gate) or {}).get("status") or "NOT_PROVEN"
    blockers = sorted(g for g, status in matrix.items() if status != "VERIFIED")
    def collector(g: str) -> str | None:
        if g in SNAPSHOT_GATES:
            return "H.3-E activation gate (managed-database snapshot)"
        return "H.3-E activation gate" if g in ACTIVATION_COLLECTED else (gates.get(g) or {}).get("collector")
    gates_detail = {g: {"status": matrix[g], "collector": collector(g)} for g in matrix}
    if len(matrix) != 28:
        return stage(FAIL, reason="PREDEM_MATRIX_INCOMPLETE", observed=len(matrix))
    if blockers:
        collectors = sorted({collector(g) or "H.3-E activation gate" for g in blockers})
        return stage(BLOCKED, reason="PREDEM_GATES_NOT_VERIFIED", blockers=blockers, missing=collectors,
                     verified=len(matrix) - len(blockers), gates=gates_detail)
    return stage(PASS, decision=PREDEM_READY, verified=len(matrix), gates=gates_detail)


def evaluate_transport(*, secrets_present: dict[str, bool], endpoint_matches: bool,
                       unauthenticated: dict[str, Any] | None,
                       authenticated: dict[str, Any] | None) -> dict[str, Any]:
    missing = sorted(k for k, ok in secrets_present.items() if not ok)
    if missing:
        return stage(FAIL, reason="SECRET_MISSING", missing=missing)
    if not endpoint_matches:
        return stage(FAIL, reason="ENDPOINT_NOT_APPROVED")
    for label, probe, want_status, want_error in (
        ("unauthenticated", unauthenticated, 401, "UNAUTHORIZED"),
        ("authenticated", authenticated, 400, "ATTESTATION_PAYLOAD_INVALID"),
    ):
        if probe is None or probe.get("status") is None:
            return stage(BLOCKED, reason="ENDPOINT_UNREACHABLE", probe=label)
        if probe["status"] == 503:
            return stage(FAIL, reason="SERVER_NOT_CONFIGURED", probe=label)
        if probe["status"] != want_status or probe.get("error") != want_error:
            return stage(FAIL, reason="TRANSPORT_UNEXPECTED_RESPONSE", probe=label,
                         observed={"status": probe["status"], "error": probe.get("error")})
    return stage(PASS, unauthenticated="401 UNAUTHORIZED", authenticated="400 ATTESTATION_PAYLOAD_INVALID",
                 attestation_submitted=False)


def evaluate_runtime(*, versions: dict[str, Any], healths: dict[str, Any], target_sha: str,
                     tree: Callable[[str], str | None], is_ancestor: Callable[[str, str], bool],
                     railway: dict[str, Any] | None) -> dict[str, Any]:
    for host in HOSTS:
        health = healths.get(host)
        if not isinstance(health, dict) or health.get("status") != "ok":
            return stage(BLOCKED, reason="HEALTH_NOT_OK", host=host)
        body = versions.get(host)
        if not isinstance(body, dict):
            return stage(BLOCKED, reason="VERSION_UNAVAILABLE", host=host)
    builds = [((versions[h].get("build") or {})) for h in HOSTS]
    commits = {b.get("commit") for b in builds}
    if len(commits) != 1:
        return stage(FAIL, reason="HOSTS_REPORT_DIFFERENT_BUILDS", observed=sorted(map(str, commits)))
    build = builds[0]
    commit = build.get("commit")
    if build.get("embedded") is not True or not isinstance(commit, str) or not SHA.match(commit):
        return stage(FAIL, reason="BUILD_IDENTITY_NOT_EMBEDDED")
    if build.get("source") not in ("railway", "build-arg"):
        return stage(FAIL, reason="BUILD_IDENTITY_SOURCE_UNKNOWN")
    if build.get("declared_revision_matches") is not True:
        return stage(FAIL, reason="DECLARED_REVISION_MISMATCH", build_commit=commit)
    # `declared_revision_matches` compares PARSER_BUILD_REVISION (or, without it,
    # PARSER_REVISION) with the embedded commit, so once a build revision is set
    # it says nothing about the semantic revision. That one is checked here,
    # against git, independently of what the worker reports about it: it must
    # name a commit of the target's history whose worker tree is the deployed one.
    parsers = [((versions[h].get("parser") or {})) for h in HOSTS]
    semantics = {str(p.get("semantic_revision")) for p in parsers}
    declared_builds = {str(p.get("build_revision")) for p in parsers}
    if len(semantics) != 1 or len(declared_builds) != 1:
        return stage(FAIL, reason="HOSTS_REPORT_DIFFERENT_REVISIONS", build_commit=commit)
    semantic, declared_build = semantics.pop(), declared_builds.pop()
    if declared_build != f"git:{commit}":
        return stage(FAIL, reason="BUILD_REVISION_NOT_EMBEDDED_COMMIT", build_commit=commit,
                     observed=declared_build)
    semantic_commit = semantic[4:] if semantic.startswith("git:") else ""
    if not SHA.match(semantic_commit):
        return stage(FAIL, reason="SEMANTIC_REVISION_INVALID", build_commit=commit, observed=semantic)
    if railway is None or railway.get("status") != "SUCCESS":
        failure = railway or {}
        return stage(BLOCKED, reason="RAILWAY_ACTIVE_DEPLOYMENT_UNVERIFIED", build_commit=commit,
                     error=failure.get("error"), observed=failure.get("messages") or failure.get("observed"))
    if railway.get("commitHash") != commit:
        return stage(FAIL, reason="RAILWAY_DEPLOYMENT_COMMIT_MISMATCH", build_commit=commit,
                     railway_commit=railway.get("commitHash"))
    if not is_ancestor(commit, target_sha):
        return stage(FAIL, reason="BUILD_COMMIT_NOT_ON_TARGET_HISTORY", build_commit=commit)
    built, target = tree(commit), tree(target_sha)
    if not built or built != target:
        return stage(FAIL, reason="WORKER_TREE_DIFFERS", build_commit=commit, build_tree=built, target_tree=target)
    if not is_ancestor(semantic_commit, target_sha):
        return stage(FAIL, reason="SEMANTIC_REVISION_NOT_ON_TARGET_HISTORY", build_commit=commit,
                     observed=semantic)
    if tree(semantic_commit) != built:
        return stage(FAIL, reason="SEMANTIC_REVISION_DOES_NOT_DESCRIBE_BUILD", build_commit=commit,
                     observed=semantic, semantic_tree=tree(semantic_commit), build_tree=built)
    return stage(PASS, build_commit=commit, worker_tree=built, railway_deployment=railway.get("id"),
                 semantic_revision=semantic,
                 note="identical worker tree; a rebuild would only relabel the image")


def evaluate_bridge(fingerprint: dict[str, Any] | None, versions: dict[str, Any]) -> dict[str, Any]:
    """The build the execution bridge accepts must be the build both hosts serve.

    The bridge returns 503 to every execution event of any other build, so a
    mismatch makes the worker unable to record (and therefore to parse).
    """
    if not isinstance(fingerprint, dict):
        return stage(BLOCKED, reason="BRIDGE_IDENTITY_UNREACHABLE")
    bridge = fingerprint.get("bridge")
    if not isinstance(bridge, dict):
        # The application version serving this route predates the field.
        return stage(BLOCKED, reason="BRIDGE_IDENTITY_NOT_PUBLISHED")
    if any(not isinstance(versions.get(h), dict) for h in HOSTS):
        return stage(BLOCKED, reason="SERVED_BUILD_UNAVAILABLE")
    served = {((versions.get(h) or {}).get("build") or {}).get("commit") for h in HOSTS}
    expected = bridge.get("expectedWorkerBuildCommit")
    configured = (bridge.get("configured") is True and isinstance(expected, str) and bool(SHA.match(expected)))
    # Every problem is reported, so one run shows all that must change; the
    # first one in this order is the stage reason.
    problems = []
    if bridge.get("enforced") is not True:
        problems.append("BRIDGE_IDENTITY_NOT_ENFORCED")
    if not configured:
        problems.append("BRIDGE_EXPECTED_BUILD_UNCONFIGURED")
    elif served != {expected}:
        problems.append("BRIDGE_EXPECTED_BUILD_MISMATCH")
    observed = {"expected_worker_build_commit": expected if configured else None,
                "served_build_commits": sorted(map(str, served)),
                "enforced": bridge.get("enforced"), "configured": bridge.get("configured")}
    if problems:
        return stage(FAIL, reason=problems[0], problems=problems, observed=observed,
                     build_commit=expected if configured else None)
    return stage(PASS, build_commit=expected, observed=observed)


def evaluate_parser_lock(fingerprint: dict[str, Any] | None, versions: dict[str, Any]) -> dict[str, Any]:
    """The revision lock the app applies to every worker response must accept what both hosts serve.

    The app rejects a parsed demo with PARSER_IDENTITY_MISMATCH when its expected
    revision or build revision (code default or a Lovable environment override)
    differs from the worker's. Observed on 2026-10-14 (job 406df30a): RAW approved,
    then "parser build revision mismatch" while every other stage was PASS.
    """
    if not isinstance(fingerprint, dict):
        return stage(BLOCKED, reason="BRIDGE_IDENTITY_UNREACHABLE")
    lock = fingerprint.get("parserLock")
    if not isinstance(lock, dict):
        return stage(BLOCKED, reason="PARSER_LOCK_NOT_PUBLISHED")
    if any(not isinstance(versions.get(h), dict) for h in HOSTS):
        return stage(BLOCKED, reason="SERVED_BUILD_UNAVAILABLE")
    served = {h: (versions.get(h) or {}).get("parser") or {} for h in HOSTS}
    problems = []
    if any(p.get("name") != lock.get("name") or p.get("version") != lock.get("version") for p in served.values()) \
            or any((versions.get(h) or {}).get("contract_version") != lock.get("contractVersion") for h in HOSTS):
        problems.append("PARSER_LOCK_IDENTITY_MISMATCH")
    if lock.get("revisionRequired") is not True or lock.get("buildRevisionRequired") is not True:
        problems.append("PARSER_LOCK_NOT_REQUIRED")
    if any(p.get("revision") != lock.get("revision") for p in served.values()):
        problems.append("PARSER_LOCK_REVISION_MISMATCH")
    build = lock.get("buildRevision")
    if not isinstance(build, str) or not build:
        problems.append("PARSER_LOCK_BUILD_UNCONFIGURED")
    elif any(p.get("build_revision") != build for p in served.values()):
        problems.append("PARSER_LOCK_BUILD_MISMATCH")
    observed = {"expected": {k: lock.get(k) for k in ("name", "version", "revision", "buildRevision", "contractVersion",
                                                       "revisionSource", "buildRevisionSource")},
                "served": {h: {k: p.get(k) for k in ("name", "version", "revision", "build_revision")}
                           for h, p in served.items()}}
    if problems:
        return stage(FAIL, reason=problems[0], problems=problems, observed=observed)
    return stage(PASS, observed=observed)


def collect_parser_lock(io: Io) -> dict[str, Any]:
    response = io.http(RUNTIME_FINGERPRINT_ENDPOINT)
    fingerprint = response["body"] if response and response.get("status") == 200 else None
    versions = {}
    for host in HOSTS:
        version = io.http(f"{host}/version")
        versions[host] = version["body"] if version and version["status"] == 200 else None
    return evaluate_parser_lock(fingerprint, versions)


def collect_bridge(io: Io) -> dict[str, Any]:
    response = io.http(RUNTIME_FINGERPRINT_ENDPOINT)
    fingerprint = response["body"] if response and response.get("status") == 200 else None
    versions = {}
    for host in HOSTS:
        version = io.http(f"{host}/version")
        versions[host] = version["body"] if version and version["status"] == 200 else None
    return evaluate_bridge(fingerprint, versions)


def decide(stages: dict[str, dict[str, Any]]) -> str:
    statuses = [s.get("status") for s in stages.values()]
    if not statuses or any(s not in (PASS, FAIL, BLOCKED, SKIPPED) for s in statuses):
        return FAIL
    if FAIL in statuses:
        return FAIL
    if all(s == PASS for s in statuses):
        return PASS
    return BLOCKED  # any BLOCKED or SKIPPED stage


# --------------------------------------------------------------------------- collection (I/O)


def _bytes_io(blob: bytes):
    import io
    return io.BytesIO(blob)


class Io:
    """All network and git access, so tests can replace it."""

    def __init__(self, token: str, root: Path):
        self.token, self.root = token, root

    def github(self, path: str) -> Any:
        req = urllib.request.Request(f"https://api.github.com/repos/{REPOSITORY}{path}", headers={
            "Accept": "application/vnd.github+json", "Authorization": f"Bearer {self.token}",
            "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "gamepro-h3e-activation-gate/1"})
        with urllib.request.urlopen(req, timeout=30) as response:
            return json.load(response)

    def download(self, url: str) -> bytes:
        # curl drops the Authorization header on the cross-host redirect to blob storage.
        with tempfile.NamedTemporaryFile() as out:
            subprocess.run(["curl", "-fsSL", "--max-time", "60", "-H", f"Authorization: Bearer {self.token}",
                            "-o", out.name, url], check=True)
            return Path(out.name).read_bytes()

    def http(self, url: str, *, method: str = "GET", headers: dict[str, str] | None = None,
             data: bytes | None = None) -> dict[str, Any] | None:
        req = urllib.request.Request(url, data=data, method=method,
                                     headers={"User-Agent": "gamepro-h3e-activation-gate/1", **(headers or {})})
        try:
            with urllib.request.urlopen(req, timeout=20) as response:
                status, raw = response.status, response.read(65536)
        except urllib.error.HTTPError as error:
            status, raw = error.code, error.read(65536)
        except (urllib.error.URLError, TimeoutError, OSError):
            return None
        try:
            body = json.loads(raw)
        except ValueError:
            body = None
        return {"status": status, "body": body,
                "error": body.get("error") if isinstance(body, dict) else None}

    def snapshot_pins(self) -> dict[str, Any]:
        return snapshot_pins(self.root)

    def railway_active(self, token: str) -> dict[str, Any]:
        """Newest SUCCESS deployment of the service, or {"error": ...} explaining why not."""
        query = ("query($input:DeploymentListInput!){deployments(input:$input,first:20)"
                 "{edges{node{id status createdAt meta}}}}")
        payload = json.dumps({"query": query, "variables": {"input": dict(RAILWAY)}})
        result = self.http(RAILWAY_API, method="POST", data=payload.encode(), headers={
            "Authorization": f"Bearer {token}", "Content-Type": "application/json"})
        if not result:
            return {"error": "RAILWAY_API_UNREACHABLE"}
        body = result.get("body") if isinstance(result.get("body"), dict) else {}
        if result["status"] != 200 or body.get("errors"):
            messages = [str((e or {}).get("message", ""))[:160] for e in (body.get("errors") or [])][:3]
            return {"error": f"RAILWAY_API_HTTP_{result['status']}", "messages": messages}
        edges = (((body.get("data") or {}).get("deployments") or {}).get("edges") or [])
        nodes = [e.get("node") or {} for e in edges if isinstance(e, dict)]
        live = sorted((n for n in nodes if n.get("status") == "SUCCESS"),
                      key=lambda n: str(n.get("createdAt") or ""), reverse=True)
        if not live:
            return {"error": "RAILWAY_NO_SUCCESS_DEPLOYMENT", "observed": len(nodes)}
        node = live[0]
        meta = node.get("meta") if isinstance(node.get("meta"), dict) else {}
        return {"id": node.get("id"), "status": node.get("status"),
                "commitHash": meta.get("commitHash") or meta.get("commit"), "branch": meta.get("branch")}

    def git(self, *args: str) -> subprocess.CompletedProcess:
        return subprocess.run(["git", *args], cwd=self.root, capture_output=True, text=True)

    def tree(self, commit: str) -> str | None:
        out = self.git("rev-parse", f"{commit}:{WORKER_DIR}")
        return out.stdout.strip() if out.returncode == 0 else None

    def is_ancestor(self, older: str, newer: str) -> bool:
        return self.git("merge-base", "--is-ancestor", older, newer).returncode == 0


def snapshot_pins(root: Path) -> dict[str, Any]:
    """Candidate runtime pins plus the R5.8.11 recorder target; mismatch stays fail-closed."""
    import sys
    for sub in ("", "scripts/repin", "scripts/predem"):
        path = str(root / sub) if sub else str(root)
        if path not in sys.path:
            sys.path.insert(0, path)
    import r5_8_11  # noqa: PLC0415
    from scripts.parser_runtime_attestation import (  # noqa: PLC0415
        BRANCH, BUILD_COMMIT, COMMIT, DEPLOYMENT, ENVIRONMENT, EXPECTED_HASHES, PROJECT, SERVICE)
    spec = json.loads((root / "docs/reference/r5_8_11/spec.json").read_text(encoding="utf-8"))
    registry = json.loads((root / "scripts/approved_attestation_workflow.json").read_text(encoding="utf-8"))
    if (spec["deployment_id"], spec["build_commit"], spec["semantic_commit"], spec["branch"]) != (
            DEPLOYMENT, BUILD_COMMIT, COMMIT, BRANCH) or spec["workflow_source_sha"] != registry["source_sha"]:
        raise ValueError("SNAPSHOT_PINS_DISAGREE")
    # Candidate target differs from the still-live R5.8.10 function body until
    # migration R5.8.11 is explicitly applied. This mismatch intentionally
    # blocks activation; this candidate spec is NOT a runtime attestation.
    return {
        "recorder_md5": r5_8_11.target_md5(spec),
        "runtime": {
            "deployment_id": DEPLOYMENT, "project_id": PROJECT, "service_id": SERVICE,
            "environment_id": ENVIRONMENT, "branch": BRANCH, "semantic_commit": COMMIT,
            "build_commit": BUILD_COMMIT, "deployment_created_at": spec["observed"]["railway_deployment"]["created_at"],
            "workflow_source_sha": registry["source_sha"],
            "workflow_ref": f"{REPOSITORY}/.github/workflows/parser-runtime-attestation.yml@refs/heads/main",
            "critical_hashes": dict(EXPECTED_HASHES),
        },
    }


def evaluate_snapshot(response: dict[str, Any] | None, *, pins: dict[str, Any] | None, now: float,
                      evaluate: Callable[..., dict[str, Any]]) -> dict[str, Any]:
    if pins is None:
        return stage(FAIL, reason="SNAPSHOT_PINS_UNAVAILABLE")
    if response is None or response.get("status") is None:
        return stage(BLOCKED, reason="SNAPSHOT_ENDPOINT_UNREACHABLE")
    status = response["status"]
    if status == 404:
        return stage(BLOCKED, reason="SNAPSHOT_ENDPOINT_NOT_PUBLISHED")
    if status == 401:
        return stage(FAIL, reason="SNAPSHOT_UNAUTHORIZED")
    if status == 503:
        return stage(BLOCKED, reason="SNAPSHOT_UNAVAILABLE", error=response.get("error"))
    body = response.get("body")
    if status != 200 or not isinstance(body, dict) or not isinstance(body.get("snapshot"), dict):
        return stage(FAIL, reason="SNAPSHOT_RESPONSE_INVALID", observed=status)
    result = evaluate(body["snapshot"], now=now, expected_recorder_md5=pins["recorder_md5"],
                      active_runtime=pins["runtime"])
    gates = {g: {"status": v.get("status"), "reason": v.get("reason")} for g, v in result["gates"].items()}
    if result.get("snapshot_problem"):
        return stage(BLOCKED, reason="SNAPSHOT_UNUSABLE", observed=result["snapshot_problem"], gates=gates)
    if set(gates) != set(SNAPSHOT_GATES):
        return stage(FAIL, reason="SNAPSHOT_RESPONSE_INVALID", observed=sorted(gates))
    failed = sorted(g for g, v in gates.items() if v["status"] == "FAIL")
    unproven = sorted(g for g, v in gates.items() if v["status"] != "VERIFIED")
    details = {"gates": gates, "observed": {"snapshot_digest": result.get("snapshot_digest"),
                                            "snapshot_at": result.get("snapshot_at"),
                                            "recorder_md5": (result.get("database") or {}).get("recorder_md5")}}
    if failed:
        return stage(FAIL, reason="SNAPSHOT_GATES_FAILED", failures=failed, **details)
    if unproven:
        return stage(BLOCKED, reason="SNAPSHOT_GATES_NOT_VERIFIED", blockers=unproven, **details)
    return stage(PASS, verified=len(gates), **details)


def collect_managed_snapshot(io: Io, env: dict[str, str]) -> dict[str, Any]:
    transport = env.get("PARSER_ATTESTATION_TRANSPORT_SECRET", "")
    if not transport:
        return stage(BLOCKED, reason="SNAPSHOT_SECRET_MISSING")
    try:
        pins = io.snapshot_pins()
    except (OSError, KeyError, ValueError, ImportError):
        pins = None
    import sys
    sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "predem"))
    import managed_snapshot  # noqa: PLC0415
    response = io.http(SNAPSHOT_ENDPOINT, headers={"Authorization": f"Bearer {transport}"})
    return evaluate_snapshot(response, pins=pins, now=datetime.now(timezone.utc).timestamp(),
                             evaluate=managed_snapshot.evaluate)


def collect_runtime(io: Io, env: dict[str, str], sha: str) -> dict[str, Any]:
    versions: dict[str, Any] = {}
    healths: dict[str, Any] = {}
    for host in HOSTS:
        version, health = io.http(f"{host}/version"), io.http(f"{host}/health")
        versions[host] = version["body"] if version and version["status"] == 200 else None
        healths[host] = health["body"] if health and health["status"] == 200 else None
    token = env.get("RAILWAY_API_TOKEN", "")
    railway = io.railway_active(token) if token else None
    result = evaluate_runtime(versions=versions, healths=healths, target_sha=sha, tree=io.tree,
                              is_ancestor=io.is_ancestor, railway=railway)
    result["observed_build"] = {h: (versions[h] or {}).get("build") for h in HOSTS}
    result["identity"] = identity_record(versions, railway, io.tree, sha)
    return result


def identity_record(versions: dict[str, Any], railway: dict[str, Any] | None,
                    tree: Callable[[str], str | None], target_sha: str) -> dict[str, Any]:
    """Each identity item on its own, as observed; no item stands for another.

    The bridge's expected worker build is a Lovable variable this gate cannot
    read, so it is reported as not observable rather than assumed.
    """
    hosts = {}
    for host in HOSTS:
        body = versions.get(host) if isinstance(versions.get(host), dict) else {}
        parser, build = body.get("parser") or {}, body.get("build") or {}
        semantic = str(parser.get("semantic_revision") or "")
        build_commit = build.get("commit")
        hosts[host] = {
            "image_build_commit": build_commit,
            "declared_build_revision": parser.get("build_revision"),
            "declared_semantic_revision": parser.get("semantic_revision"),
            "declared_revision_matches": build.get("declared_revision_matches"),
            "build_worker_tree": tree(build_commit) if isinstance(build_commit, str) and SHA.match(build_commit) else None,
            "semantic_worker_tree": tree(semantic[4:]) if SHA.match(semantic[4:]) else None,
        }
    rail = railway if isinstance(railway, dict) else {}
    return {
        "hosts": hosts,
        "railway_active_deployment": {k: rail.get(k) for k in ("id", "status", "commitHash", "branch")},
        "target_worker_tree": tree(target_sha),
        "bridge_expected_worker_build_commit": "NOT_OBSERVABLE_FROM_CI",
    }


def run_gate(io: Io, env: dict[str, str], *, target_sha: str, main_head: str | None) -> dict[str, Any]:
    stages: dict[str, dict[str, Any]] = {}
    if not SHA.match(target_sha or ""):
        stages["target"] = stage(FAIL, reason="TARGET_SHA_INVALID")
    elif main_head != target_sha:
        stages["target"] = stage(BLOCKED, reason="TARGET_IS_NOT_CURRENT_MAIN_HEAD", main_head=main_head)
    else:
        stages["target"] = stage(PASS)
    def guarded(name: str, collect: Callable[[], dict[str, Any]]) -> dict[str, Any]:
        # An API error is missing evidence, never a pass and never a crash without a record.
        try:
            return collect()
        except Exception as exc:  # noqa: BLE001
            return {name: stage(BLOCKED, reason="COLLECTION_ERROR", error=type(exc).__name__)}

    if stages["target"]["status"] == PASS:
        stages.update(guarded("prerequisites", lambda: collect_prerequisites(io, target_sha)))
    stages.update(guarded("transport", lambda: {"transport": collect_transport(io, env)}))
    if stages["target"]["status"] == PASS:
        stages.update(guarded("runtime", lambda: {"runtime": collect_runtime(io, env, target_sha)}))
        stages.update(guarded("bridge_identity", lambda: {"bridge_identity": collect_bridge(io)}))
        stages.update(guarded("parser_lock", lambda: {"parser_lock": collect_parser_lock(io)}))
        stages.update(guarded("managed_snapshot", lambda: {
            "managed_snapshot": collect_managed_snapshot(io, env)}))
    else:
        stages["runtime"] = stage(SKIPPED, reason="TARGET_NOT_PASS")
    r584_document = stages.pop("_r584_document", None)
    stages["predem_matrix"] = evaluate_predem(r584_document, stages)
    decision = decide(stages)
    for value in stages.values():
        value["category"] = categorize(value)
    categories: dict[str, list[str]] = {}
    for name, value in stages.items():
        categories.setdefault(value["category"], []).append(name)
    return {
        "schema_version": 1,
        "operation": "H3E_ACTIVATION_GATE",
        "checked_at": datetime.now(timezone.utc).isoformat(),
        "target_sha": target_sha,
        "trigger": {"event": env.get("GITHUB_EVENT_NAME"), "run_id": env.get("GITHUB_RUN_ID"),
                    "run_attempt": env.get("GITHUB_RUN_ATTEMPT"), "ref": env.get("GITHUB_REF")},
        "stages": stages,
        "categories": categories,
        "decision": decision,
        # PASS here is the pre-DEM approval: it allows an operator to dispatch
        # the A9.1 laboratory run for this exact commit, citing this run. It is
        # never production, Attempt 9 or Canonical authority.
        "predem_decision": PREDEM_READY if decision == PASS else "BLOCKED",
        "side_effects": dict(SIDE_EFFECTS),
        "authorizes": {"attempt_9": False, "canonical": False, "real_dem_production": False,
                       "real_dem_laboratory_dispatch": decision == PASS},
    }


def render(evidence: dict[str, Any]) -> str:
    lines = [f"## H.3-E activation gate: {evidence['decision']}", "",
             f"Target `{evidence['target_sha']}`. SKIPPED is never evidence.", "",
             "| Stage | Status | Reason |", "| --- | --- | --- |"]
    for name, value in evidence["stages"].items():
        lines.append(f"| `{name}` | {value['status']} | {value.get('reason', '')} |")
    lines += ["", "Side effects: " + ", ".join(f"{k}={v}" for k, v in evidence["side_effects"].items())]
    return "\n".join(lines) + "\n"


SAFE_DETAIL_KEYS = ("category", "reason", "observed", "decision", "failures", "blockers", "missing", "verified",
                    "probe", "probes", "problems",
                    "build_commit", "railway_commit", "main_head", "expected_name", "error")


def _escape(text: str) -> str:
    return text.replace("%", "%25").replace("\r", "%0D").replace("\n", "%0A")


def annotations(evidence: dict[str, Any]) -> list[str]:
    """Workflow commands that surface the decision as check annotations.

    The evidence artifact holds everything; annotations repeat the decision and
    the reason of each stage that did not pass, from an allow-list of fields
    that can never contain a secret value.
    """
    stages = evidence["stages"]
    overview = ", ".join(f"{name}={value['status']}" for name, value in stages.items())
    lines = ["::notice title=H.3-E activation gate::"
             + _escape(f"decision={evidence['decision']} target={evidence['target_sha']} {overview}")]
    for name, value in stages.items():
        if value["status"] == PASS:
            continue
        details = {k: value[k] for k in SAFE_DETAIL_KEYS if k in value}
        level = "error" if value["status"] == FAIL else "warning"
        lines.append(f"::{level} title=H.3-E stage {name}::"
                     + _escape(f"{value['status']} " + json.dumps(details, sort_keys=True)))
    return lines[:20]


def main() -> int:
    env = dict(os.environ)
    root = Path(__file__).resolve().parents[2]
    io = Io(env.get("GITHUB_TOKEN", ""), root)
    target = env.get("H3E_TARGET_SHA", "")
    try:
        main_head = io.github("/branches/main")["commit"]["sha"]
    except Exception:
        main_head = None
    if env.get("GITHUB_REPOSITORY") != REPOSITORY:
        evidence = run_gate(io, env, target_sha="", main_head=main_head)
    else:
        evidence = run_gate(io, env, target_sha=target, main_head=main_head)
    out = Path(env.get("H3E_EVIDENCE_OUT", "h3e-activation-gate.json"))
    out.write_text(json.dumps(evidence, sort_keys=True, indent=2) + "\n", encoding="utf-8")
    text = render(evidence)
    print(text)
    for line in annotations(evidence):
        print(line)
    summary = env.get("GITHUB_STEP_SUMMARY")
    if summary:
        with open(summary, "a", encoding="utf-8") as handle:
            handle.write(text)
    return 0 if evidence["decision"] == PASS else 1


if __name__ == "__main__":
    raise SystemExit(main())
