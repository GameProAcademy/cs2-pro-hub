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
    # Schema 4 (gate semantics v2): the schema-3 observation of 2026-10-13 plus the v2 fields,
    # all zero then (no registry row, no derived row, no eligible row with lineage).
    "attempts": {"jobs_attempt_9_or_more": 0, "max_attempt_number": 8, "jobs_attempt_9_or_more_authorized": 0,
                 "forensic_replays_attempt_9_or_more": 0, "authorization_rows": 0,
                 "authorization_rows_not_matching_job": 0},
    "canonical": {"first_verified_provenance_at": "2026-10-05T03:58:32.676222+00:00", "matches_by_status": {"partial": 1},
                  "matches_created_before_first_verified_provenance": 1, "matches_with_status": 1,
                  "unquarantined_with_status_and_verified_lineage": 0,
                  # Schema v3: the quarantine exists (migration applied) but holds no row yet.
                  "quarantine": {"quarantined_matches": 0, "quarantined_with_status": 0, "unquarantined_with_status": 1,
                                 "unquarantined_created_before_first_verified_provenance": 1,
                                 "quarantined_completed": 0, "quarantined_derived_rows": 0,
                                 "guards": {g: True for g in ms.QUARANTINE_GUARDS}}},
    "database": {"migration_head": "20261012100000", "name": "postgres", "recorder_md5": RECORDER, "server_version": "17.6"},
    "derived_rows": {"match_features": 0, "match_metrics": 0, "match_features_with_verified_lineage": 0,
                     "match_metrics_with_verified_lineage": 0},
    "digest": "f8293b7c4c6ee3ae8bfd40928d1b0bbd027748936439d68421318bbcfb73418a",
    "execution_identity": {"conflicting_executions": 0, "ledger_rows": 0},
    "mapping_release": {"authoritative_releases": 1, "authorized_counts": [0], "generic_counts": [0],
                        "inventory_digests": [ms.INVENTORY_DIGEST], "inventory_rows": 105,
                        "matrix_digests": [ms.MATRIX_DIGEST], "row_counts": [105]},
    "retention": {"active_demos": 0, "deletion_attempts": 0, "deletion_eligible": 12, "deletion_failed": 0,
                  "deletion_metadata_mismatch": 1, "deletion_verified": 0, "expired_demos": 12, "terminal_demos": 12,
                  "total_demo_jobs": 12},
    "schema_version": 4, "snapshot_at": "2026-10-13T03:25:01.079304Z",
    # The newest of the 3 VERIFIED rows observed read-only (historical deployment 1b5778de).
    "provenance": {"verified_rows": 3, "latest": [{
        "created_at": "2026-10-06T09:27:45.784091Z", "deployment_id": "1b5778de-3eaf-46f1-9ea5-cba381d95313",
        "railway_project_id": "aa2176ec-0e35-45f0-8cfa-9f8c0707dca4",
        "railway_service_id": "706fa246-a263-484f-a986-c74516be862b",
        "railway_environment_id": "2385d707-795d-4e32-a00b-0afaba0a9b7e",
        "railway_branch": "infra/cs2-parser-worker-v8", "git_commit": "5703b1d88f21ee57fdd1d83722edf30e0f0c6f76",
        "deployment_source_commit": "91aeee853200d0f461d0d36af1781d7fdfa40941", "deployment_status": "SUCCESS",
        "semantic_revision": "git:5703b1d88f21ee57fdd1d83722edf30e0f0c6f76",
        "build_revision": "git:5703b1d88f21ee57fdd1d83722edf30e0f0c6f76",
        "verification_method": "GITHUB_ACTIONS_SIGNED_ATTESTATION_V3", "attestation_version": 3,
        "signature_is_hmac_sha256_hex": True, "attestor_provider": "github_actions_oidc",
        "workflow_event": "workflow_dispatch",
        "workflow_ref": "GameProAcademy/cs2-pro-hub/.github/workflows/parser-runtime-attestation.yml@refs/heads/main",
        "workflow_source_sha": "3070d8bae6c3f02093bbb2595138c913646c2e31", "workflow_run_id": "1",
        "critical_hashes": {f"services/cs2-demo-parser/{n}": {"observed": b, "match": True} for n, b in (
            ("parser.py", "9d21670e47ddf330881e95a9d78c19074ccc0aea"), ("adapter.py", "34ce0f196a0ff86f5452c0e8b1f078f88f9b0c71"),
            ("worker.py", "50a53b607d26f00b4de05c5e8998611959e27bd1"), ("raw_evidence.py", "750195c1218abd53cfc77b6e8d2fb4a88e31579e"),
            ("settings.py", "35eecfb06223812137a4a2f17114aae57cb7fe54"))}}]},
}
# The active runtime after the R5.8.10 re-pin (deployment 25df86c3).
ACTIVE = {
    "deployment_id": "25df86c3-22e1-4986-9b91-cdabe54535c5", "project_id": "aa2176ec-0e35-45f0-8cfa-9f8c0707dca4",
    "service_id": "706fa246-a263-484f-a986-c74516be862b", "environment_id": "2385d707-795d-4e32-a00b-0afaba0a9b7e",
    "branch": "main", "semantic_commit": "60099ed3eaf959d888762bf55043255a63a6a766",
    "build_commit": "60099ed3eaf959d888762bf55043255a63a6a766", "deployment_created_at": "2026-10-14T09:13:00.331Z",
    "workflow_source_sha": "523cee5b0fecc21c7ce2b5f538b42670eec3fed1",
    "workflow_ref": "GameProAcademy/cs2-pro-hub/.github/workflows/parser-runtime-attestation.yml@refs/heads/main",
    "critical_hashes": {f"services/cs2-demo-parser/{n}": b for n, b in (
        ("parser.py", "981f6261c7e38334dfab5c93088e9d5ad1f56f6e"), ("adapter.py", "34ce0f196a0ff86f5452c0e8b1f078f88f9b0c71"),
        ("worker.py", "ecaac3968d68e1ed8fc03f8dfea42c223869f473"), ("raw_evidence.py", "ec28b075f9726e5c4cdb97f5820f4402bca23eae"),
        ("settings.py", "dc76db86c9b0b8c0916d58501ae0c21af95dfe38"))},
}
NOW = datetime.fromisoformat("2026-10-13T03:30:00+00:00").timestamp()


def run(snapshot, now=NOW, recorder=RECORDER, runtime=ACTIVE):
    return ms.evaluate(snapshot, now=now, expected_recorder_md5=recorder, active_runtime=runtime)


def test_the_managed_observation_of_2026_10_13():
    result = run(MANAGED_2026_10_13)
    status = {g: v["status"] for g, v in result["gates"].items()}
    assert status == {"db_git_digest_parity": "VERIFIED", "attempt_9_absent": "VERIFIED",
                      "metrics_uncontaminated": "VERIFIED", "features_uncontaminated": "VERIFIED",
                      "identity_validation": "VERIFIED", "retention_guard": "FAIL",
                      "canonical_uncontaminated": "FAIL", "provenance_verified": "NOT_PROVEN",
                      "hmac_configured": "NOT_PROVEN", "oidc_operational": "NOT_PROVEN"}
    # Three VERIFIED rows exist, none for the active deployment: historical rows never count.
    assert result["gates"]["provenance_verified"]["reason"] == "NO_VERIFIED_ATTESTATION_OF_ACTIVE_RUNTIME"
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
        (bad(("schema_version",), 1), NOW, RECORDER, "SNAPSHOT_SCHEMA_UNKNOWN"),
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


def quarantine(**changes):
    q = copy.deepcopy(MANAGED_2026_10_13["canonical"]["quarantine"])
    q.update(changes)
    return q


NO_ROWS = dict(matches_by_status={}, matches_with_status=0, matches_created_before_first_verified_provenance=0)
EMPTY_Q = dict(unquarantined_with_status=0, unquarantined_created_before_first_verified_provenance=0)


def test_strict_provenance_passes_only_when_no_canonical_row_exists():
    result = canonical_case(**NO_ROWS, quarantine=quarantine(**EMPTY_Q))
    assert (result["status"], result["reason"]) == ("VERIFIED", "NO_CANONICAL_ROWS")
    no_provenance = canonical_case(**NO_ROWS, first_verified_provenance_at=None, quarantine=quarantine(**EMPTY_Q))
    assert no_provenance["status"] == "VERIFIED"


def test_a_canonical_row_after_the_first_provenance_still_fails_without_verified_lineage():
    # The only VERIFIED provenance may belong to another runtime; nothing links the row to it.
    result = canonical_case(matches_created_before_first_verified_provenance=0,
                            quarantine=quarantine(unquarantined_created_before_first_verified_provenance=0))
    assert (result["status"], result["reason"]) == ("FAIL", "CANONICAL_ROWS_WITHOUT_VERIFIED_LINEAGE")
    assert result["evidence"]["v1"] == {"eligible_rows_counted_as_contaminated": 1}


def test_v2_an_eligible_row_with_verified_lineage_is_clean():
    result = canonical_case(matches_created_before_first_verified_provenance=0,
                            unquarantined_with_status_and_verified_lineage=1,
                            quarantine=quarantine(unquarantined_created_before_first_verified_provenance=0))
    assert (result["status"], result["reason"]) == ("VERIFIED", "ELIGIBLE_ROWS_HAVE_VERIFIED_LINEAGE")
    assert result["evidence"]["semantics"] == "STRICT_PROVENANCE_VERIFIED_LINEAGE_V2"
    # A broken guard still voids it, lineage or not.
    broken = canonical_case(matches_created_before_first_verified_provenance=0,
                            unquarantined_with_status_and_verified_lineage=1,
                            quarantine=quarantine(unquarantined_created_before_first_verified_provenance=0,
                                                  guards={g: False for g in ms.QUARANTINE_GUARDS}))
    assert broken["status"] == "FAIL"


def test_v2_lineage_cannot_excuse_a_row_that_precedes_provenance_or_exceed_the_rows():
    # The 2026-09-11 row precedes every VERIFIED provenance: lineage is impossible, and a claim of it contradicts.
    assert canonical_case(unquarantined_with_status_and_verified_lineage=1)["status"] == "NOT_PROVEN"
    for value in (None, 2, -1, True, "1"):
        assert canonical_case(unquarantined_with_status_and_verified_lineage=value)["status"] == "NOT_PROVEN", value


# The partial row of 2026-09-11 once registered in public.canonical_match_quarantine.
QUARANTINED = dict(quarantined_matches=1, quarantined_with_status=1, **EMPTY_Q)


def test_a_preserved_row_is_ineligible_only_when_quarantined_and_every_guard_is_enforced():
    result = canonical_case(quarantine=quarantine(**QUARANTINED))
    assert (result["status"], result["reason"]) == ("VERIFIED", "ONLY_QUARANTINED_CANONICAL_ROWS")
    # The row is still counted: it is preserved, not hidden.
    assert result["evidence"]["canonical_rows"] == 1 and result["evidence"]["quarantined_rows"] == 1
    assert result["evidence"]["strict_provenance_violations"] == 1 and result["evidence"]["eligible_rows"] == 0


def test_a_missing_disabled_or_unknown_guard_voids_the_quarantine():
    guards = MANAGED_2026_10_13["canonical"]["quarantine"]["guards"]
    for name in sorted(guards):
        for broken in ({k: v for k, v in guards.items() if k != name}, {**guards, name: False}, {**guards, name: 1}):
            result = canonical_case(quarantine=quarantine(**QUARANTINED, guards=broken))
            assert (result["status"], result["reason"]) == ("FAIL", "CANONICAL_QUARANTINE_NOT_ENFORCED"), name
    extra = canonical_case(quarantine=quarantine(**QUARANTINED, guards={**guards, "x:y": True}))
    assert extra["reason"] == "CANONICAL_QUARANTINE_NOT_ENFORCED"
    # Even with no canonical row, an unenforced quarantine is not evidence of anything.
    empty = canonical_case(**NO_ROWS, quarantine=quarantine(**EMPTY_Q, guards={}))
    assert (empty["status"], empty["reason"]) == ("FAIL", "CANONICAL_QUARANTINE_NOT_ENFORCED")


def test_a_promoted_or_derived_quarantined_row_fails():
    promoted = canonical_case(matches_by_status={"completed": 1},
                              quarantine=quarantine(**QUARANTINED, quarantined_completed=1))
    assert (promoted["status"], promoted["reason"]) == ("FAIL", "QUARANTINED_ROW_PROMOTED")
    derived = canonical_case(quarantine=quarantine(**QUARANTINED, quarantined_derived_rows=2))
    assert (derived["status"], derived["reason"]) == ("FAIL", "QUARANTINED_ROW_HAS_DERIVED_ROWS")


def test_an_eligible_row_next_to_a_quarantined_one_still_fails():
    result = canonical_case(matches_by_status={"partial": 2}, matches_with_status=2,
                            matches_created_before_first_verified_provenance=2,
                            quarantine=quarantine(quarantined_matches=1, quarantined_with_status=1,
                                                  unquarantined_with_status=1,
                                                  unquarantined_created_before_first_verified_provenance=1))
    assert (result["status"], result["reason"]) == ("FAIL", "UNVERIFIED_CANONICAL_ROWS_PRECEDE_PROVENANCE")


def test_missing_or_inconsistent_quarantine_evidence_is_not_proven():
    for value in (None, [], "x", {}):
        assert canonical_case(quarantine=value)["reason"] == "CANONICAL_QUARANTINE_EVIDENCE_MISSING", value
    for key in ("quarantined_matches", "quarantined_with_status", "unquarantined_with_status",
                "unquarantined_created_before_first_verified_provenance", "quarantined_completed",
                "quarantined_derived_rows"):
        for value in (None, True, -1, "0", 0.0):
            result = canonical_case(quarantine=quarantine(**{**QUARANTINED, key: value}))
            assert (result["status"], result["reason"]) == ("NOT_PROVEN", "CANONICAL_QUARANTINE_EVIDENCE_MISSING"), (key, value)
    assert canonical_case(quarantine=quarantine(**{**QUARANTINED, "guards": None}))["status"] == "NOT_PROVEN"
    contradictions = [
        dict(QUARANTINED, quarantined_with_status=0),                      # quarantined + eligible != rows
        dict(QUARANTINED, unquarantined_with_status=1),                    # 1 + 1 != 1
        dict(QUARANTINED, quarantined_matches=0),                          # more rows than registry entries
        dict(QUARANTINED, quarantined_completed=2),                        # more promoted than quarantined
        dict(unquarantined_with_status=1, unquarantined_created_before_first_verified_provenance=2,
             quarantined_with_status=0),                                   # more eligible violations than rows
    ]
    for changes in contradictions:
        result = canonical_case(quarantine=quarantine(**changes))
        assert (result["status"], result["reason"]) == ("NOT_PROVEN", "CANONICAL_EVIDENCE_CONTRADICTORY"), changes


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
    # aggregates and identities only: no column that could carry personal data,
    # an attestation body, a nonce or a signature value is selected
    selected = re.sub(r"--[^\n]*", "", body)
    for column in ("user_id", "email", "storage_path", "payload", "secret", "external_match_id", "nonce"):
        assert column not in selected
    assert selected.count("attestation_signature") == 1
    assert "p.attestation_signature ~ '^[0-9a-f]{64}$'" in selected


def test_the_migration_is_exactly_the_reviewed_sql():
    migration = ROOT / "supabase/migrations/20261014220100_h3e_predem_managed_snapshot_v4.sql"
    assert migration.read_text() == (ROOT / "scripts/predem/managed_snapshot.sql").read_text()


def test_the_snapshot_checks_exactly_the_guards_the_quarantine_migration_installs():
    sql = (ROOT / "scripts/predem/managed_snapshot.sql").read_text()
    listed = set(re.findall(r"\('([a-z_]+)', '([a-z_]+)', '[a-z_]+'\)", sql))
    assert {f"{t}:{g}" for t, g in listed} == ms.QUARANTINE_GUARDS
    migration = (ROOT / "supabase/migrations/20261014120000_h3e_canonical_match_quarantine.sql").read_text()
    for table in ms.GUARDED_TABLES:
        assert f"'{table}'" in migration
    assert "CREATE TRIGGER canonical_match_quarantine_immutable" in migration
    assert "CREATE TRIGGER canonical_match_quarantine_no_truncate" in migration


def active_row(**changes):
    row = {"created_at": "2026-10-14T10:00:00.000000Z", "deployment_id": ACTIVE["deployment_id"],
           "railway_project_id": ACTIVE["project_id"], "railway_service_id": ACTIVE["service_id"],
           "railway_environment_id": ACTIVE["environment_id"], "railway_branch": "main",
           "git_commit": ACTIVE["semantic_commit"], "deployment_source_commit": ACTIVE["build_commit"],
           "deployment_status": "SUCCESS", "semantic_revision": f"git:{ACTIVE['semantic_commit']}",
           "build_revision": f"git:{ACTIVE['build_commit']}", "verification_method": ms.VERIFICATION_METHOD,
           "attestation_version": 3, "signature_is_hmac_sha256_hex": True, "attestor_provider": "github_actions_oidc",
           "workflow_event": "workflow_dispatch", "workflow_ref": ACTIVE["workflow_ref"],
           "workflow_source_sha": ACTIVE["workflow_source_sha"], "workflow_run_id": "42",
           "critical_hashes": {p: {"observed": b, "match": True} for p, b in ACTIVE["critical_hashes"].items()}}
    row.update(changes)
    return row


def with_rows(*rows):
    snapshot = copy.deepcopy(MANAGED_2026_10_13)
    snapshot["provenance"] = {"verified_rows": 3 + len(rows), "latest": list(rows) + snapshot["provenance"]["latest"]}
    return run(snapshot)["gates"]


def test_a_verified_attestation_of_the_active_runtime_proves_the_three_gates():
    gates = with_rows(active_row())
    assert {g: gates[g]["status"] for g in ("provenance_verified", "hmac_configured", "oidc_operational")} == {
        "provenance_verified": "VERIFIED", "hmac_configured": "VERIFIED", "oidc_operational": "VERIFIED"}


def test_any_identity_difference_or_an_older_row_never_counts():
    blob = "services/cs2-demo-parser/worker.py"
    for changes in (dict(deployment_id="c0aa8a55-a2a8-43e4-924e-0966171cddcf"), dict(railway_branch="infra/cs2-parser-worker-v8"),
                    dict(git_commit="c8c6d6ec0fdc8c6b9a8fb243d84797ee07a0354d"),
                    dict(build_revision="git:10815fb44e165963adfaf07f71c474ca628f4b7f"),
                    dict(deployment_source_commit="91aeee853200d0f461d0d36af1781d7fdfa40941"),
                    dict(deployment_status="REMOVED"), dict(workflow_source_sha="3070d8bae6c3f02093bbb2595138c913646c2e31"),
                    dict(verification_method="MANUAL"), dict(created_at="2026-10-13T08:00:00.000000Z"),
                    dict(critical_hashes={**active_row()["critical_hashes"], blob: {"observed": "50a53b607d26f00b4de05c5e8998611959e27bd1", "match": True}}),
                    dict(critical_hashes={**active_row()["critical_hashes"], blob: {"observed": ACTIVE["critical_hashes"][blob], "match": False}})):
        gates = with_rows(active_row(**changes))
        assert gates["provenance_verified"]["status"] == "NOT_PROVEN", changes


def test_hmac_and_oidc_need_their_own_evidence_on_the_matching_row():
    gates = with_rows(active_row(signature_is_hmac_sha256_hex=False, workflow_event="push"))
    assert gates["provenance_verified"]["status"] == "VERIFIED"
    assert gates["hmac_configured"]["status"] == "NOT_PROVEN"
    assert gates["oidc_operational"]["status"] == "NOT_PROVEN"


def test_missing_runtime_pins_or_provenance_section_prove_nothing():
    assert run(MANAGED_2026_10_13, runtime=None)["gates"]["provenance_verified"]["reason"] == "ACTIVE_RUNTIME_PINS_NOT_SUPPLIED"
    for value in (None, [], {"latest": "x", "verified_rows": 1}, {"latest": [], "verified_rows": True}):
        gates = run(bad(("provenance",), value))["gates"]
        assert {gates[g]["status"] for g in ("provenance_verified", "hmac_configured", "oidc_operational")} == {"NOT_PROVEN"}


def test_the_activation_gate_derives_its_snapshot_pins_from_the_committed_spec():
    sys.path.insert(0, str(ROOT / "scripts/ci"))
    import h3e_activation_gate as gate
    pins = gate.snapshot_pins(ROOT)
    assert pins["recorder_md5"] == "4ee7be9d9d133adbeeafe6e6a5763112"
    runtime = pins["runtime"]
    assert runtime["deployment_id"] == "25df86c3-22e1-4986-9b91-cdabe54535c5"
    assert (runtime["semantic_commit"], runtime["build_commit"]) == (
        "60099ed3eaf959d888762bf55043255a63a6a766", "60099ed3eaf959d888762bf55043255a63a6a766")
    assert runtime["critical_hashes"] == ACTIVE["critical_hashes"]
    assert runtime["workflow_source_sha"] == ACTIVE["workflow_source_sha"]
    # The fixture of the active runtime is exactly what the gate will expect.
    assert {k: runtime[k] for k in ACTIVE} == ACTIVE


# ----- gate semantics v2 (docs/H3E_GATE_SEMANTICS_V2.md)

def attempts_case(**changes):
    snapshot = copy.deepcopy(MANAGED_2026_10_13)
    snapshot["attempts"].update(changes)
    return run(snapshot)["gates"]["attempt_9_absent"]


def test_v2_the_managed_attempts_of_2026_10_14_fail_until_the_owner_records_authorizations():
    # Read-only 2026-10-14: jobs e3f93688 (attempt 9) and 4b5e3530 (attempt 10), no registry row.
    result = attempts_case(jobs_attempt_9_or_more=2, max_attempt_number=10)
    assert (result["status"], result["reason"]) == ("FAIL", "UNAUTHORIZED_JOBS_AT_ATTEMPT_9_OR_MORE")
    assert result["evidence"]["unauthorized"] == 2
    assert result["evidence"]["v1"] == {"status": "FAIL", "reason": "JOBS_AT_ATTEMPT_9_OR_MORE"}
    assert result["evidence"]["semantics"] == "AUTHORIZED_ATTEMPTS_V2"


def test_v2_attempts_are_verified_only_when_every_one_is_authorized_by_identity():
    ok = attempts_case(jobs_attempt_9_or_more=2, max_attempt_number=10, jobs_attempt_9_or_more_authorized=2,
                       authorization_rows=2)
    assert (ok["status"], ok["reason"]) == ("VERIFIED", "EVERY_JOB_AT_ATTEMPT_9_OR_MORE_AUTHORIZED")
    assert ok["evidence"]["v1"]["status"] == "FAIL"  # the v1 verdict stays visible
    partial = attempts_case(jobs_attempt_9_or_more=2, max_attempt_number=10, jobs_attempt_9_or_more_authorized=1,
                            authorization_rows=1)
    assert (partial["status"], partial["reason"]) == ("FAIL", "UNAUTHORIZED_JOBS_AT_ATTEMPT_9_OR_MORE")
    drifted = attempts_case(jobs_attempt_9_or_more=2, max_attempt_number=10, jobs_attempt_9_or_more_authorized=2,
                            authorization_rows=3, authorization_rows_not_matching_job=1)
    assert (drifted["status"], drifted["reason"]) == ("FAIL", "AUTHORIZATION_NO_LONGER_MATCHES_ITS_JOB")


def test_v2_contradictory_or_missing_attempt_evidence_is_not_proven():
    for changes in (dict(jobs_attempt_9_or_more_authorized=1),                       # more authorized than jobs
                    dict(forensic_replays_attempt_9_or_more=1),
                    dict(authorization_rows_not_matching_job=1),                     # stale rows > rows
                    dict(jobs_attempt_9_or_more=1, max_attempt_number=9, jobs_attempt_9_or_more_authorized=1),
                    dict(authorization_rows=None), dict(jobs_attempt_9_or_more_authorized=False)):
        assert attempts_case(**changes)["status"] == "NOT_PROVEN", changes


def derived_case(key, **values):
    snapshot = copy.deepcopy(MANAGED_2026_10_13)
    snapshot["derived_rows"].update(values)
    return run(snapshot)["gates"][key]


def test_v2_derived_rows_need_verified_lineage():
    for gate, key in (("metrics_uncontaminated", "match_metrics"), ("features_uncontaminated", "match_features")):
        clean = derived_case(gate, **{key: 10, f"{key}_with_verified_lineage": 10})
        assert (clean["status"], clean["reason"]) == ("VERIFIED", "EVERY_ROW_HAS_VERIFIED_LINEAGE")
        assert clean["evidence"]["v1"] == {"status": "FAIL", "reason": "ROWS_WITHOUT_PROVENANCE_LINK"}
        dirty = derived_case(gate, **{key: 10, f"{key}_with_verified_lineage": 9})
        assert (dirty["status"], dirty["reason"]) == ("FAIL", "ROWS_WITHOUT_VERIFIED_LINEAGE")
        assert dirty["evidence"]["rows_without_lineage"] == 1
        for bad_value in (11, None, -1, True):
            assert derived_case(gate, **{key: 10, f"{key}_with_verified_lineage": bad_value})["status"] == "NOT_PROVEN"


def test_v2_semantics_are_declared_in_every_evaluation():
    result = run(MANAGED_2026_10_13)
    assert result["gate_semantics"] == ms.GATE_SEMANTICS
    assert set(ms.GATE_SEMANTICS) == {"attempt_9_absent", "metrics_uncontaminated", "features_uncontaminated",
                                      "canonical_uncontaminated"}


def test_v2_sql_measures_lineage_through_every_link_and_excludes_quarantine():
    sql = (ROOT / "scripts/predem/managed_snapshot.sql").read_text()
    lineage = sql[sql.index("WITH lineage AS ("):sql.index("body AS (")]
    for link in ("j.upload_id = m.upload_id", "j.status = 'processed'", "j.demo_sha256 = m.content_fingerprint",
                 "a.audit_status = 'approved'", "a.status = 'ready'", "f.event_type = 'EXECUTION_FINISHED'",
                 "f.outcome_code = 'PARSE_SUCCEEDED'", "p.status = 'VERIFIED'",
                 "p.build_revision = 'git:' || f.worker_build_commit", "p.semantic_revision = f.parser_revision",
                 "p.created_at <= f.event_at", "public.canonical_match_quarantine"):
        assert link in lineage, link
    assert "'schema_version', 4" in sql
    # Every schema-3 measure is still emitted.
    v3 = (ROOT / "supabase/migrations/20261014120100_h3e_predem_managed_snapshot_v3.sql").read_text()
    import re as _re
    for key in set(_re.findall(r"'([a-z_0-9]+)', ", v3)):
        assert f"'{key}', " in sql, key
