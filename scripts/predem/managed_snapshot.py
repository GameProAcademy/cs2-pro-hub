#!/usr/bin/env python3
"""Evaluate a managed-database pre-DEM snapshot (public.h3e_predem_managed_snapshot()).

Pure: no network, database or execution surface. Each gate gets VERIFIED, FAIL
or NOT_PROVEN with an objective reason. A snapshot that is malformed, older
than MAX_AGE_SECONDS, from the future, without its digest, or from a database
whose recorder is not the expected one proves nothing (every gate NOT_PROVEN).
`canonical_uncontaminated` uses STRICT_PROVENANCE: any pre-attestation canonical row fails closed;
missing evidence remains NOT_PROVEN (docs/H3E_CANONICAL_CONTAMINATION_RULE.md).

Gate semantics are versioned (GATE_SEMANTICS, docs/H3E_GATE_SEMANTICS_V2.md). Snapshot schema 4
carries the v2 evidence: `attempt_9_absent` asks whether every job at attempt >= 9 is covered by
an owner authorization bound to its identity; `metrics_uncontaminated`, `features_uncontaminated`
and `canonical_uncontaminated` ask whether every row has verified lineage. The v1 measure is
still reported in each gate's evidence (`v1`), so no historical verdict is hidden or rewritten.
"""
from __future__ import annotations

import re
from datetime import datetime
from typing import Any, Mapping

GATES = ("db_git_digest_parity", "identity_validation", "retention_guard", "attempt_9_absent",
         "metrics_uncontaminated", "features_uncontaminated", "canonical_uncontaminated",
         "provenance_verified", "hmac_configured", "oidc_operational")
SCHEMA_VERSION = 4
GATE_SEMANTICS = {
    "attempt_9_absent": "AUTHORIZED_ATTEMPTS_V2",
    "metrics_uncontaminated": "VERIFIED_LINEAGE_V2",
    "features_uncontaminated": "VERIFIED_LINEAGE_V2",
    "canonical_uncontaminated": "STRICT_PROVENANCE_VERIFIED_LINEAGE_V2",
}
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


GUARDED_TABLES = ("matches", "match_sources", "match_participants", "match_rounds", "round_players",
                  "round_events", "match_metrics", "match_features")
# Every trigger the quarantine depends on (supabase/migrations/20261014120000_h3e_canonical_match_quarantine.sql).
QUARANTINE_GUARDS = frozenset(
    ["canonical_match_quarantine:canonical_match_quarantine_immutable",
     "canonical_match_quarantine:canonical_match_quarantine_no_truncate"]
    + [f"{t}:canonical_quarantine_guard" for t in GUARDED_TABLES]
    + [f"{t}:canonical_quarantine_no_truncate" for t in GUARDED_TABLES])


def _quarantine_problem(quarantine: Any, rows: int, violations: int) -> tuple[str, str] | None:
    """Why the quarantine evidence cannot excuse any row, or None when it is complete and consistent."""
    if not isinstance(quarantine, Mapping):
        return "NOT_PROVEN", "CANONICAL_QUARANTINE_EVIDENCE_MISSING"
    keys = ("quarantined_matches", "quarantined_with_status", "unquarantined_with_status",
            "unquarantined_created_before_first_verified_provenance", "quarantined_completed",
            "quarantined_derived_rows")
    n = {k: _count(quarantine.get(k)) for k in keys}
    guards = quarantine.get("guards")
    if any(v is None for v in n.values()) or not isinstance(guards, Mapping):
        return "NOT_PROVEN", "CANONICAL_QUARANTINE_EVIDENCE_MISSING"
    if (n["quarantined_with_status"] + n["unquarantined_with_status"] != rows
            or n["unquarantined_created_before_first_verified_provenance"] > violations
            or n["unquarantined_created_before_first_verified_provenance"] > n["unquarantined_with_status"]
            or n["quarantined_with_status"] > n["quarantined_matches"]
            or n["quarantined_completed"] > n["quarantined_with_status"]):
        return "NOT_PROVEN", "CANONICAL_EVIDENCE_CONTRADICTORY"
    if set(guards) != QUARANTINE_GUARDS or any(v is not True for v in guards.values()):
        return "FAIL", "CANONICAL_QUARANTINE_NOT_ENFORCED"
    if n["quarantined_completed"]:
        return "FAIL", "QUARANTINED_ROW_PROMOTED"
    if n["quarantined_derived_rows"]:
        return "FAIL", "QUARANTINED_ROW_HAS_DERIVED_ROWS"
    return None


def _attempts(attempts: Mapping[str, Any]) -> dict[str, Any]:
    """AUTHORIZED_ATTEMPTS_V2. v1 ("no job at attempt >= 9") is reported, never decisive."""
    keys = ("jobs_attempt_9_or_more", "max_attempt_number", "jobs_attempt_9_or_more_authorized",
            "forensic_replays_attempt_9_or_more", "authorization_rows", "authorization_rows_not_matching_job")
    n = {k: _count(attempts.get(k)) for k in keys}
    raw = {k: attempts.get(k) for k in keys}
    if any(v is None for v in n.values()):
        return _status("NOT_PROVEN", "ATTEMPT_EVIDENCE_MISSING_OR_CONTRADICTORY", **raw)
    nine, top, authorized = n["jobs_attempt_9_or_more"], n["max_attempt_number"], n["jobs_attempt_9_or_more_authorized"]
    rows, stale = n["authorization_rows"], n["authorization_rows_not_matching_job"]
    if ((nine == 0) != (top < 9) or authorized > nine or n["forensic_replays_attempt_9_or_more"] > nine
            or stale > rows or authorized + stale > rows):
        return _status("NOT_PROVEN", "ATTEMPT_EVIDENCE_MISSING_OR_CONTRADICTORY", **raw)
    evidence = {**raw, "semantics": GATE_SEMANTICS["attempt_9_absent"],
                "v1": {"status": "VERIFIED" if nine == 0 else "FAIL",
                       "reason": "NO_JOB_AT_ATTEMPT_9_OR_MORE" if nine == 0 else "JOBS_AT_ATTEMPT_9_OR_MORE"}}
    if stale:
        return _status("FAIL", "AUTHORIZATION_NO_LONGER_MATCHES_ITS_JOB", **evidence)
    if nine > authorized:
        return _status("FAIL", "UNAUTHORIZED_JOBS_AT_ATTEMPT_9_OR_MORE", unauthorized=nine - authorized, **evidence)
    if nine == 0:
        return _status("VERIFIED", "NO_JOB_AT_ATTEMPT_9_OR_MORE", **evidence)
    return _status("VERIFIED", "EVERY_JOB_AT_ATTEMPT_9_OR_MORE_AUTHORIZED", **evidence)


def _derived(derived: Mapping[str, Any], key: str) -> dict[str, Any]:
    """VERIFIED_LINEAGE_V2: every derived row belongs to a match with verified lineage."""
    rows, clean = _count(derived.get(key)), _count(derived.get(f"{key}_with_verified_lineage"))
    raw = {"rows": derived.get(key), "rows_with_verified_lineage": derived.get(f"{key}_with_verified_lineage")}
    if rows is None or clean is None or clean > rows:
        return _status("NOT_PROVEN", "ROW_COUNT_MISSING", **raw)
    evidence = {**raw, "semantics": GATE_SEMANTICS["metrics_uncontaminated"],
                "v1": {"status": "VERIFIED" if rows == 0 else "FAIL",
                       "reason": "NO_ROWS" if rows == 0 else "ROWS_WITHOUT_PROVENANCE_LINK"}}
    if rows == 0:
        return _status("VERIFIED", "NO_ROWS", **evidence)
    if clean < rows:
        return _status("FAIL", "ROWS_WITHOUT_VERIFIED_LINEAGE", rows_without_lineage=rows - clean, **evidence)
    return _status("VERIFIED", "EVERY_ROW_HAS_VERIFIED_LINEAGE", **evidence)


def _canonical(canonical: Mapping[str, Any], measures: dict[str, Any]) -> dict[str, Any]:
    """STRICT_PROVENANCE: VERIFIED only when no canonical row is eligible.

    No `matches` row links to a VERIFIED parser_runtime_provenance row, so a row created after
    the first VERIFIED provenance is still not provably derived from verified output (the active
    runtime may have none). An eligible row before it is FAIL; after it, FAIL for lack of a link.

    A row is ineligible only when it is registered in public.canonical_match_quarantine AND the
    snapshot proves every quarantine guard is installed and enabled, the row was not promoted to
    `completed`, and no metric or feature row derives from it. The row itself stays preserved.
    Missing, malformed or self-contradictory counts are NOT_PROVEN, never VERIFIED.
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
    quarantine = canonical.get("quarantine")
    problem = _quarantine_problem(quarantine, rows, violations)
    if problem and problem[0] == "NOT_PROVEN":
        return _status(*problem, **measures)
    q = quarantine if isinstance(quarantine, Mapping) else {}
    eligible_before = _count(q.get("unquarantined_created_before_first_verified_provenance"))
    eligible = _count(q.get("unquarantined_with_status"))
    quarantined = _count(q.get("quarantined_with_status"))
    lineage = _count(canonical.get("unquarantined_with_status_and_verified_lineage"))
    measures = {**measures, "quarantined_rows": quarantined, "eligible_rows": eligible,
                "eligible_rows_with_verified_lineage": lineage,
                "semantics": GATE_SEMANTICS["canonical_uncontaminated"],
                # v1 (schema 3) counted every eligible row as contaminated, lineage or not.
                "v1": {"eligible_rows_counted_as_contaminated": eligible}}
    if lineage is None or eligible is None or lineage > eligible or (eligible_before and lineage > eligible - eligible_before):
        return _status("NOT_PROVEN", "CANONICAL_LINEAGE_EVIDENCE_MISSING", **measures)
    if eligible_before:
        return _status("FAIL", "UNVERIFIED_CANONICAL_ROWS_PRECEDE_PROVENANCE", **measures)
    if eligible > lineage:
        return _status("FAIL", "CANONICAL_ROWS_WITHOUT_VERIFIED_LINEAGE", rows_without_lineage=eligible - lineage,
                       **measures)
    if problem:
        # A broken guard voids the exclusion even when no row is quarantined today.
        return _status(*problem, **measures)
    if eligible:
        return _status("VERIFIED", "ELIGIBLE_ROWS_HAVE_VERIFIED_LINEAGE", **measures)
    if quarantined:
        return _status("VERIFIED", "ONLY_QUARANTINED_CANONICAL_ROWS", **measures)
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

    gates["attempt_9_absent"] = _attempts(_section(s, "attempts"))

    derived = _section(s, "derived_rows")
    for gate, key in (("metrics_uncontaminated", "match_metrics"), ("features_uncontaminated", "match_features")):
        gates[gate] = _derived(derived, key)

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

    return {"gates": gates, "gate_semantics": dict(GATE_SEMANTICS), "snapshot_problem": None,
            "snapshot_digest": s.get("digest"),
            "snapshot_at": s.get("snapshot_at"), "database": dict(database),
            "verified": sum(1 for g in gates.values() if g["status"] == "VERIFIED")}
