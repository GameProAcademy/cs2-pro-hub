"""Managed-database pre-DEM snapshot: objective rules, freshness and integrity.

MANAGED_2026_10_13 is the aggregate-only output of the snapshot SELECT run
read-only on the managed database at 2026-10-13T03:25:01Z (an operator
observation, not CI evidence). It contains counts and digests only.
"""
import copy
import re
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts/predem"))
import managed_snapshot as ms  # noqa: E402

RECORDER = "fe3250af2b461f03f459adf36b43ec21"
MANAGED_2026_10_13 = {
    "attempts": {"jobs_attempt_9_or_more": 0, "max_attempt_number": 8},
    "canonical": {"first_verified_provenance_at": "2026-10-05T03:58:32.676222+00:00", "matches_by_status": {"partial": 1},
                  "matches_created_before_first_verified_provenance": 1, "matches_with_status": 1},
    "database": {"migration_head": "20261012100000", "name": "postgres", "recorder_md5": RECORDER, "server_version": "17.6"},
    "derived_rows": {"match_features": 0, "match_metrics": 0},
    "digest": "f8293b7c4c6ee3ae8bfd40928d1b0bbd027748936439d68421318bbcfb73418a",
    "execution_identity": {"conflicting_executions": 0, "ledger_rows": 0},
    "mapping_release": {"authoritative_releases": 1, "authorized_counts": [0], "generic_counts": [0],
                        "inventory_digests": [ms.INVENTORY_DIGEST], "inventory_rows": 105,
                        "matrix_digests": [ms.MATRIX_DIGEST], "row_counts": [105]},
    "retention": {"active_demos": 0, "deletion_attempts": 0, "deletion_eligible": 12, "deletion_failed": 0,
                  "deletion_metadata_mismatch": 1, "deletion_verified": 0, "expired_demos": 12, "terminal_demos": 12,
                  "total_demo_jobs": 12},
    "schema_version": 1, "snapshot_at": "2026-10-13T03:25:01.079304Z",
}
NOW = datetime.fromisoformat("2026-10-13T03:30:00+00:00").timestamp()


def run(snapshot, now=NOW, recorder=RECORDER):
    return ms.evaluate(snapshot, now=now, expected_recorder_md5=recorder)


def test_the_managed_observation_of_2026_10_13():
    result = run(MANAGED_2026_10_13)
    status = {g: v["status"] for g, v in result["gates"].items()}
    assert status == {"db_git_digest_parity": "VERIFIED", "attempt_9_absent": "VERIFIED",
                      "metrics_uncontaminated": "VERIFIED", "features_uncontaminated": "VERIFIED",
                      "identity_validation": "VERIFIED", "retention_guard": "FAIL",
                      "canonical_uncontaminated": "FAIL"}
    assert result["verified"] == 5
    assert result["gates"]["retention_guard"]["evidence"]["deletion_metadata_mismatch"] == 1
    canonical = result["gates"]["canonical_uncontaminated"]
    assert canonical["reason"] == "UNVERIFIED_CANONICAL_ROWS_PRECEDE_PROVENANCE"
    assert canonical["evidence"]["strict_provenance_violations"] == 1
    assert canonical["evidence"]["canonical_rows"] == 1
    assert canonical["evidence"]["admission_authorized_rows"] == [0]


def bad(path, value):
    s = copy.deepcopy(MANAGED_2026_10_13)
    node = s
    for key in path[:-1]:
        node = node[key]
    node[path[-1]] = value
    return s


def test_every_gate_fails_on_its_own_contradiction():
    cases = [
        (("mapping_release", "inventory_digests"), ["0" * 64], "db_git_digest_parity"),
        (("mapping_release", "authoritative_releases"), 2, "db_git_digest_parity"),
        (("mapping_release", "authorized_counts"), [1], "db_git_digest_parity"),
        (("mapping_release", "inventory_rows"), 104, "db_git_digest_parity"),
        (("attempts", "jobs_attempt_9_or_more"), 1, "attempt_9_absent"),
        (("retention", "deletion_metadata_mismatch"), 1, "retention_guard"),
        (("derived_rows", "match_metrics"), 3, "metrics_uncontaminated"),
        (("derived_rows", "match_features"), 1, "features_uncontaminated"),
        (("execution_identity", "conflicting_executions"), 1, "identity_validation"),
        (("retention", "deletion_failed"), 2, "retention_guard"),
    ]
    for path, value, gate in cases:
        snapshot = bad(path, value)
        if gate == "attempt_9_absent":
            snapshot["attempts"]["max_attempt_number"] = 9
        if gate == "identity_validation":
            snapshot["execution_identity"]["ledger_rows"] = 2
        assert run(snapshot)["gates"][gate]["status"] == "FAIL", (path, value)


def test_booleans_negatives_and_wrong_shapes_are_never_verified():
    # False == 0 in Python: a boolean must not pass a zero-count rule.
    for path, gate in ((("attempts", "jobs_attempt_9_or_more"), "attempt_9_absent"),
                       (("derived_rows", "match_metrics"), "metrics_uncontaminated"),
                       (("derived_rows", "match_features"), "features_uncontaminated"),
                       (("execution_identity", "conflicting_executions"), "identity_validation"),
                       (("retention", "deletion_failed"), "retention_guard"),
                       (("retention", "deletion_metadata_mismatch"), "retention_guard")):
        for value in (False, 0.0, "0", -1, [0]):
            assert run(bad(path, value))["gates"][gate]["status"] == "NOT_PROVEN", (path, value)
    owners = {"attempts": ("attempt_9_absent",), "derived_rows": ("metrics_uncontaminated", "features_uncontaminated"),
              "execution_identity": ("identity_validation",), "retention": ("retention_guard",),
              "canonical": ("canonical_uncontaminated",), "mapping_release": ("db_git_digest_parity",)}
    for section, gates in owners.items():
        for value in ("0", [], None, 0):
            result = run(bad((section,), value))  # must not raise
            assert all(result["gates"][g]["status"] != "VERIFIED" for g in gates), (section, value)


def test_contradictory_counts_are_not_proven():
    cases = [
        (("attempts", "max_attempt_number"), 9),          # no job >= 9 yet the maximum is 9
        (("attempts", "max_attempt_number"), None),
        (("execution_identity", "ledger_rows"), None),
    ]
    for path, value in cases:
        gate = {"attempts": "attempt_9_absent", "execution_identity": "identity_validation"}[path[0]]
        assert run(bad(path, value))["gates"][gate]["status"] == "NOT_PROVEN", (path, value)
    conflicting = bad(("execution_identity", "conflicting_executions"), 2)
    assert run(conflicting)["gates"]["identity_validation"]["status"] == "NOT_PROVEN"  # 2 conflicts in 0 rows


def test_missing_values_are_never_verified():
    for path, gate in ((("attempts", "jobs_attempt_9_or_more"), "attempt_9_absent"),
                       (("derived_rows", "match_metrics"), "metrics_uncontaminated"),
                       (("execution_identity", "conflicting_executions"), "identity_validation"),
                       (("retention", "deletion_metadata_mismatch"), "retention_guard")):
        assert run(bad(path, None))["gates"][gate]["status"] == "NOT_PROVEN"


def test_an_unusable_snapshot_proves_nothing():
    cases = [
        (bad(("schema_version",), 2), NOW, RECORDER, "SNAPSHOT_SCHEMA_UNKNOWN"),
        (bad(("digest",), "x"), NOW, RECORDER, "SNAPSHOT_DIGEST_MISSING"),
        (bad(("snapshot_at",), "yesterday"), NOW, RECORDER, "SNAPSHOT_TIME_INVALID"),
        (MANAGED_2026_10_13, NOW - 3600, RECORDER, "SNAPSHOT_TIME_INVALID"),
        (MANAGED_2026_10_13, NOW + ms.MAX_AGE_SECONDS, RECORDER, "SNAPSHOT_STALE"),
        (MANAGED_2026_10_13, NOW, "16ce9356d1fab53fa323cae8544feabe", "SNAPSHOT_FROM_UNEXPECTED_DATABASE_STATE"),
        (None, NOW, RECORDER, "SNAPSHOT_SCHEMA_UNKNOWN"),
    ]
    for snapshot, now, recorder, problem in cases:
        result = run(snapshot, now, recorder)
        assert result["snapshot_problem"] == problem
        assert {v["status"] for v in result["gates"].values()} == {"NOT_PROVEN"}


def test_strict_provenance_rule_fails_on_the_existing_unverified_row():
    result = run(MANAGED_2026_10_13)["gates"]["canonical_uncontaminated"]
    assert ms.CANONICAL_RULE == "STRICT_PROVENANCE"
    assert result["status"] == "FAIL"
    assert result["reason"] == "UNVERIFIED_CANONICAL_ROWS_PRECEDE_PROVENANCE"
    assert result["evidence"]["strict_provenance_violations"] == 1


def canonical_case(**changes):
    snapshot = copy.deepcopy(MANAGED_2026_10_13)
    snapshot["canonical"].update(changes)
    return run(snapshot)["gates"]["canonical_uncontaminated"]


def test_strict_provenance_passes_only_when_no_canonical_row_exists():
    result = canonical_case(matches_by_status={}, matches_with_status=0,
                            matches_created_before_first_verified_provenance=0)
    assert (result["status"], result["reason"]) == ("VERIFIED", "NO_CANONICAL_ROWS")
    no_provenance = canonical_case(matches_by_status={}, matches_with_status=0, first_verified_provenance_at=None,
                                   matches_created_before_first_verified_provenance=0)
    assert no_provenance["status"] == "VERIFIED"


def test_a_canonical_row_after_the_first_provenance_still_fails_for_lack_of_a_link():
    # The only VERIFIED provenance may belong to another runtime; nothing links the row to it.
    result = canonical_case(matches_created_before_first_verified_provenance=0)
    assert (result["status"], result["reason"]) == ("FAIL", "CANONICAL_ROWS_WITHOUT_PROVENANCE_LINK")


def test_missing_or_invalid_canonical_evidence_is_not_proven():
    for key in ("matches_created_before_first_verified_provenance", "matches_with_status"):
        for value in (None, "0", -1, True, 0.0):
            result = canonical_case(**{key: value})
            assert (result["status"], result["reason"]) == ("NOT_PROVEN", "CANONICAL_PROVENANCE_EVIDENCE_MISSING"), (key, value)
    for value in (None, [], {"partial": "1"}, {"partial": True}):
        assert canonical_case(matches_by_status=value)["status"] == "NOT_PROVEN", value
    assert canonical_case(first_verified_provenance_at=5)["status"] == "NOT_PROVEN"


def test_contradictory_canonical_evidence_is_not_proven():
    cases = [
        dict(matches_created_before_first_verified_provenance=2),                     # more violations than rows
        dict(matches_by_status={"partial": 2}),                                        # status breakdown != total
        dict(matches_with_status=0, matches_created_before_first_verified_provenance=0),  # breakdown says 1
        dict(first_verified_provenance_at=None, matches_created_before_first_verified_provenance=0),  # all rows precede none
    ]
    for changes in cases:
        result = canonical_case(**changes)
        assert (result["status"], result["reason"]) == ("NOT_PROVEN", "CANONICAL_EVIDENCE_CONTRADICTORY"), changes


def test_the_sql_is_read_only_and_least_privilege():
    sql = (ROOT / "scripts/predem/managed_snapshot.sql").read_text()
    body = sql[sql.index("$snapshot$") + 10:sql.rindex("$snapshot$")]
    code = re.sub(r"'(?:[^']|'')*'", "''", re.sub(r"--[^\n]*", "", body))
    assert not re.search(r"\b(INSERT|UPDATE|DELETE|TRUNCATE|MERGE|CREATE|DROP|ALTER|GRANT|REVOKE|COPY|EXECUTE)\b", code, re.I)
    assert "STABLE" in sql and "SECURITY DEFINER" in sql and "SET search_path = ''" in sql
    assert "REVOKE ALL ON FUNCTION public.h3e_predem_managed_snapshot() FROM PUBLIC, anon, authenticated;" in sql
    assert "GRANT EXECUTE ON FUNCTION public.h3e_predem_managed_snapshot() TO service_role;" in sql
    # aggregates only: no column that could carry personal data is selected
    for column in ("user_id", "email", "storage_path", "payload", "secret", "external_match_id"):
        assert column not in body


def test_the_migration_is_exactly_the_reviewed_sql():
    migration = ROOT / "supabase/migrations/20261013120000_h3e_predem_managed_snapshot.sql"
    assert migration.read_text() == (ROOT / "scripts/predem/managed_snapshot.sql").read_text()
