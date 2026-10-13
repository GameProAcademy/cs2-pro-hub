#!/usr/bin/env python3
"""Evaluate a managed-database pre-DEM snapshot (public.h3e_predem_managed_snapshot()).

Pure: no network, database or execution surface. Each gate gets VERIFIED, FAIL
or NOT_PROVEN with an objective reason. A snapshot that is malformed, older
than MAX_AGE_SECONDS, from the future, without its digest, or from a database
whose recorder is not the expected one proves nothing (every gate NOT_PROVEN).
`canonical_uncontaminated` uses STRICT_PROVENANCE: any pre-attestation canonical row fails closed;
missing evidence remains NOT_PROVEN (docs/H3E_CANONICAL_CONTAMINATION_RULE.md).
"""
from __future__ import annotations

import re
from datetime import datetime
from typing import Any, Mapping

GATES = ("db_git_digest_parity", "identity_validation", "retention_guard", "attempt_9_absent",
         "metrics_uncontaminated", "features_uncontaminated", "canonical_uncontaminated",
         "provenance_verified", "hmac_configured", "oidc_operational")
SCHEMA_VERSION = 2
VERIFICATION_METHOD = "GITHUB_ACTIONS_SIGNED_ATTESTATION_V3"
INVENTORY_DIGEST = "cf0549c2dfbdc4df25b42ce8204edf8705071c586e99696e9ef596c1e742d7b1"
MATRIX_DIGEST = "a276b0306c05ca6a2555db8b3c055bff2df6262b3e2bafccf6d1b5cca8425702"
MAX_AGE_SECONDS = 6 * 3600
CANONICAL_RULE = "STRICT_PROVENANCE"  # approved rule; admission remains a separate gate
HEX64 = re.compile(r"^[0-9a-f]{64}$")


def _status(status: str, reason: str, **evidence: Any) -> dict[str, Any]:
    return {"status": status, "reason": reason, **({"evidence": evidence} if evidence else {})}


def _section(snapshot: Mapping[str, Any], key: str) -> Mapping[str, Any]:
    value = snapshot.get(key)
    return value if isinstance(value, Mapping) else {}


def _count(value: Any) -> int | None:
    return value if isinstance(value, int) and not isinstance(value, bool) and value >= 0 else None


def _canonical(canonical: Mapping[str, Any], measures: dict[str, Any]) -> dict[str, Any]:
    """STRICT_PROVENANCE: VERIFIED only when the snapshot proves there is no canonical row at all.

    No `matches` row links to a VERIFIED parser_runtime_provenance row, so a row created after
    the first VERIFIED provenance is still not provably derived from verified output (the active
    runtime may have none). Rows before it are FAIL; rows after it are FAIL too, for lack of a
    link. Missing, malformed or self-contradictory counts are NOT_PROVEN, never VERIFIED.
    """
    if CANONICAL_RULE != "STRICT_PROVENANCE":
        return _status("NOT_PROVEN", "CANONICAL_RULE_UNKNOWN", **measures)
    violations = _count(canonical.get("matches_created_before_first_verified_provenance"))
    rows = _count(canonical.get("matches_with_status"))
    by_status = canonical.get("matches_by_status")
    first = canonical.get("first_verified_provenance_at")
    if violations is None or rows is None or not isinstance(by_status, Mapping) \
            or any(_count(n) is None for n in by_status.values()) \
            or (first is not None and not isinstance(first, str)):
        return _status("NOT_PROVEN", "CANONICAL_PROVENANCE_EVIDENCE_MISSING", **measures)
    with_status = sum(n for k, n in by_status.items() if k != "null")
    if violations > rows or with_status != rows or (first is None and violations != rows):
        return _status("NOT_PROVEN", "CANONICAL_EVIDENCE_CONTRADICTORY", **measures)
    if violations > 0:
        return _status("FAIL", "UNVERIFIED_CANONICAL_ROWS_PRECEDE_PROVENANCE", **measures)
    if rows > 0:
        return _status("FAIL", "CANONICAL_ROWS_WITHOUT_PROVENANCE_LINK", **measures)
    return _status("VERIFIED", "NO_CANONICAL_ROWS", **measures)


def _provenance(section: Any, runtime: Mapping[str, Any] | None) -> dict[str, dict[str, Any]]:
    """Fresh attestation gates: a VERIFIED row the recorder accepted for exactly the active runtime.

    The recorder only writes VERIFIED after checking the HMAC, the GitHub OIDC
    token (verified by the application before the call), freshness, the
    Railway binding and the critical hashes. A row of another deployment,
    revision, blob or workflow never counts; neither does a row older than the
    deployment. No matching row is NOT_PROVEN, never FAIL: it means "not yet".
    """
    names = ("provenance_verified", "hmac_configured", "oidc_operational")
    if not isinstance(runtime, Mapping):
        return {g: _status("NOT_PROVEN", "ACTIVE_RUNTIME_PINS_NOT_SUPPLIED") for g in names}
    latest = section.get("latest") if isinstance(section, Mapping) else None
    if not isinstance(latest, list) or _count(section.get("verified_rows")) is None:
        return {g: _status("NOT_PROVEN", "PROVENANCE_EVIDENCE_MISSING") for g in names}
    want = {
        "deployment_id": runtime["deployment_id"], "railway_project_id": runtime["project_id"],
        "railway_service_id": runtime["service_id"], "railway_environment_id": runtime["environment_id"],
        "railway_branch": runtime["branch"], "git_commit": runtime["semantic_commit"],
        "deployment_source_commit": runtime["build_commit"], "deployment_status": "SUCCESS",
        "semantic_revision": f"git:{runtime['semantic_commit']}", "build_revision": f"git:{runtime['build_commit']}",
        "verification_method": VERIFICATION_METHOD, "attestation_version": 3,
        "workflow_source_sha": runtime["workflow_source_sha"],
    }
    not_before = runtime["deployment_created_at"]
    matches = []
    for item in latest:
        if not isinstance(item, Mapping) or any(item.get(k) != v for k, v in want.items()):
            continue
        hashes = item.get("critical_hashes") if isinstance(item.get("critical_hashes"), Mapping) else {}
        if any(not isinstance(hashes.get(path), Mapping) or hashes[path].get("observed") != blob
               or hashes[path].get("match") is not True for path, blob in runtime["critical_hashes"].items()):
            continue
        if not isinstance(item.get("created_at"), str) or item["created_at"] < not_before:
            continue
        matches.append(item)
    if not matches:
        reason = "NO_VERIFIED_ATTESTATION_OF_ACTIVE_RUNTIME"
        return {g: _status("NOT_PROVEN", reason, verified_rows=section.get("verified_rows")) for g in names}
    row = matches[0]
    evidence = {"created_at": row.get("created_at"), "workflow_run_id": row.get("workflow_run_id")}
    hmac = row.get("signature_is_hmac_sha256_hex") is True
    oidc = (row.get("attestor_provider") == "github_actions_oidc" and row.get("workflow_event") == "workflow_dispatch"
            and row.get("workflow_ref") == runtime["workflow_ref"])
    return {
        "provenance_verified": _status("VERIFIED", "VERIFIED_ATTESTATION_OF_ACTIVE_RUNTIME", **evidence),
        "hmac_configured": (_status("VERIFIED", "RECORDER_ACCEPTED_HMAC_SIGNED_ATTESTATION", **evidence) if hmac
                            else _status("NOT_PROVEN", "SIGNATURE_NOT_HMAC_SHA256", **evidence)),
        "oidc_operational": (_status("VERIFIED", "ATTESTATION_FROM_APPROVED_OIDC_WORKFLOW", **evidence) if oidc
                             else _status("NOT_PROVEN", "OIDC_WORKFLOW_IDENTITY_MISMATCH", **evidence)),
    }


def evaluate(snapshot: Any, *, now: float, expected_recorder_md5: str,
             active_runtime: Mapping[str, Any] | None = None) -> dict[str, Any]:
    gates: dict[str, dict[str, Any]] = {}
    s = snapshot if isinstance(snapshot, Mapping) else {}
    try:
        taken = datetime.fromisoformat(str(s.get("snapshot_at", "")).replace("Z", "+00:00")).timestamp()
    except ValueError:
        taken = None
    database = s.get("database") if isinstance(s.get("database"), Mapping) else {}
    problem = None
    if s.get("schema_version") != SCHEMA_VERSION:
        problem = "SNAPSHOT_SCHEMA_UNKNOWN"
    elif not isinstance(s.get("digest"), str) or not HEX64.match(s["digest"]):
        problem = "SNAPSHOT_DIGEST_MISSING"
    elif taken is None or taken > now + 60:
        problem = "SNAPSHOT_TIME_INVALID"
    elif now - taken > MAX_AGE_SECONDS:
        problem = "SNAPSHOT_STALE"
    elif database.get("recorder_md5") != expected_recorder_md5:
        problem = "SNAPSHOT_FROM_UNEXPECTED_DATABASE_STATE"
    if problem:
        return {"gates": {g: _status("NOT_PROVEN", problem) for g in GATES}, "snapshot_problem": problem,
                "verified": 0}

    release = _section(s, "mapping_release")
    parity = (release.get("authoritative_releases") == 1 and release.get("inventory_digests") == [INVENTORY_DIGEST]
              and release.get("matrix_digests") == [MATRIX_DIGEST] and release.get("row_counts") == [105]
              and release.get("generic_counts") == [0] and release.get("authorized_counts") == [0]
              and release.get("inventory_rows") == 105)
    gates["db_git_digest_parity"] = (_status("VERIFIED", "RELEASE_DIGESTS_EQUAL_GIT_PINS") if parity
                                     else _status("FAIL", "RELEASE_DIFFERS_FROM_GIT_PINS", release=release))

    attempts = _section(s, "attempts")
    nine, top = _count(attempts.get("jobs_attempt_9_or_more")), _count(attempts.get("max_attempt_number"))
    if nine is None or top is None or (nine == 0) != (top < 9):
        gates["attempt_9_absent"] = _status("NOT_PROVEN", "ATTEMPT_EVIDENCE_MISSING_OR_CONTRADICTORY",
                                            count=attempts.get("jobs_attempt_9_or_more"),
                                            max_attempt_number=attempts.get("max_attempt_number"))
    else:
        gates["attempt_9_absent"] = (_status("VERIFIED", "NO_JOB_AT_ATTEMPT_9_OR_MORE", max_attempt_number=top)
                                     if nine == 0 else _status("FAIL", "JOBS_AT_ATTEMPT_9_OR_MORE", count=nine))

    derived = _section(s, "derived_rows")
    for gate, key in (("metrics_uncontaminated", "match_metrics"), ("features_uncontaminated", "match_features")):
        n = _count(derived.get(key))
        # No row links back to a VERIFIED provenance, so any row is unprovable.
        gates[gate] = (_status("NOT_PROVEN", "ROW_COUNT_MISSING", rows=derived.get(key)) if n is None
                       else _status("VERIFIED", "NO_ROWS") if n == 0
                       else _status("FAIL", "ROWS_WITHOUT_PROVENANCE_LINK", rows=n))

    identity = _section(s, "execution_identity")
    conflicts, ledger = _count(identity.get("conflicting_executions")), _count(identity.get("ledger_rows"))
    gates["identity_validation"] = (
        _status("NOT_PROVEN", "IDENTITY_EVIDENCE_MISSING_OR_CONTRADICTORY",
                count=identity.get("conflicting_executions"), ledger_rows=identity.get("ledger_rows"))
        if conflicts is None or ledger is None or conflicts > ledger
        else _status("VERIFIED", "NO_CONFLICTING_EXECUTION_IDENTITY", ledger_rows=ledger) if conflicts == 0
        else _status("FAIL", "CONFLICTING_EXECUTION_IDENTITIES", count=conflicts))

    retention = _section(s, "retention")
    failed, mismatch = _count(retention.get("deletion_failed")), _count(retention.get("deletion_metadata_mismatch"))
    gates["retention_guard"] = (
        _status("NOT_PROVEN", "RETENTION_EVIDENCE_MISSING", deletion_failed=retention.get("deletion_failed"),
                deletion_metadata_mismatch=retention.get("deletion_metadata_mismatch"))
        if failed is None or mismatch is None
        else _status("VERIFIED", "NO_DELETION_FAILURE_OR_MISMATCH", expired_demos=retention.get("expired_demos"))
        if failed == 0 and mismatch == 0
        else _status("FAIL", "RETENTION_FAILURES", deletion_failed=failed, deletion_metadata_mismatch=mismatch,
                     expired_demos=retention.get("expired_demos"), deletion_attempts=retention.get("deletion_attempts")))

    canonical = _section(s, "canonical")
    measures = {"strict_provenance_violations": canonical.get("matches_created_before_first_verified_provenance"),
                "admission_authorized_rows": release.get("authorized_counts"),
                "matches_by_status": canonical.get("matches_by_status")}
    measures["canonical_rows"] = canonical.get("matches_with_status")
    gates["canonical_uncontaminated"] = _canonical(canonical, measures)

    gates.update(_provenance(s.get("provenance"), active_runtime))

    return {"gates": gates, "snapshot_problem": None, "snapshot_digest": s.get("digest"),
            "snapshot_at": s.get("snapshot_at"), "database": dict(database),
            "verified": sum(1 for g in gates.values() if g["status"] == "VERIFIED")}
