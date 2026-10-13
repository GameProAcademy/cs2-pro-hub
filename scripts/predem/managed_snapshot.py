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
         "metrics_uncontaminated", "features_uncontaminated", "canonical_uncontaminated")
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


def evaluate(snapshot: Any, *, now: float, expected_recorder_md5: str) -> dict[str, Any]:
    gates: dict[str, dict[str, Any]] = {}
    s = snapshot if isinstance(snapshot, Mapping) else {}
    try:
        taken = datetime.fromisoformat(str(s.get("snapshot_at", "")).replace("Z", "+00:00")).timestamp()
    except ValueError:
        taken = None
    database = s.get("database") if isinstance(s.get("database"), Mapping) else {}
    problem = None
    if s.get("schema_version") != 1:
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

    return {"gates": gates, "snapshot_problem": None, "snapshot_digest": s.get("digest"),
            "snapshot_at": s.get("snapshot_at"), "database": dict(database),
            "verified": sum(1 for g in gates.values() if g["status"] == "VERIFIED")}
