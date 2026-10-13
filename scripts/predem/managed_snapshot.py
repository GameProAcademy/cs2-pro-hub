#!/usr/bin/env python3
"""Evaluate a managed-database pre-DEM snapshot (public.h3e_predem_managed_snapshot()).

Pure: no network, database or execution surface. Each gate gets VERIFIED, FAIL
or NOT_PROVEN with an objective reason. A snapshot that is malformed, older
than MAX_AGE_SECONDS, from the future, without its digest, or from a database
whose recorder is not the expected one proves nothing (every gate NOT_PROVEN).
`canonical_uncontaminated` stays NOT_PROVEN until its rule is decided
(docs/H3E_CANONICAL_CONTAMINATION_RULE.md); both candidate measures are reported.
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
CANONICAL_RULE: str | None = None  # undecided: "STRICT_PROVENANCE" or "ADMISSION_ONLY" once approved
HEX64 = re.compile(r"^[0-9a-f]{64}$")


def _status(status: str, reason: str, **evidence: Any) -> dict[str, Any]:
    return {"status": status, "reason": reason, **({"evidence": evidence} if evidence else {})}


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

    release = s.get("mapping_release") or {}
    parity = (release.get("authoritative_releases") == 1 and release.get("inventory_digests") == [INVENTORY_DIGEST]
              and release.get("matrix_digests") == [MATRIX_DIGEST] and release.get("row_counts") == [105]
              and release.get("generic_counts") == [0] and release.get("authorized_counts") == [0]
              and release.get("inventory_rows") == 105)
    gates["db_git_digest_parity"] = (_status("VERIFIED", "RELEASE_DIGESTS_EQUAL_GIT_PINS") if parity
                                     else _status("FAIL", "RELEASE_DIFFERS_FROM_GIT_PINS", release=release))

    attempts = s.get("attempts") or {}
    nine = attempts.get("jobs_attempt_9_or_more")
    gates["attempt_9_absent"] = (_status("VERIFIED", "NO_JOB_AT_ATTEMPT_9_OR_MORE") if nine == 0
                                 else _status("FAIL" if isinstance(nine, int) else "NOT_PROVEN",
                                              "JOBS_AT_ATTEMPT_9_OR_MORE", count=nine))

    derived = s.get("derived_rows") or {}
    for gate, key in (("metrics_uncontaminated", "match_metrics"), ("features_uncontaminated", "match_features")):
        n = derived.get(key)
        # No row links back to a VERIFIED provenance, so any row is unprovable.
        gates[gate] = (_status("VERIFIED", "NO_ROWS") if n == 0
                       else _status("FAIL" if isinstance(n, int) else "NOT_PROVEN",
                                    "ROWS_WITHOUT_PROVENANCE_LINK", rows=n))

    identity = s.get("execution_identity") or {}
    conflicts = identity.get("conflicting_executions")
    gates["identity_validation"] = (_status("VERIFIED", "NO_CONFLICTING_EXECUTION_IDENTITY",
                                            ledger_rows=identity.get("ledger_rows")) if conflicts == 0
                                    else _status("FAIL" if isinstance(conflicts, int) else "NOT_PROVEN",
                                                 "CONFLICTING_EXECUTION_IDENTITIES", count=conflicts))

    retention = s.get("retention") or {}
    failed, mismatch = retention.get("deletion_failed"), retention.get("deletion_metadata_mismatch")
    gates["retention_guard"] = (_status("VERIFIED", "NO_DELETION_FAILURE_OR_MISMATCH",
                                        expired_demos=retention.get("expired_demos")) if failed == 0 and mismatch == 0
                                else _status("FAIL" if isinstance(failed, int) and isinstance(mismatch, int)
                                             else "NOT_PROVEN", "RETENTION_FAILURES",
                                             deletion_failed=failed, deletion_metadata_mismatch=mismatch))

    canonical = s.get("canonical") or {}
    measures = {"strict_provenance_violations": canonical.get("matches_created_before_first_verified_provenance"),
                "admission_authorized_rows": (release.get("authorized_counts") or [None])[0],
                "matches_by_status": canonical.get("matches_by_status")}
    gates["canonical_uncontaminated"] = _status("NOT_PROVEN", "CANONICAL_RULE_NOT_DECIDED", **measures) \
        if CANONICAL_RULE is None else _status("NOT_PROVEN", "CANONICAL_RULE_UNKNOWN")

    return {"gates": gates, "snapshot_problem": None, "snapshot_digest": s.get("digest"),
            "snapshot_at": s.get("snapshot_at"), "database": dict(database),
            "verified": sum(1 for g in gates.values() if g["status"] == "VERIFIED")}
